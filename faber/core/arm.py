"""What a way of making money looks like when you have none.

An `Arm` is any mechanism that converts hours into euros. The contract is
narrow so that "resell things people give away" and "build a data service"
are the same kind of object to the scheduler and can be compared on the same
axes. Three properties decide everything:

  * EUR per hour               -- measured, never assumed
  * setup hours                -- what you must pay before you learn anything
  * whether it compounds       -- does an hour worked today still pay in June?

That third one is the whole game, and it is the thing people get wrong.
A LINEAR arm pays immediately and never grows: you sell an item, you get
money, and tomorrow you start from zero again. A COMPOUNDING arm pays
nothing for weeks and then keeps paying without you. Any scheduler that
maximises this month's income will always kill the compounding arm, because
for the first several weeks it is strictly worse than doing nothing.

That is not a flaw in the arms. It is the trap, stated precisely, and it is
why people who need money now tend to still need money later.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum

from moneta.core.stats import EdgePosterior, Welford, percentile


class ArmKind(str, Enum):
    LINEAR = "linear"            # pays now, never grows
    COMPOUNDING = "compounding"  # pays later, then keeps paying


@dataclass
class WorkResult:
    """What an hour block actually produced."""
    earned: float = 0.0
    hours_used: float = 0.0
    out_of_pocket: float = 0.0     # cash you had to spend to do the work
    asset_delta: float = 0.0       # progress on a compounding arm
    setup: bool = False            # these hours went into setup, not output
    events: list[str] = field(default_factory=list)

    @property
    def net(self) -> float:
        return self.earned - self.out_of_pocket


class Arm(ABC):
    """Base class for every zero-capital income mechanism."""

    name: str = "unnamed"
    kind: ArmKind = ArmKind.LINEAR
    #: one line the CLI shows; the module docstring carries the real content
    blurb: str = ""

    #: hours of unpaid groundwork before this arm can produce anything at all
    setup_hours: float = 0.0
    #: smallest block of time worth starting; below this the hours are wasted
    min_block_h: float = 1.0
    #: hours a week past which this arm has nothing more to give you
    ceiling_h_per_week: float = 40.0
    #: cash you must be able to put up front. Must be small -- the premise of
    #: FABER is that you have nothing, and an arm needing EUR 500 of stock is
    #: not available to you no matter how good its return.
    cash_required: float = 0.0
    #: rough weekly running cost once operating
    weekly_cost: float = 0.0
    #: how noisy this arm's per-hour outcome is, used to set a sceptical prior
    prior_sigma: float = 12.0

    def new_state(self) -> dict:
        return {}

    @abstractmethod
    def work(self, ctx, hours: float, state: dict, cash: float) -> WorkResult:
        """Spend `hours` on this arm. Returns what came of it."""

    def asset_value(self, state: dict) -> float:
        """Recurring euros per week this arm now produces on its own."""
        return 0.0

    # ------------------------------------------------------------------
    # Priors. Everything below is a BELIEF, not a measurement, and the
    # scheduler is careful about where it lets these touch a decision.
    # They exist because a compounding arm cannot be measured before it
    # launches -- there is no data and there cannot be -- so the choice to
    # build one is unavoidably made on a prior. FABER's answer is not to
    # dress the prior up as a forecast but to report the break-even the
    # asset would have to hit, which you can then argue with.
    # ------------------------------------------------------------------

    #: what you would guess this pays per hour before trying it at all
    prior_rate_guess: float = 15.0
    #: for compounding arms: guessed steady-state weekly income once launched
    prior_weekly_income: float = 0.0
    #: how uncertain that guess is, as a multiplicative log-sd
    prior_income_sigma: float = 0.8

    def optimistic_rate_guess(self) -> float:
        """Used only when an arm has never been tried, so it gets one chance."""
        return self.prior_rate_guess

    def expected_weekly_income(self, state: dict, rng) -> float:
        """A DRAW from the prior on steady-state weekly income, not a forecast.

        Sampled rather than averaged so that Thompson sampling still explores:
        an arm whose payoff is genuinely uncertain occasionally looks worth
        starting, which is the correct behaviour when the only way to learn
        is to build the thing.
        """
        if self.prior_weekly_income <= 0:
            return 0.0
        import math
        return self.prior_weekly_income * math.exp(
            rng.gauss(0.0, self.prior_income_sigma)
            - 0.5 * self.prior_income_sigma ** 2)

    def marginal_weekly_gain_per_hour(self, state: dict) -> float:
        """Extra recurring weekly income one more hour would add, once live."""
        return 0.0

    def ready(self, state: dict) -> bool:
        return state.get("setup_done_h", 0.0) >= self.setup_hours

    def describe(self) -> str:
        return (self.__doc__ or self.name).strip().splitlines()[0]


class ArmBook:
    """The track record of one arm: hours in, euros out, and the posterior."""

    def __init__(self, arm: Arm):
        self.arm = arm
        self.name = arm.name
        self.state = arm.new_state()
        self.posterior = EdgePosterior(mu0=0.0, kappa0=4.0,
                                       prior_sigma=arm.prior_sigma)
        self.hours = 0.0
        self.setup_hours_done = 0.0
        self.earned = 0.0
        self.out_of_pocket = 0.0
        self.weekly_rates: list[float] = []
        self.rate_stats = Welford()
        self.active_weeks = 0
        self.abandoned_at: int | None = None
        self.notes: list[str] = []

    # ------------------------------------------------------------------
    def record(self, week: int, hours: float, result: WorkResult) -> None:
        self.hours += hours
        self.earned += result.earned
        self.out_of_pocket += result.out_of_pocket
        if result.setup:
            self.setup_hours_done += hours
        if hours <= 0:
            return
        self.active_weeks += 1
        rate = result.net / hours
        self.weekly_rates.append(rate)
        self.rate_stats.push(rate)
        # Setup hours are real hours and really earned nothing. Feeding them
        # to the posterior is what makes a compounding arm look terrible
        # early on -- which is true, and is exactly the judgement the horizon
        # term in the scheduler has to override deliberately rather than by
        # pretending the hours did not happen.
        self.posterior.push(rate)

    @property
    def rate(self) -> float:
        return (self.earned - self.out_of_pocket) / self.hours if self.hours > 0 else 0.0

    @property
    def measured_rate_ci(self) -> tuple[float, float]:
        return self.posterior.credible_interval(0.90)

    def anytime_lower_bound(self, alpha: float = 0.10) -> float:
        return self.posterior.anytime_lower_bound(alpha)

    def note(self, week: int, msg: str) -> None:
        self.notes.append(f"[semana {week:3d}] {self.name}: {msg}")

    def summary(self) -> dict:
        lo, hi = self.measured_rate_ci
        return {
            "arm": self.name,
            "kind": self.arm.kind.value,
            "hours": self.hours,
            "setup_hours": self.setup_hours_done,
            "earned": self.earned,
            "net": self.earned - self.out_of_pocket,
            "eur_per_hour": self.rate,
            "measured_mu": self.posterior.mu_n,
            "ci90": [lo, hi],
            "lower_bound": self.anytime_lower_bound(),
            "asset_weekly": self.arm.asset_value(self.state),
            "abandoned_week": self.abandoned_at,
        }
