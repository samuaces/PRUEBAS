"""One season of bounty hunting, under a chosen selection policy.

Every policy gets the same market, the same hours, the same skill and the
same bail-out discipline, so the only thing being compared is which bounty
gets picked next. That isolation matters: it would be easy to make VETA look
good by giving the baselines no stopping rule and letting them grind, and
the result would mean nothing.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

from ..health import assess_repo
from ..score import ScoreConfig, WinModel, assess
from .market import Market, TrueBounty


@dataclass
class HunterConfig:
    weekly_hours: float = 20.0
    #: multiplier on the true hours: below 1 means faster than baseline, which
    #: is what working with a coding agent buys you
    skill_multiplier: float = 1.0
    #: stop at this multiple of your own estimate, whatever the policy
    bail_multiple: float = 2.0
    #: how much a competitor costs you when you both finish
    competitor_strength: float = 0.7
    min_ev_per_hour: float = 12.0
    #: policies may look at repo health; this is what checking one costs
    health_cost_h: float = 0.05


@dataclass
class SeasonResult:
    policy: str
    weeks: int
    hours_spent: float = 0.0
    hours_wasted: float = 0.0
    earned: float = 0.0
    attempts: int = 0
    wins: int = 0
    bailed: int = 0
    sniped: int = 0
    repo_refused: int = 0
    skipped_all: int = 0
    log: list[str] = field(default_factory=list)

    @property
    def eur_per_hour(self) -> float:
        return self.earned / self.hours_spent if self.hours_spent > 0 else 0.0

    @property
    def win_rate(self) -> float:
        return self.wins / self.attempts if self.attempts else 0.0

    def as_dict(self) -> dict:
        return {"policy": self.policy, "earned": self.earned,
                "hours": self.hours_spent, "eur_per_hour": self.eur_per_hour,
                "attempts": self.attempts, "wins": self.wins,
                "win_rate": self.win_rate, "bailed": self.bailed,
                "sniped": self.sniped, "repo_refused": self.repo_refused,
                "wasted_hours": self.hours_wasted}


# --------------------------------------------------------------------------
# Selection policies
# --------------------------------------------------------------------------

def _estimate(tb: TrueBounty) -> float:
    from ..score import estimate_hours
    return estimate_hours(tb.bounty)[1]


def policy_payout(cands, market, model, rng):
    """Take the biggest number. What most people actually do."""
    return sorted(cands, key=lambda t: -t.bounty.amount)


def policy_newest(cands, market, model, rng):
    """Take whatever just appeared, before anyone else does."""
    return sorted(cands, key=lambda t: t.bounty.age_days)


def policy_naive_rate(cands, market, model, rng):
    """Payout divided by your own time estimate. Smart, and still not enough:
    it never asks whether the project merges outside work."""
    return sorted(cands, key=lambda t: -(t.bounty.amount / max(_estimate(t), 0.5)))


def policy_random(cands, market, model, rng):
    out = list(cands)
    rng.shuffle(out)
    return out


def policy_veta(cands, market, model, rng):
    """The full assessment: payout x P(paid) / hours, health included."""
    scored = []
    for tb in cands:
        health = assess_repo(tb.repo_id, market.health_sample(tb.repo_id),
                             open_pr_count=20)
        a = assess(tb.bounty, health, model, ScoreConfig())
        scored.append((a.ev_per_hour, a, tb))
    scored.sort(key=lambda x: -x[0])
    return [tb for _, _, tb in scored], {id(tb): a for _, a, tb in scored}


POLICIES = {
    "veta (EV con salud del repo)": policy_veta,
    "mayor pago primero": policy_payout,
    "pago / horas estimadas": policy_naive_rate,
    "la mas reciente": policy_newest,
    "al azar": policy_random,
}


# --------------------------------------------------------------------------

def run_season(policy_name: str, seed: int, market_cfg=None,
               hunter_cfg: HunterConfig | None = None,
               use_ev_floor: bool = True) -> SeasonResult:
    from .market import Market, MarketConfig
    hcfg = hunter_cfg or HunterConfig()
    market = Market(market_cfg or MarketConfig(), seed=seed)
    rng = random.Random(seed * 7919 + 13)
    model = WinModel()
    fn = POLICIES[policy_name]

    res = SeasonResult(policy=policy_name, weeks=market.cfg.weeks)
    pool: list[TrueBounty] = []
    taken: set[str] = set()

    for week in range(market.cfg.weeks):
        pool.extend(market.week(week))
        pool = [t for t in pool if t.bounty.key() not in taken
                and t.bounty.age_days < 200]
        hours_left = hcfg.weekly_hours

        while hours_left > 0.5 and pool:
            ranked = fn(pool, market, model, rng)
            assessments = None
            if isinstance(ranked, tuple):
                ranked, assessments = ranked
            if not ranked:
                break

            tb = ranked[0]
            est = _estimate(tb)

            if policy_name.startswith("veta") and use_ev_floor and assessments:
                a = assessments.get(id(tb))
                if a is not None and a.ev_per_hour < hcfg.min_ev_per_hour:
                    res.skipped_all += 1
                    break            # nothing on the board is worth the hours

            taken.add(tb.bounty.key())
            pool = [t for t in pool if t is not tb]
            res.attempts += 1

            need = tb.true_hours * hcfg.skill_multiplier
            bail_at = est * hcfg.bail_multiple
            spend = min(need, bail_at, hours_left)
            hours_left -= spend
            res.hours_spent += spend

            if spend < need:
                # either bailed on the stop line, or the week ran out
                if need > bail_at:
                    res.bailed += 1
                    res.hours_wasted += spend
                    continue
                pool.append(tb)          # carry it into next week
                taken.discard(tb.bounty.key())
                continue

            if rng.random() >= tb.repo_pays_p:
                res.repo_refused += 1
                res.hours_wasted += spend
                continue

            p_first = 1.0 / (1.0 + hcfg.competitor_strength * tb.competitors)
            if rng.random() >= p_first:
                res.sniped += 1
                res.hours_wasted += spend
                continue

            res.wins += 1
            res.earned += tb.bounty.amount

    return res
