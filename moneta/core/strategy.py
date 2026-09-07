"""Strategy contract.

A strategy is anything that turns capital and/or attention into money. The
contract is deliberately narrow so that a crypto carry trade and a "buy
mispriced things and resell them" workflow are the same kind of object to
the allocator, and can be compared on the same axes:

    * return on deployed capital        (EUR per EUR)
    * return on attention               (EUR per hour)
    * risk                              (volatility, drawdown, tail)

Every strategy runs a *reference book* (a paper sub-ledger at a fixed
notional) from the first tick and forever after. That reference book is the
measurement instrument: it produces the return series the Bayesian gate
judges, unaffected by how much real capital the allocator happens to be
giving the strategy at the time. Real capital flows into a separate live
sub-ledger, and only once the gate opens.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum

from .ledger import Ledger
from .stats import EdgePosterior, Welford, max_drawdown


class StrategyKind(str, Enum):
    CAPITAL = "capital"   # scales with money, near-zero attention
    LABOR = "labor"       # scales with attention, small capital
    HYBRID = "hybrid"


class Phase(str, Enum):
    PAPER = "paper"          # measuring; no real money at risk
    LIVE = "live"            # promoted; receives real capital
    PROBATION = "probation"  # was live, degraded; capital cut, still live
    RETIRED = "retired"      # killed; will not be funded again this run


@dataclass
class Opportunity:
    """A single actionable money-making opportunity found by a scan."""
    strategy: str
    label: str
    edge: float                 # expected net return on capital over horizon
    edge_std: float             # uncertainty of that estimate
    capital: float              # capital the opportunity can absorb
    horizon_h: float            # hours until it resolves
    labor_h: float = 0.0        # human attention required
    meta: dict = field(default_factory=dict)

    @property
    def edge_per_hour(self) -> float:
        return self.edge / max(self.horizon_h, 1e-9)

    @property
    def annualized(self) -> float:
        """Naive annualisation of the edge, for ranking only."""
        periods = 8760.0 / max(self.horizon_h, 1e-9)
        return (1.0 + self.edge) ** min(periods, 500.0) - 1.0 if self.edge > -1 else -1.0

    @property
    def euros_per_labor_hour(self) -> float:
        if self.labor_h <= 0:
            return float("inf")
        return self.edge * self.capital / self.labor_h

    def score(self, risk_aversion: float = 1.0) -> float:
        """Risk-adjusted attractiveness, comparable across strategies."""
        denom = max(self.edge_std, 1e-6)
        return self.edge_per_hour / (1.0 + risk_aversion * denom)


class MarketContext:
    """Everything a strategy is allowed to see about the world this tick.

    The same object is handed to the simulator and to live mode, which is
    what makes a backtest and a live run execute literally the same code
    path -- the classic source of "it worked in the backtest" bugs.
    """

    def __init__(self, t: float, dt_h: float, frictions, rng, data: dict):
        self.t = t              # hours since start
        self.dt_h = dt_h        # length of this tick, hours
        self.frictions = frictions
        self.rng = rng
        self.data = data        # venue/symbol -> quotes, funding, catalog...

    # convenience accessors -------------------------------------------------
    def price(self, venue: str, symbol: str) -> float:
        return self.data["prices"][(venue, symbol)]

    def has_price(self, venue: str, symbol: str) -> bool:
        return (venue, symbol) in self.data["prices"]

    def funding_rate(self, venue: str, symbol: str) -> float:
        """Funding paid by longs to shorts this interval (fraction of notional)."""
        return self.data["funding"].get((venue, symbol), 0.0)

    def adv(self, venue: str, symbol: str) -> float:
        """Average daily volume in quote currency, for impact sizing."""
        return self.data["adv"].get((venue, symbol), 1e9)

    @property
    def day(self) -> float:
        return self.t / 24.0


class Book:
    """A strategy's account: its ledger, its track record, its standing."""

    def __init__(self, strategy: "Strategy", paper_notional: float,
                 prior_sigma: float, record_journal: bool = False):
        self.strategy = strategy
        self.name = strategy.name

        # measurement instrument: always running, fixed notional, never real
        self.paper = Ledger(record_journal=False)
        strategy.fund(self.paper, 0.0, paper_notional)
        self.paper_state = strategy.new_state()
        self.paper_notional = paper_notional
        self.last_paper_equity = paper_notional

        # real money
        self.live = Ledger(record_journal=record_journal)
        self.live_state = strategy.new_state()
        self.funded = 0.0            # cash handed over by the treasury
        self.allocation = 0.0        # target capital from the allocator

        self.phase = Phase.PAPER
        self.posterior = EdgePosterior(prior_sigma=prior_sigma)
        self.live_posterior = EdgePosterior(prior_sigma=prior_sigma)
        # Two views of the same book. `posterior` sees total return, including
        # unrealised marks. `cash_posterior` sees only money that has actually
        # been received or paid -- funding credited, sales settled, fees taken.
        # A strategy whose edge is a contractual cash flow proves itself on
        # the second one far faster, because the mark-to-market noise that
        # dominates the first has nothing to do with why it makes money.
        # A strategy whose edge is a price prediction gets no such shortcut:
        # its realised P&L is exactly as noisy as its marks.
        self.cash_posterior = EdgePosterior(prior_sigma=prior_sigma)
        self._last_realized = 0.0
        self.paper_equity_curve: list[float] = [paper_notional]
        self.live_equity_curve: list[float] = []
        # Capital flowing in and out is not performance. The live book is
        # tracked as a unit index (a NAV per share) so that defunding a
        # strategy does not register as a 100% loss and trip the drawdown
        # stop -- a mistake that silently kills good strategies.
        self.live_index: float = 1.0
        self.live_index_curve: list[float] = [1.0]
        self.live_returns: list[float] = []
        self.pending_flow: float = 0.0
        self._last_live_equity: float = 0.0
        self.paper_returns: list[float] = []
        self.notional_returns: list[float] = []
        self._last_deployed: float = 0.0
        self.labor_hours = Welford()
        self.total_labor_h = 0.0
        self.promoted_at: float | None = None
        self.retired_at: float | None = None
        self.notes: list[str] = []

    # -- measurement --------------------------------------------------------
    def record_paper(self, ctx: MarketContext) -> float | None:
        prices = self.strategy.mark_prices(ctx)
        eq = self.paper.equity(prices)
        prev_eq = self.last_paper_equity
        self.last_paper_equity = eq
        self.paper_equity_curve.append(eq)

        deployed = self._last_deployed
        self._last_deployed = self.strategy.capital_in_use(
            ctx, self.paper, self.paper_state)
        realized = self.paper.realized_pnl
        d_realized = realized - self._last_realized
        self._last_realized = realized

        if prev_eq > 0:
            self.notional_returns.append((eq - prev_eq) / prev_eq)

        if deployed <= 0:
            # Idle capital carries no information about the strategy's edge.
            # Counting flat ticks would drag the mean toward zero and inflate
            # n, making the gate look better informed than it is.
            return None

        r = (eq - prev_eq) / deployed
        self.paper_returns.append(r)
        self.posterior.push(r)
        self.cash_posterior.push(d_realized / deployed)
        return r

    def record_live(self, ctx: MarketContext, tax_rate: float) -> float:
        prices = self.strategy.mark_prices(ctx)
        eq = self.live.equity(prices, tax_rate)
        prev = self._last_live_equity
        flow = self.pending_flow
        self.pending_flow = 0.0
        if prev > 1e-6:
            r = (eq - flow - prev) / prev
            # a defunding that leaves nothing behind carries no information
            if abs(r) < 1.0:
                self.live_index *= (1.0 + r)
                self.live_returns.append(r)
                self.live_posterior.push(r)
        self.live_index_curve.append(self.live_index)
        self.live_equity_curve.append(eq)
        self._last_live_equity = eq
        return eq

    def live_equity(self, ctx: MarketContext, tax_rate: float = 0.0) -> float:
        return self.live.equity(self.strategy.mark_prices(ctx), tax_rate)

    @property
    def paper_drawdown(self) -> float:
        return max_drawdown(self.paper_equity_curve)

    @property
    def live_drawdown(self) -> float:
        """Drawdown of the live book's unit index, free of capital flows."""
        return max_drawdown(self.live_index_curve) if len(self.live_index_curve) > 1 else 0.0

    @property
    def is_fundable(self) -> bool:
        return self.phase in (Phase.LIVE, Phase.PROBATION)

    def note(self, t: float, msg: str) -> None:
        self.notes.append(f"[t={t/24:7.1f}d] {self.name}: {msg}")


class Strategy(ABC):
    """Base class for every money-making module."""

    name: str = "unnamed"
    kind: StrategyKind = StrategyKind.CAPITAL
    venues: tuple[str, ...] = ()
    #: expected per-tick return magnitude, used to set a sceptical prior
    prior_sigma: float = 0.01
    #: hours of human attention needed per week just to keep it alive
    upkeep_h_per_week: float = 0.0
    #: fixed running cost per month (subscriptions, data, tools) in base ccy
    monthly_cost: float = 0.0

    def capital_in_use(self, ctx: "MarketContext", ledger: Ledger,
                       state: dict) -> float:
        """Capital this strategy actually has at work right now.

        This is the denominator the allocator learns from, and getting it
        wrong is subtle and expensive. Measuring return against the notional
        a strategy was *handed* makes any capacity-limited strategy look bad
        purely because it was given more money than it can use -- and the
        gate then refuses to fund the thing that works. Return on capital
        employed and total capacity are two different questions, so they are
        asked separately: here, and in `capacity()`.
        """
        marks = self.mark_prices(ctx)
        return max(0.0, ledger.gross_equity(marks) - ledger.total_cash())

    def capacity(self, ctx: "MarketContext", state: dict) -> float:
        """Most capital this strategy could usefully absorb. Infinite by default."""
        return float("inf")

    def deposit_split(self) -> dict[str, float]:
        """How new cash is spread across this strategy's venues."""
        vs = self.venues or ("ex1",)
        return {v: 1.0 / len(vs) for v in vs}

    def fund(self, ledger: Ledger, t: float, amount: float) -> None:
        """Move `amount` of cash into this strategy's accounts."""
        if amount <= 0:
            return
        for venue, share in self.deposit_split().items():
            ledger.deposit(t, venue, amount * share, note=f"fund {self.name}")

    def reset(self, rng) -> None:
        """Re-initialise internal state for a new simulation path."""

    @abstractmethod
    def scan(self, ctx: MarketContext) -> list[Opportunity]:
        """Find opportunities available right now."""

    def new_state(self) -> dict:
        """Fresh per-book internal state.

        The same Strategy object drives both the paper book and the live
        book, so it must hold no mutable per-book state of its own. Anything
        that changes tick to tick lives in here.
        """
        return {}

    @abstractmethod
    def step(self, ctx: MarketContext, ledger: Ledger, capital: float,
             state: dict, paper: bool) -> float:
        """Advance the strategy one tick against `ledger` with `capital`.

        Returns the hours of human attention consumed this tick. The
        strategy manages its own open positions inside `state`.
        """

    @abstractmethod
    def mark_prices(self, ctx: MarketContext) -> dict[tuple[str, str], float]:
        """Marks for every (venue, symbol) this strategy may hold."""

    def liquidate(self, ctx: MarketContext, ledger: Ledger, state: dict) -> None:
        """Close everything (end of run, or emergency stop)."""

    # -- reporting -----------------------------------------------------------
    def describe(self) -> str:
        return self.__doc__.strip().splitlines()[0] if self.__doc__ else self.name
