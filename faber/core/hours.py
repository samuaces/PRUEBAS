"""The only asset you have when you have no money.

MONETA allocates euros. FABER allocates hours, and hours behave differently
in three ways that matter enough to need their own module:

  * You cannot borrow them. There is no leverage on a week.
  * You cannot lose more than you spend. The downside of an hour is the
    hour, which makes the risk side of the problem trivial and the
    opportunity-cost side of it everything.
  * They are not fungible over time. Forty hours this week and forty next
    week are not the same as eighty next week, because you have to eat in
    between. That constraint is what `survival.py` is about.

They also degrade. Sustained overwork lowers the value of the marginal hour,
so a scheduler that treats a 70-hour week as 70 usable hours is lying.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class TimeBudget:
    """How many hours a week you actually have, and what they are worth.

    `sustainable_h` is the level you can hold indefinitely. Above it you
    still produce, but each extra hour is worth less than the last and the
    deficit accumulates as fatigue, which then costs you hours back. The
    curve is deliberately gentle -- the point is not to model burnout
    precisely, it is to stop the scheduler from discovering that the optimal
    policy is to work 90 hours a week forever.
    """
    weekly_h: float = 20.0
    sustainable_h: float = 25.0
    #: value of the marginal hour once past `sustainable_h`, per extra hour
    fatigue_decay: float = 0.035
    #: fatigue recovers this fraction per week of rest below sustainable
    recovery: float = 0.25
    max_weekly_h: float = 70.0

    fatigue: float = 0.0        # 0 = fresh, 1 = fully spent

    def effective_hours(self, planned_h: float) -> float:
        """Usable hours out of `planned_h`, after fatigue and overwork."""
        planned = max(0.0, min(planned_h, self.max_weekly_h))
        over = max(0.0, planned - self.sustainable_h)
        # each hour past the sustainable line is worth exp(-decay * excess)
        overwork_yield = (1.0 - math.exp(-self.fatigue_decay * over)) / self.fatigue_decay \
            if self.fatigue_decay > 0 else over
        raw = min(planned, self.sustainable_h) + overwork_yield
        return raw * (1.0 - 0.45 * self.fatigue)

    #: fatigue accumulated per week, per hour worked past the sustainable line
    strain: float = 0.010

    def advance(self, worked_h: float) -> None:
        """Book a week of work and update fatigue.

        Mean-reverting, not a ramp. A given workload converges to a level of
        tiredness rather than grinding you to zero: sustained overwork of
        `over` hours settles at strain*over/recovery, and rest pulls it back.
        A runaway version would make the scheduler believe any hard week is
        permanently ruinous, which is both wrong and useless advice.
        """
        over = max(0.0, worked_h - self.sustainable_h)
        self.fatigue += self.strain * over - self.recovery * self.fatigue
        self.fatigue = max(0.0, min(1.0, self.fatigue))

    def equilibrium_fatigue(self, weekly_h: float) -> float:
        over = max(0.0, weekly_h - self.sustainable_h)
        return min(1.0, self.strain * over / max(self.recovery, 1e-9))

    def as_dict(self) -> dict:
        return {"weekly_h": self.weekly_h, "fatigue": self.fatigue,
                "effective": self.effective_hours(self.weekly_h)}


@dataclass
class HourLedger:
    """Where every hour went, and what it earned.

    This is the counterpart of MONETA's cash ledger. Nothing in FABER is
    allowed to claim an hour paid off without an entry here, because the
    entire system rests on comparing arms on measured EUR/hour rather than
    on how promising they felt.
    """
    hours_by_arm: dict[str, float] = field(default_factory=dict)
    earned_by_arm: dict[str, float] = field(default_factory=dict)
    setup_hours_by_arm: dict[str, float] = field(default_factory=dict)
    weeks: int = 0
    total_hours: float = 0.0
    total_earned: float = 0.0
    #: hours that produced nothing because they went into setup or a dud
    wasted_hours: float = 0.0

    def spend(self, arm: str, hours: float, setup: bool = False) -> None:
        if hours <= 0:
            return
        self.hours_by_arm[arm] = self.hours_by_arm.get(arm, 0.0) + hours
        self.total_hours += hours
        if setup:
            self.setup_hours_by_arm[arm] = \
                self.setup_hours_by_arm.get(arm, 0.0) + hours
            self.wasted_hours += hours

    def earn(self, arm: str, amount: float) -> None:
        self.earned_by_arm[arm] = self.earned_by_arm.get(arm, 0.0) + amount
        self.total_earned += amount

    def rate(self, arm: str) -> float:
        h = self.hours_by_arm.get(arm, 0.0)
        return self.earned_by_arm.get(arm, 0.0) / h if h > 0 else 0.0

    @property
    def overall_rate(self) -> float:
        return self.total_earned / self.total_hours if self.total_hours > 0 else 0.0

    def summary(self) -> dict:
        return {
            "weeks": self.weeks,
            "total_hours": self.total_hours,
            "total_earned": self.total_earned,
            "eur_per_hour": self.overall_rate,
            "setup_hours": dict(self.setup_hours_by_arm),
            "hours_by_arm": dict(self.hours_by_arm),
            "earned_by_arm": dict(self.earned_by_arm),
            "rate_by_arm": {a: self.rate(a) for a in self.hours_by_arm},
        }
