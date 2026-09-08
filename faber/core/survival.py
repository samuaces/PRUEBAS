"""The constraint that makes this problem different from MONETA's.

An investor with a drawdown can wait. Someone with no capital and rent due
cannot: falling below zero is not a bad quarter, it is the end of the
experiment. Every clever thing the scheduler wants to do is subordinate to
staying solvent, and this module holds that veto.

It also computes the number the whole system exists to produce: how deep the
valley of a compounding arm is, and whether you can afford to cross it.
A compounding arm is not "better" or "worse" than a linear one in the
abstract. It is better if and only if your runway outlasts its valley. That
is a calculation, not a personality trait, and almost nobody does it.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class SurvivalConfig:
    #: what you must have to live each week. Set to 0 if something else
    #: (a job, a household, savings) already covers you -- that single number
    #: changes the correct strategy more than anything else in FABER.
    weekly_needs: float = 0.0
    #: cash you start with. The premise is that this is small or zero.
    starting_cash: float = 0.0
    #: never let projected cash fall below this
    floor: float = 0.0
    #: weeks of runway below which no hour may go to a compounding arm
    min_runway_weeks: float = 4.0
    #: fraction of hours that must stay on proven, paying-now arms while
    #: runway is thin, no matter how good the long game looks
    defensive_floor: float = 0.60


@dataclass
class SurvivalState:
    cash: float = 0.0
    week: int = 0
    broke_at: int | None = None
    lowest_cash: float = 0.0
    weeks_below_floor: int = 0
    history: list[float] = field(default_factory=list)


class SurvivalGovernor:
    """Absolute veto over the scheduler. Solvency first, growth second."""

    def __init__(self, cfg: SurvivalConfig | None = None):
        self.cfg = cfg or SurvivalConfig()
        self.state = SurvivalState(cash=self.cfg.starting_cash,
                                   lowest_cash=self.cfg.starting_cash)

    # ------------------------------------------------------------------
    @property
    def cash(self) -> float:
        return self.state.cash

    @property
    def runway_weeks(self) -> float:
        """How many weeks you could earn nothing and still eat."""
        if self.cfg.weekly_needs <= 0:
            return math.inf
        return max(0.0, self.state.cash / self.cfg.weekly_needs)

    @property
    def broke(self) -> bool:
        return self.state.broke_at is not None

    def settle_week(self, week: int, earned: float, spent: float) -> None:
        st = self.state
        st.week = week
        st.cash += earned - spent - self.cfg.weekly_needs
        st.history.append(st.cash)
        st.lowest_cash = min(st.lowest_cash, st.cash)
        if st.cash < self.cfg.floor:
            st.weeks_below_floor += 1
            if st.broke_at is None:
                st.broke_at = week

    def can_afford(self, amount: float) -> bool:
        """Do you have the cash to put this up front at all?"""
        return self.state.cash - amount >= self.cfg.floor

    # ------------------------------------------------------------------
    def defensive_pressure(self) -> float:
        """0 = comfortable, 1 = must earn this week.

        Scales smoothly with runway so the scheduler does not lurch between
        "build the future" and "panic" on a single week's noise.
        """
        r = self.runway_weeks
        if r == math.inf:
            return 0.0
        target = max(self.cfg.min_runway_weeks, 1e-9) * 3.0
        return max(0.0, min(1.0, 1.0 - r / target))

    def may_invest_in_future(self) -> bool:
        """Is there enough runway to spend hours on something that pays later?"""
        return self.runway_weeks >= self.cfg.min_runway_weeks

    def min_defensive_share(self) -> float:
        """Fraction of hours that must go to arms that pay this week."""
        if self.cfg.weekly_needs <= 0:
            return 0.0
        return self.cfg.defensive_floor * self.defensive_pressure()

    # ------------------------------------------------------------------
    @staticmethod
    def valley_depth(setup_hours: float, weekly_hours: float,
                     linear_rate: float, ramp_weeks: float = 0.0) -> dict:
        """What crossing to a compounding arm costs, in euros and in weeks.

        The opportunity cost is not the setup hours. It is the income those
        hours would have earned on the arm you already know pays -- which is
        the number people leave out when they say a side project is "free
        because I did it in the evenings".
        """
        weeks_of_setup = setup_hours / max(weekly_hours, 1e-9)
        weeks = weeks_of_setup + ramp_weeks
        forgone = setup_hours * linear_rate
        return {
            "weeks": weeks,
            "setup_hours": setup_hours,
            "forgone_income": forgone,
            "runway_needed_weeks": weeks,
        }

    @staticmethod
    def crossover_week(linear_rate: float, weekly_hours: float,
                       setup_hours: float, asset_weekly_income: float,
                       ramp_weeks: float = 0.0) -> float | None:
        """Week at which the compounding arm has repaid what it cost.

        Returns None if it never does -- which is the honest answer for a lot
        of "passive income" ideas and is the thing worth knowing before you
        spend three months on one.
        """
        if asset_weekly_income <= 0:
            return None
        weeks_of_setup = setup_hours / max(weekly_hours, 1e-9) + ramp_weeks
        forgone = setup_hours * linear_rate
        # after the valley, the asset earns while those hours go back to the
        # linear arm, so the gain per week is exactly the asset's income
        return weeks_of_setup + forgone / asset_weekly_income

    def report(self) -> dict:
        return {
            "cash": self.state.cash,
            "runway_weeks": self.runway_weeks,
            "lowest_cash": self.state.lowest_cash,
            "went_broke": self.broke,
            "broke_at_week": self.state.broke_at,
            "weeks_below_floor": self.state.weeks_below_floor,
            "defensive_pressure": self.defensive_pressure(),
        }
