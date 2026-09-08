"""A synthetic bounty market with hidden truth, for testing the policy.

The point of the simulation is not to predict what you will earn. It is to
answer one question that cannot be answered by staring at the code: does
ranking by expected value actually beat the obvious alternatives, when the
signals you rank on are noisy?

So every bounty here has a truth the hunter cannot see -- how long it really
takes, whether the maintainers really merge outside work, whether someone
else gets there first -- and the hunter only ever sees a noisy shadow of it,
exactly as they would on the real thing. If the ranking still wins under
those conditions, the ranking is doing real work.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from ..model import Bounty


@dataclass
class TrueBounty:
    """What the hunter sees, and what is actually the case."""
    bounty: Bounty
    true_hours: float           # what it really takes at baseline skill
    repo_pays_p: float          # P(a correct patch is merged and paid)
    competitors: int            # others attempting it in parallel
    repo_id: str = ""


@dataclass
class MarketConfig:
    bounties_per_week: float = 18.0
    weeks: int = 26
    #: payouts are heavy-tailed: many small, a few large
    payout_median: float = 180.0
    payout_sigma_log: float = 0.95
    #: hours are heavy-tailed too, and NOT strongly correlated with payout --
    #: this is the crux, and the reason "take the biggest" fails
    hours_median: float = 6.0
    hours_sigma_log: float = 0.85
    #: how much bigger payouts do track bigger jobs (0 = not at all)
    payout_hours_coupling: float = 0.35
    #: repos differ enormously in whether they merge outside work
    repo_pool: int = 40
    repo_pays_alpha: float = 1.4      # Beta(a,b) over repo payout reliability
    repo_pays_beta: float = 1.1
    #: how noisy the health sample is: how many outside PRs we get to see
    health_sample: int = 25
    #: competition scales with how attractive a bounty looks
    competition_base: float = 0.35
    competition_payout_slope: float = 0.9


class Market:
    def __init__(self, cfg: MarketConfig | None = None, seed: int = 0):
        self.cfg = cfg or MarketConfig()
        self.rng = random.Random(seed)
        self.now = datetime.now(timezone.utc)
        self.repos: dict[str, float] = {}
        for i in range(self.cfg.repo_pool):
            self.repos[f"org{i//8}/repo{i}"] = self.rng.betavariate(
                self.cfg.repo_pays_alpha, self.cfg.repo_pays_beta)
        self._n = 0

    # ------------------------------------------------------------------
    def _make(self, week: int) -> TrueBounty:
        cfg, rng = self.cfg, self.rng
        self._n += 1

        z = rng.gauss(0, 1)
        payout = cfg.payout_median * math.exp(cfg.payout_sigma_log * z)
        payout = max(25.0, min(payout, 8000.0))

        # Hours share only part of their randomness with payout. A big bounty
        # is somewhat more likely to be a big job, but only somewhat -- and
        # that gap is precisely where the edge lives.
        zh = (cfg.payout_hours_coupling * z
              + math.sqrt(max(0.0, 1 - cfg.payout_hours_coupling ** 2)) * rng.gauss(0, 1))
        hours = cfg.hours_median * math.exp(cfg.hours_sigma_log * zh)
        hours = max(0.5, min(hours, 90.0))

        repo = rng.choice(list(self.repos))
        pays = self.repos[repo]

        attractiveness = payout / max(hours, 1.0) / 40.0
        lam = cfg.competition_base + cfg.competition_payout_slope * attractiveness
        competitors = min(6, self._poisson(lam))

        age = rng.expovariate(1 / 45.0)
        created = self.now - timedelta(days=age)

        # The issue text carries a noisy hint of the true size. This is what
        # estimate_hours() reads, and it is deliberately imperfect.
        if hours < 3:
            body = "Steps to reproduce:\n```\nrun x\n```\nSmall fix, typo in the handler."
            labels = ("bug", "good first issue")
        elif hours < 10:
            body = "Steps to reproduce:\n```\nrun x\n```\nThe parser fails on empty input."
            labels = ("bug",)
        else:
            body = ("We should refactor and redesign this subsystem. "
                    "Investigate the race condition across platforms. " * 6)
            labels = ("refactor", "design")
        if rng.random() < 0.30:          # a third of issues are badly written
            body = "It's broken."
            labels = ()

        b = Bounty(
            source="sim", id=str(self._n), title=f"issue {self._n}",
            url=f"https://example.invalid/{self._n}", amount=payout,
            currency="EUR", repo=repo, labels=labels, body=body,
            created_at=created, updated_at=created,
            comments=self._poisson(2.0 + 6.0 * attractiveness),
            state="open",
        )
        if competitors and rng.random() < 0.55:
            # not every competitor announces themselves
            b.claimants = tuple(f"rival{i}" for i in range(min(competitors, 2)))
        return TrueBounty(bounty=b, true_hours=hours, repo_pays_p=pays,
                          competitors=competitors, repo_id=repo)

    def _poisson(self, lam: float) -> int:
        if lam <= 0:
            return 0
        ell, k, p = math.exp(-lam), 0, 1.0
        while True:
            p *= self.rng.random()
            if p <= ell:
                return k
            k += 1
            if k > 60:
                return k

    # ------------------------------------------------------------------
    def week(self, week: int) -> list[TrueBounty]:
        n = self._poisson(self.cfg.bounties_per_week)
        return [self._make(week) for _ in range(n)]

    def health_sample(self, repo: str) -> list[dict]:
        """A noisy public record of how this repo treats outside pull requests."""
        pays = self.repos[repo]
        n = self.cfg.health_sample
        prs = []
        for i in range(n):
            created = self.now - timedelta(days=self.rng.uniform(5, 300))
            merged = self.rng.random() < pays
            days = self.rng.expovariate(1 / 8.0) if merged else None
            prs.append({
                "author_association": "CONTRIBUTOR",
                "created_at": created.isoformat(),
                "merged_at": ((created + timedelta(days=days)).isoformat()
                              if merged else None),
                "comments": 1 if self.rng.random() < 0.6 else 0,
                "user": {"login": f"dev{i}"},
                "repo": repo,
            })
        return prs
