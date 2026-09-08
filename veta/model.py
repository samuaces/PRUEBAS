"""The objects VETA reasons about.

A bounty is a rare thing on the open internet: a task with the money already
posted and held in escrow, a scope someone else has written down, and a
public record of whether the people offering it actually pay. That makes it
the one zero-capital market where expected value is genuinely computable
instead of guessed at.

Everything here is normalised across sources so that an Algora bounty, a
Polar reward and a GitHub issue with a price in the title become the same
kind of record and can be ranked against each other.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone


def _now() -> datetime:
    return datetime.now(timezone.utc)


def parse_ts(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    s = str(value).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@dataclass
class Bounty:
    """One funded, publicly-scoped task."""
    source: str                     # algora | polar | github | manual
    id: str
    title: str
    url: str
    amount: float                   # in `currency`
    currency: str = "USD"
    repo: str = ""                  # owner/name
    language: str = ""
    labels: tuple[str, ...] = ()
    body: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None
    comments: int = 0
    participants: int = 0
    assignee: str | None = None
    #: people who have publicly said they are working on it
    claimants: tuple[str, ...] = ()
    state: str = "open"
    raw: dict = field(default_factory=dict)

    # ------------------------------------------------------------------
    @property
    def age_days(self) -> float:
        if not self.created_at:
            return 0.0
        return max(0.0, (_now() - self.created_at).total_seconds() / 86400.0)

    @property
    def stale_days(self) -> float:
        ref = self.updated_at or self.created_at
        if not ref:
            return 0.0
        return max(0.0, (_now() - ref).total_seconds() / 86400.0)

    @property
    def is_claimed(self) -> bool:
        return bool(self.assignee) or bool(self.claimants)

    def amount_eur(self, usd_eur: float = 0.92) -> float:
        if self.currency.upper() in ("EUR", "€"):
            return self.amount
        return self.amount * usd_eur

    def key(self) -> str:
        return f"{self.source}:{self.id}"

    def as_dict(self) -> dict:
        d = asdict(self)
        d["created_at"] = self.created_at.isoformat() if self.created_at else None
        d["updated_at"] = self.updated_at.isoformat() if self.updated_at else None
        d.pop("raw", None)
        return d


@dataclass
class RepoHealth:
    """Does this project actually merge outside contributions?

    This is the signal that decides whether you get paid, and almost nobody
    checks it before starting. You can write a perfect patch for a bounty and
    earn nothing because the maintainer has not merged an outside pull
    request in eight months. It is entirely visible in public data before you
    write a line.
    """
    repo: str
    sampled_prs: int = 0
    outside_prs: int = 0
    outside_merged: int = 0
    median_days_to_merge: float | None = None
    p90_days_to_merge: float | None = None
    days_since_last_outside_merge: float | None = None
    open_pr_backlog: int = 0
    maintainer_response_rate: float | None = None
    archived: bool = False
    error: str = ""

    @property
    def outside_merge_rate(self) -> float:
        """Fraction of outside PRs that ended up merged. The headline number."""
        if self.outside_prs <= 0:
            return 0.0
        return self.outside_merged / self.outside_prs

    @property
    def responsive(self) -> bool:
        d = self.days_since_last_outside_merge
        return d is not None and d <= 45.0

    def as_dict(self) -> dict:
        d = asdict(self)
        d["outside_merge_rate"] = self.outside_merge_rate
        return d


@dataclass
class Assessment:
    """A bounty, scored. This is what the CLI ranks and prints."""
    bounty: Bounty
    health: RepoHealth | None
    p_win: float                    # probability you get paid if you attempt it
    hours_estimate: float
    hours_low: float
    hours_high: float
    ev_eur: float                   # expected euros from one attempt
    ev_per_hour: float              # the number that decides everything
    downside_hours: float           # hours burned when you lose
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    verdict: str = ""

    def as_dict(self) -> dict:
        return {
            "bounty": self.bounty.as_dict(),
            "health": self.health.as_dict() if self.health else None,
            "p_win": self.p_win,
            "hours": [self.hours_low, self.hours_estimate, self.hours_high],
            "ev_eur": self.ev_eur,
            "ev_per_hour": self.ev_per_hour,
            "downside_hours": self.downside_hours,
            "reasons": self.reasons,
            "warnings": self.warnings,
            "verdict": self.verdict,
        }


# --------------------------------------------------------------------------
# Money extraction from free text -- sources are inconsistent about where the
# amount lives, so this has to be robust and conservative.
# --------------------------------------------------------------------------

# Word boundaries are useless next to "$", "€" and "/", because \b needs a
# word character on one side and these symbols are not. Lookaheads instead.
_AMOUNT_PATTERNS = [
    # $500, $1,500.00, USD 500
    (r"(?:USD|\$)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", "USD"),
    (r"([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:USD|dollars?)(?=\W|$)", "USD"),
    # 500€, €500, EUR 500, 300 euros
    (r"(?:EUR|€)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", "EUR"),
    (r"([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:EUR|€|euros?)(?=\W|$)", "EUR"),
]


def extract_amounts(text: str) -> list[tuple[float, str]]:
    """Every plausible money figure in the text, largest first.

    Ignores anything outside a sanity band, because issue bodies are full of
    numbers that are not prices -- version strings, error codes, line
    numbers, timeouts. A payout of 3 or of 250,000 is almost always one of
    those rather than an offer.
    """
    if not text:
        return []
    found: list[tuple[float, str]] = []
    seen: set[tuple[float, str]] = set()
    for pattern, currency in _AMOUNT_PATTERNS:
        for m in re.finditer(pattern, text, flags=re.IGNORECASE):
            raw = m.group(1).replace(",", "")
            try:
                value = float(raw)
            except ValueError:
                continue
            if not (5.0 <= value <= 100_000.0):
                continue
            if (value, currency) in seen:
                continue
            seen.add((value, currency))
            found.append((value, currency))
    found.sort(key=lambda t: -t[0])
    return found


def extract_amount(text: str) -> tuple[float, str] | None:
    """The single best guess at the payout, or None.

    Takes the largest figure. When several distinct amounts appear the guess
    is genuinely uncertain -- "$25 bounty + $50 bonus" could mean 25, 50 or
    75 -- so callers should check `extract_amounts` and warn rather than
    quietly betting hours on the optimistic reading.
    """
    found = extract_amounts(text)
    return found[0] if found else None


def amount_is_ambiguous(text: str) -> bool:
    return len(extract_amounts(text)) > 1


# Slash commands cannot use a leading \b for the same reason as "$" above.
_CLAIM_PATTERNS = [
    r"(?:^|\s)/attempt(?=\W|$)",
    r"(?:^|\s)/claim(?=\W|$)",
    r"\bi(?:'m| am|m)\s+(?:working|going to work)\s+on\s+(?:this|it)\b",
    r"\bi(?:'m| am|m)\s+on\s+(?:this|it)\b",
    r"\bcan i (?:take|work on|have) (?:this|it)\b",
    r"\b(?:taking|took) (?:this|it)\b",
    r"\bworking on (?:this|it)\b",
    r"\bassign (?:this |it )?to me\b",
    r"\bpicking (?:this|it) up\b",
    r"\bclaimed\b",
    r"\bstarted work(?:ing)? on (?:this|it)\b",
]


def looks_claimed(text: str) -> bool:
    """Has somebody publicly staked a claim in the thread?"""
    if not text:
        return False
    low = text.lower()
    return any(re.search(p, low) for p in _CLAIM_PATTERNS)
