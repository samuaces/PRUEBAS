"""Where the hours go. This is the part of FABER that is actually new.

MONETA's allocator answers "how much money should this strategy get". That
question has a clean answer because euros are fungible and reversible. Hours
are neither, and the difference produces three problems that Kelly and
Thompson alone do not solve.

PROBLEM 1 -- THE HORIZON.
An hour on a linear arm pays today. An hour on a compounding arm pays
nothing today and something every week thereafter. Compared on this week's
euros per hour, the compounding arm scores zero and is killed immediately.
Compared over a year it can dominate everything else. So the comparison must
be made over a horizon, and the horizon has to be stated out loud, because
it is the assumption doing all the work. FABER makes it a parameter, and the
ablation study runs the myopic version alongside to show what it costs.

PROBLEM 2 -- YOU CANNOT MEASURE WHAT HAS NOT LAUNCHED.
The promotion gate is the right tool for a linear arm: work it, measure it,
keep it or kill it. It is useless for a compounding arm before launch,
because there is no data and there cannot be. Pretending otherwise is how
people justify anything. So FABER inverts the question and reports the
BREAK-EVEN: given the hours it will cost and what those hours would have
earned elsewhere, here is the weekly income the asset must reach to have
been worth building. That number is checkable against reality in a way a
forecast is not.

PROBLEM 3 -- SWITCHING IS EXPENSIVE.
Setup hours are paid before anything is learned, so flitting between arms
burns the budget on groundwork and never reaches output. Note the asymmetry
this creates, which is easy to mistake for the sunk cost fallacy and is not:
finishing a half-built setup is genuinely more attractive than starting it
was, because the remaining cost is lower. The fallacy would be counting the
hours already spent. FABER counts only the hours still to come.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass

from .arm import Arm, ArmBook, ArmKind
from .survival import SurvivalGovernor


@dataclass
class SchedulerConfig:
    #: how far ahead you are planning. The single most consequential setting.
    horizon_weeks: float = 52.0
    #: an arm earning less than this is not worth your time at any horizon
    min_rate: float = 8.0
    #: confidence budget for abandoning an arm, time-uniform
    alpha: float = 0.10
    #: weeks of data before an arm may be abandoned on evidence
    min_weeks_before_verdict: int = 4
    #: set False for the myopic baseline used in the ablation study
    horizon_aware: bool = True
    #: weight on the compounding term; 1.0 = take the arithmetic at face value
    future_weight: float = 1.0
    #: an unproven arm still gets this share of hours to generate evidence
    exploration_share: float = 0.15


@dataclass
class Allocation:
    hours: dict[str, float]
    reasons: dict[str, str]
    sampled_rate: dict[str, float]
    horizon_rate: dict[str, float]
    defensive_share: float
    abandoned: list[str]


class Scheduler:
    def __init__(self, config: SchedulerConfig | None = None, seed: int = 0):
        self.cfg = config or SchedulerConfig()
        self.rng = random.Random(seed)
        self.history: list[dict] = []

    # ------------------------------------------------------------------
    # Valuation
    # ------------------------------------------------------------------
    def weeks_left(self, week: int) -> float:
        return max(0.0, self.cfg.horizon_weeks - week)

    def break_even_weekly(self, book: ArmBook, week: int, weekly_hours: float,
                          best_linear_rate: float) -> float | None:
        """Weekly income the asset must reach for its setup to pay for itself.

        This is the honest form of the question. It needs no forecast: it is
        arithmetic on the hours remaining and what those hours are worth
        elsewhere, and you can then judge for yourself whether the number is
        plausible for what you are building.
        """
        arm = book.arm
        if arm.kind is not ArmKind.COMPOUNDING:
            return None
        remaining_h = max(0.0, arm.setup_hours - book.setup_hours_done)
        weeks_to_finish = remaining_h / max(weekly_hours, 1e-9)
        weeks_earning = self.weeks_left(week) - weeks_to_finish
        if weeks_earning <= 0:
            return None                      # cannot pay back inside the horizon
        forgone = remaining_h * max(best_linear_rate, 0.0)
        return forgone / weeks_earning

    def horizon_rate(self, book: ArmBook, week: int, weekly_hours: float,
                     sampled_rate: float) -> float:
        """Euros per hour, valued over the planning horizon rather than the week."""
        arm = book.arm
        if arm.kind is ArmKind.LINEAR or not self.cfg.horizon_aware:
            return sampled_rate

        if book.arm.ready(book.state):
            # Already launched: an hour of upkeep protects and grows income
            # that keeps arriving for the rest of the horizon.
            weekly = arm.asset_value(book.state)
            growth = arm.marginal_weekly_gain_per_hour(book.state)
            return sampled_rate + self.cfg.future_weight * growth * self.weeks_left(week)

        remaining_h = max(0.0, arm.setup_hours - book.setup_hours_done)
        if remaining_h <= 0:
            return sampled_rate
        weeks_to_finish = remaining_h / max(weekly_hours, 1e-9)
        weeks_earning = self.weeks_left(week) - weeks_to_finish
        if weeks_earning <= 0:
            return 0.0
        expected_weekly = arm.expected_weekly_income(book.state, self.rng)
        total = expected_weekly * weeks_earning
        # value per hour of the hours STILL TO SPEND -- never the ones already
        # spent, which are gone whatever you decide next
        return self.cfg.future_weight * total / remaining_h

    # ------------------------------------------------------------------
    # Abandonment
    # ------------------------------------------------------------------
    def review(self, week: int, books: dict[str, ArmBook]) -> list[str]:
        """Kill arms whose measured rate cannot clear the floor."""
        cfg = self.cfg
        dropped = []
        for name, book in books.items():
            if book.abandoned_at is not None:
                continue
            if book.active_weeks < cfg.min_weeks_before_verdict:
                continue
            if book.arm.kind is ArmKind.COMPOUNDING and not book.arm.ready(book.state):
                continue          # nothing to measure yet; that is the point
            # Upper end of the time-uniform interval: abandon only when even
            # an optimistic reading of the evidence fails to clear the floor.
            radius = book.posterior.mu_n - book.anytime_lower_bound(cfg.alpha)
            upper = book.posterior.mu_n + radius
            if upper < cfg.min_rate:
                book.abandoned_at = week
                book.note(week, f"ABANDONADA: incluso la lectura optimista "
                                f"({upper:.2f} EUR/h) no llega al minimo "
                                f"({cfg.min_rate:.2f} EUR/h) tras "
                                f"{book.hours:.0f}h")
                dropped.append(name)
        return dropped

    # ------------------------------------------------------------------
    # Allocation
    # ------------------------------------------------------------------
    def plan_week(self, week: int, books: dict[str, ArmBook], budget_h: float,
                  survival: SurvivalGovernor) -> Allocation:
        cfg = self.cfg
        abandoned = self.review(week, books)
        live = {n: b for n, b in books.items() if b.abandoned_at is None}

        sampled: dict[str, float] = {}
        horizon: dict[str, float] = {}
        reasons: dict[str, str] = {}

        for name, book in live.items():
            draw = book.posterior.sample_mu(self.rng)
            if book.active_weeks == 0:
                # No evidence at all: fall back to the arm's own stated prior
                # rather than to zero, or nothing would ever be tried once.
                draw = max(draw, book.arm.optimistic_rate_guess())
            sampled[name] = draw
            horizon[name] = self.horizon_rate(book, week, budget_h, draw)

        # For ranking we use Thompson draws. For the break-even we report to
        # the user we use the measured mean instead: a diagnostic that moves
        # every week because of a random draw is not a diagnostic.
        best_linear = max(
            [b.posterior.mu_n if b.active_weeks else b.arm.prior_rate_guess
             for b in live.values() if b.arm.kind is ArmKind.LINEAR] or [0.0])

        # -- survival veto ---------------------------------------------------
        defensive_share = survival.min_defensive_share()
        may_build = survival.may_invest_in_future()

        allocation = {n: 0.0 for n in books}
        remaining = budget_h

        def pays_now(book: ArmBook) -> bool:
            return (book.arm.kind is ArmKind.LINEAR
                    or book.arm.ready(book.state))

        # 1. defensive block: hours that must produce money this week
        defensive_h = defensive_share * budget_h
        if defensive_h > 0:
            payers = sorted(
                [(sampled[n], n) for n, b in live.items() if pays_now(b)],
                reverse=True)
            for rate, name in payers:
                if remaining <= 0 or defensive_h <= 0:
                    break
                arm = live[name].arm
                if not survival.can_afford(arm.cash_required):
                    reasons[name] = "sin caja para el desembolso inicial"
                    continue
                take = min(defensive_h, remaining, arm.ceiling_h_per_week)
                if take < arm.min_block_h:
                    continue
                allocation[name] += take
                remaining -= take
                defensive_h -= take
                reasons[name] = (f"bloque defensivo: runway "
                                 f"{survival.runway_weeks:.1f} semanas")

        # 2. the rest goes by horizon-adjusted value
        ranked = sorted(live.items(), key=lambda kv: -horizon[kv[0]])
        for name, book in ranked:
            if remaining <= 0:
                break
            arm = book.arm
            if horizon[name] <= 0:
                continue
            building = (arm.kind is ArmKind.COMPOUNDING and not arm.ready(book.state))
            if building and not may_build:
                reasons[name] = (f"aplazada: runway {survival.runway_weeks:.1f} "
                                 f"< {survival.cfg.min_runway_weeks:.0f} semanas")
                continue
            if not survival.can_afford(arm.cash_required):
                reasons.setdefault(name, "sin caja para el desembolso inicial")
                continue
            room = arm.ceiling_h_per_week - allocation[name]
            take = min(remaining, max(0.0, room))
            if building:
                # never spend more than what is left to finish
                take = min(take, arm.setup_hours - book.setup_hours_done)
            if take < arm.min_block_h:
                continue
            allocation[name] += take
            remaining -= take
            if building:
                be = self.break_even_weekly(book, week, budget_h, best_linear)
                reasons[name] = (f"construyendo: faltan "
                                 f"{arm.setup_hours - book.setup_hours_done:.0f}h, "
                                 f"debe llegar a {be:.0f} EUR/semana para pagarse"
                                 if be else "construyendo")
            else:
                reasons.setdefault(name, f"{horizon[name]:.1f} EUR/h a horizonte")

        # 3. exploration: keep a little evidence flowing to unproven arms
        unproven = [n for n, b in live.items()
                    if b.active_weeks < cfg.min_weeks_before_verdict
                    and allocation[n] == 0.0 and pays_now(b)]
        if unproven and remaining <= 0 and budget_h > 0:
            probe = cfg.exploration_share * budget_h
            donor = max(allocation, key=lambda n: allocation[n])
            target = unproven[week % len(unproven)]
            take = min(probe, allocation[donor],
                       live[target].arm.ceiling_h_per_week)
            if take >= live[target].arm.min_block_h:
                allocation[donor] -= take
                allocation[target] += take
                reasons[target] = "sonda de exploracion"

        self.history.append({
            "week": week, "allocation": dict(allocation),
            "sampled": dict(sampled), "horizon": dict(horizon),
            "defensive_share": defensive_share, "runway": survival.runway_weeks,
        })
        return Allocation(hours=allocation, reasons=reasons, sampled_rate=sampled,
                          horizon_rate=horizon, defensive_share=defensive_share,
                          abandoned=abandoned)
