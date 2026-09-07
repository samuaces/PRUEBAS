"""The engine: one tick of the whole machine.

    world  ->  every strategy measures itself on paper
           ->  the gate decides who is allowed real money
           ->  Thompson + Kelly decide how much
           ->  the risk governor decides how much of that is actually safe
           ->  funded strategies trade
           ->  the ledger records what really happened

The same loop runs a 500-path Monte Carlo and a live account. There is no
"backtest mode" that quietly behaves differently -- that divergence is where
most trading systems hide their losses.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from .allocator import Allocator, AllocatorConfig
from .frictions import FrictionModel
from .ledger import Event, Ledger
from .risk import RiskGovernor, RiskLimits
from .stats import (cagr, max_drawdown, returns_from_equity, sharpe, sortino,
                    max_drawdown as _mdd)
from .strategy import Book, MarketContext, Phase, Strategy, StrategyKind


@dataclass
class EngineConfig:
    starting_capital: float = 10_000.0
    paper_notional: float = 10_000.0
    tax_rate: float | None = None       # None => take it from the friction preset
    settle_tax_annually: bool = True
    reserve_fraction: float = 0.15      # cash never handed to any strategy
    review_every: int = 3               # ticks between allocator reviews
    #: Days of paper-only validation before any real money moves. Nothing is
    #: earned during it and nothing can be lost. This is not a trick to make
    #: the numbers look better -- it is what deploying a strategy responsibly
    #: actually costs, and the reported returns start when it ends.
    warmup_days: float = 730.0
    #: Yield on cash the allocator has not deployed. Idle euros are not
    #: stuck under a mattress -- they sit in a money-market fund. Leaving
    #: this at zero would flatter every strategy by comparison.
    idle_yield_annual: float = 0.020
    seed: int = 0


@dataclass
class EngineResult:
    equity_curve: list[float]
    times: list[float]
    start: float
    end: float
    years: float
    cagr: float
    sharpe: float
    sortino: float
    max_drawdown: float
    halted: bool
    halt_reason: str
    strategy_rows: list[dict]
    pnl_by_strategy: dict[str, float]
    labor_hours: float
    labor_pnl_per_hour: float
    promotions: list[str]
    demotions: list[str]
    risk_report: dict
    notes: list[str]
    tax_paid: float
    fees_paid: float
    final_phases: dict[str, str]
    allocation_share: dict[str, float]
    warmup_days: float = 0.0
    promoted_at_days: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        d = dict(self.__dict__)
        d.pop("equity_curve", None)
        d.pop("times", None)
        return d


class Engine:
    def __init__(self, strategies: list[Strategy], frictions: FrictionModel,
                 config: EngineConfig | None = None,
                 allocator: Allocator | None = None,
                 limits: RiskLimits | None = None):
        self.cfg = config or EngineConfig()
        self.frictions = frictions
        self.tax_rate = (self.cfg.tax_rate if self.cfg.tax_rate is not None
                         else frictions.tax_rate)
        self.strategies = strategies
        self.allocator = allocator or Allocator(AllocatorConfig(), seed=self.cfg.seed)
        # The bar a strategy must clear is not zero, it is the money-market
        # rate. Capital handed to a strategy stops earning that rate, so a
        # strategy that beats zero but not cash makes the account worse while
        # looking like it works. Measured at EUR 200,000 this was costing real
        # money before the hurdle was raised.
        if self.allocator.cfg.hurdle == 0.0 and self.cfg.idle_yield_annual:
            self.allocator.cfg.hurdle = self.cfg.idle_yield_annual / 1095.0
        self.risk = RiskGovernor(limits or RiskLimits())

        self.books: dict[str, Book] = {
            s.name: Book(s, self.cfg.paper_notional, s.prior_sigma)
            for s in strategies}
        self.idle_cash = self.cfg.starting_capital
        self.equity_curve: list[float] = []
        self.times: list[float] = []
        self.total_labor_h = 0.0
        self.labor_by_strategy: dict[str, float] = {}
        self.tax_paid = 0.0
        self._tick = 0
        self._last_tax_day = 0.0
        self.notes: list[str] = []
        self.alloc_share_acc: dict[str, float] = {n: 0.0 for n in self.books}
        self.alloc_share_n = 0
        self.live_start_index: int | None = None

    # ------------------------------------------------------------------
    def equity(self, ctx: MarketContext) -> float:
        total = self.idle_cash
        for book in self.books.values():
            total += book.live.equity(book.strategy.mark_prices(ctx), self.tax_rate)
        return total

    def gross_equity(self, ctx: MarketContext) -> float:
        total = self.idle_cash
        for book in self.books.values():
            total += book.live.gross_equity(book.strategy.mark_prices(ctx))
        return total

    # ------------------------------------------------------------------
    def step(self, ctx: MarketContext) -> None:
        cfg = self.cfg
        self._tick += 1

        # -- a venue blew up: everybody holding anything there loses it -----
        for venue in ctx.data.get("failed_now", []):
            for book in self.books.values():
                lost = book.live.seize_venue(ctx.t, venue)
                book.paper.seize_venue(ctx.t, venue)
                if lost > 0:
                    self.notes.append(
                        f"[t={ctx.t/24:7.1f}d] {venue} failed: {book.name} lost "
                        f"{lost:,.0f} ({book.name} was holding it)")

        # -- 1. measurement pass: every strategy trades its paper book -------
        ctx.data["labor_remaining"] = ctx.data["labor_budget_h"]
        for book in self.books.values():
            book.strategy.step(ctx, book.paper, book.paper_notional,
                               book.paper_state, paper=True)
            book.record_paper(ctx)

        # -- 2. governance ----------------------------------------------------
        equity = self.equity(ctx)
        self.risk.observe(ctx.t, equity)
        may_trade = self.risk.check_account(ctx.t, equity)

        in_warmup = ctx.data["day"] < cfg.warmup_days
        if self.live_start_index is None and not in_warmup:
            self.live_start_index = len(self.equity_curve)

        if self._tick % cfg.review_every == 0:
            self.allocator.review_phases(ctx.t, self.books)
            for book in self.books.values():
                self.risk.police_strategy(ctx.t, book)
            targets = self.allocator.allocate(ctx.t, self.books, equity,
                                              self.risk.limits.probation_factor,
                                              ctx=ctx)
            venue_of = {n: b.strategy.venues for n, b in self.books.items()}
            capped = self.risk.cap_allocations(equity, targets, venue_of)
            if not may_trade or in_warmup:
                capped = {k: 0.0 for k in capped}
            self._rebalance(ctx, capped)

        # -- 3. execution pass: funded strategies trade real money -----------
        ctx.data["labor_remaining"] = ctx.data["labor_budget_h"]
        order = sorted(self.books.values(),
                       key=lambda b: -b.posterior.mu_n)     # best edge gets the hours first
        for book in order:
            if book.phase is Phase.RETIRED:
                book.strategy.liquidate(ctx, book.live, book.live_state)
                continue
            capital = book.allocation if (may_trade and book.is_fundable) else 0.0
            hours = book.strategy.step(ctx, book.live, capital, book.live_state,
                                       paper=False)
            if book.is_fundable:
                self.total_labor_h += hours
                self.labor_by_strategy[book.name] = \
                    self.labor_by_strategy.get(book.name, 0.0) + hours
            book.record_live(ctx, self.tax_rate)

        # -- 3b. idle cash earns the money-market rate ------------------------
        if self.idle_cash > 0 and cfg.idle_yield_annual:
            self.idle_cash *= (1.0 + cfg.idle_yield_annual / 1095.0)

        # -- 4. the taxman ------------------------------------------------------
        if cfg.settle_tax_annually and ctx.data["day"] - self._last_tax_day >= 365.0:
            self._settle_tax(ctx)
            self._last_tax_day = ctx.data["day"]

        # -- 5. record -----------------------------------------------------------
        eq = self.equity(ctx)
        self.equity_curve.append(eq)
        self.times.append(ctx.t)
        if not in_warmup:
            self.alloc_share_n += 1
            for n, b in self.books.items():
                self.alloc_share_acc[n] += b.allocation / max(eq, 1e-9)

    # ------------------------------------------------------------------
    def _rebalance(self, ctx: MarketContext, targets: dict[str, float]) -> None:
        """Move real cash between the treasury and the strategy accounts."""
        # defund first so the money is available to fund with
        for name, target in targets.items():
            book = self.books[name]
            book.allocation = target
            excess = book.funded - target
            if excess > 1.0:
                got = book.live.withdraw(ctx.t, excess)
                book.funded -= got
                book.pending_flow -= got
                self.idle_cash += got

        reserve = self.cfg.reserve_fraction * max(self.equity(ctx), 0.0)
        for name, target in sorted(targets.items(), key=lambda kv: -kv[1]):
            book = self.books[name]
            need = target - book.funded
            if need <= 1.0:
                continue
            spare = max(0.0, self.idle_cash - reserve)
            give = min(need, spare)
            if give > 1.0:
                book.strategy.fund(book.live, ctx.t, give)
                book.funded += give
                book.pending_flow += give
                self.idle_cash -= give

    def _settle_tax(self, ctx: MarketContext) -> None:
        owed = sum(b.live.accrued_tax(self.tax_rate) for b in self.books.values())
        if owed <= 0:
            return
        if self.idle_cash < owed:
            short = owed - self.idle_cash
            for book in self.books.values():
                if short <= 0:
                    break
                got = book.live.withdraw(ctx.t, short)
                book.funded -= got
                book.pending_flow -= got
                self.idle_cash += got
                short -= got
        pay = min(owed, self.idle_cash)
        self.idle_cash -= pay
        self.tax_paid += pay
        # clear the liability proportionally across books
        remaining = pay
        for book in self.books.values():
            share = book.live.accrued_tax(self.tax_rate)
            if share <= 0:
                continue
            amount = min(share, remaining)
            book.live.taxes_paid += amount
            book.pending_flow += amount     # liability settled, not performance
            remaining -= amount
        self.notes.append(f"[t={ctx.t/24:7.1f}d] tax settled: {pay:,.0f}")

    # ------------------------------------------------------------------
    def finish(self, ctx: MarketContext) -> EngineResult:
        for book in self.books.values():
            book.strategy.liquidate(ctx, book.live, book.live_state)
            got = book.live.withdraw(ctx.t, book.live.total_cash())
            book.funded -= got
            book.pending_flow -= got
            self.idle_cash += got

        eq = self.equity(ctx)
        self.equity_curve.append(eq)
        self.times.append(ctx.t)

        i0 = self.live_start_index or 0
        live_curve = self.equity_curve[i0:]
        start_equity = live_curve[0] if live_curve else self.cfg.starting_capital
        live_hours = ctx.t - (self.times[i0] if i0 < len(self.times) else 0.0)
        years = max(live_hours / (24 * 365.0), 1e-9)
        rets = returns_from_equity(live_curve)
        ticks_per_year = 1095.0
        pnl = {}
        for name, b in self.books.items():
            pnl[name] = sum(b.live.pnl_by_strategy.values())

        labor_pnl = sum(v for k, v in pnl.items()
                        if self.books[k].strategy.kind is not StrategyKind.CAPITAL)
        share = {n: (v / max(self.alloc_share_n, 1))
                 for n, v in self.alloc_share_acc.items()}

        notes = list(self.notes)
        for b in self.books.values():
            notes.extend(b.notes)
        notes.sort()

        return EngineResult(
            equity_curve=list(self.equity_curve), times=list(self.times),
            start=start_equity, end=eq, years=years,
            cagr=cagr(start_equity, eq, years),
            sharpe=sharpe(rets, ticks_per_year),
            sortino=sortino(rets, ticks_per_year),
            max_drawdown=max_drawdown(live_curve),
            halted=self.risk.state.halted, halt_reason=self.risk.state.reason,
            strategy_rows=self.allocator.report(self.books),
            pnl_by_strategy=pnl,
            labor_hours=self.total_labor_h,
            labor_pnl_per_hour=(labor_pnl / self.total_labor_h
                                if self.total_labor_h > 0 else 0.0),
            promotions=list(self.allocator.promotions),
            demotions=list(self.allocator.demotions),
            risk_report=self.risk.report(),
            notes=notes,
            tax_paid=self.tax_paid,
            fees_paid=sum(b.live.fees_paid for b in self.books.values()),
            final_phases={n: b.phase.value for n, b in self.books.items()},
            allocation_share=share,
            warmup_days=self.cfg.warmup_days,
            promoted_at_days={n: (b.promoted_at / 24.0 if b.promoted_at else None)
                              for n, b in self.books.items()},
        )


def run_path(world, strategies: list[Strategy], frictions: FrictionModel,
             config: EngineConfig | None = None,
             allocator: Allocator | None = None,
             limits: RiskLimits | None = None) -> EngineResult:
    """Run one complete simulation path end to end."""
    engine = Engine(strategies, frictions, config, allocator, limits)
    ctx = None
    while not world.done:
        ctx = world.tick()
        engine.step(ctx)
    return engine.finish(ctx)
