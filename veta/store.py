"""Your record. Without it, P(win) is a guess forever.

Everything VETA claims about a bounty rests on one number -- how often you
actually land the work you attempt -- and there is exactly one way to know
it: write down what happened, including the attempts you would rather
forget. The abandoned ones matter most, because they are the hours that cost
you money and produce no story.

Plain JSON on disk, no database, no account, nothing leaves the machine.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .score import BetaPosterior

DEFAULT_PATH = Path.home() / ".veta" / "record.json"

OUTCOMES = ("won", "lost", "abandoned", "in_progress", "skipped")


@dataclass
class Attempt:
    key: str                    # source:id
    title: str
    url: str
    repo: str
    amount_eur: float
    started_at: str
    hours_estimated: float
    outcome: str = "in_progress"
    hours_spent: float = 0.0
    paid_eur: float = 0.0
    finished_at: str | None = None
    note: str = ""

    @property
    def rate(self) -> float:
        return self.paid_eur / self.hours_spent if self.hours_spent > 0 else 0.0


class Record:
    def __init__(self, path: str | Path | None = None):
        self.path = Path(path or DEFAULT_PATH)
        self.attempts: list[Attempt] = []
        self.load()

    # ------------------------------------------------------------------
    def load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return
        self.attempts = [Attempt(**a) for a in data.get("attempts", [])]

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"version": 1, "attempts": [asdict(a) for a in self.attempts]}
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    # ------------------------------------------------------------------
    def start(self, assessment) -> Attempt:
        b = assessment.bounty
        existing = self.find(b.key())
        if existing:
            return existing
        a = Attempt(key=b.key(), title=b.title, url=b.url, repo=b.repo,
                    amount_eur=b.amount_eur(),
                    started_at=datetime.now(timezone.utc).isoformat(),
                    hours_estimated=assessment.hours_estimate)
        self.attempts.append(a)
        self.save()
        return a

    def find(self, key: str) -> Attempt | None:
        for a in self.attempts:
            if a.key == key:
                return a
        return None

    def finish(self, key: str, outcome: str, hours: float,
               paid: float = 0.0, note: str = "") -> Attempt | None:
        if outcome not in OUTCOMES:
            raise ValueError(f"outcome must be one of {OUTCOMES}")
        a = self.find(key)
        if a is None:
            return None
        a.outcome = outcome
        a.hours_spent = hours
        a.paid_eur = paid
        a.note = note
        a.finished_at = datetime.now(timezone.utc).isoformat()
        self.save()
        return a

    # ------------------------------------------------------------------
    def skill(self) -> BetaPosterior:
        """Your landing rate, learned from the record.

        An abandoned attempt counts as a loss. It has to: the hours were
        spent and no money arrived, and a model that forgives them would
        recommend the same trap again.
        """
        post = BetaPosterior()
        for a in self.attempts:
            if a.outcome == "won":
                post.update(True)
            elif a.outcome in ("lost", "abandoned"):
                post.update(False)
        return post

    def stats(self) -> dict:
        done = [a for a in self.attempts if a.outcome in ("won", "lost", "abandoned")]
        hours = sum(a.hours_spent for a in done)
        paid = sum(a.paid_eur for a in done)
        won = [a for a in done if a.outcome == "won"]
        est_err = [a.hours_spent / a.hours_estimated
                   for a in done if a.hours_estimated > 0 and a.hours_spent > 0]
        return {
            "attempts": len(done),
            "in_progress": sum(1 for a in self.attempts if a.outcome == "in_progress"),
            "won": len(won),
            "win_rate": len(won) / len(done) if done else 0.0,
            "hours_spent": hours,
            "earned_eur": paid,
            "eur_per_hour": paid / hours if hours > 0 else 0.0,
            "median_estimate_ratio": (sorted(est_err)[len(est_err) // 2]
                                      if est_err else None),
            "skill": self.skill().as_dict(),
        }
