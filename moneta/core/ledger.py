"""The ledger: the single source of truth about how much money exists.

Nothing in MONETA is allowed to "make money" except by writing an entry
here. Every entry carries the strategy that caused it, so profit attribution
is exact rather than reconstructed -- which is what lets the allocator learn
from real, per-strategy realised returns instead of vibes.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Kind(str, Enum):
    SPOT = "spot"            # owned asset, no leverage
    PERP = "perp"            # perpetual future, margined
    INVENTORY = "inventory"  # physical goods held for resale


class Event(str, Enum):
    DEPOSIT = "deposit"
    TRADE = "trade"
    FEE = "fee"
    FUNDING = "funding"
    BORROW = "borrow"
    TRANSFER = "transfer"
    SETTLE = "settle"
    WRITE_OFF = "write_off"
    TAX = "tax"


@dataclass
class JournalEntry:
    t: float
    event: Event
    strategy: str
    venue: str
    symbol: str
    qty: float
    price: float
    cash_delta: float
    realized: float = 0.0
    note: str = ""


@dataclass
class Position:
    venue: str
    symbol: str
    kind: Kind
    qty: float = 0.0
    avg_price: float = 0.0
    strategy: str = ""
    # cost basis carried for inventory, margin posted for perps
    margin: float = 0.0
    opened_t: float = 0.0

    @property
    def cost_basis(self) -> float:
        return self.qty * self.avg_price

    def mark_value(self, price: float) -> float:
        """Value contributed to equity at `price`."""
        if self.kind is Kind.PERP:
            # a perp position contributes posted margin + unrealised PnL
            return self.margin + (price - self.avg_price) * self.qty
        return self.qty * price

    def unrealized(self, price: float) -> float:
        return (price - self.avg_price) * self.qty


class Ledger:
    """Cash accounts, positions, and an append-only journal."""

    def __init__(self, base_currency: str = "EUR", record_journal: bool = True):
        self.base = base_currency
        self.cash: dict[tuple[str, str], float] = {}
        self.positions: dict[tuple[str, str], Position] = {}
        self.journal: list[JournalEntry] = []
        self.record_journal = record_journal

        self.realized_pnl: float = 0.0
        self.fees_paid: float = 0.0
        self.funding_flow: float = 0.0
        self.write_offs: float = 0.0
        self.taxes_paid: float = 0.0
        self.deposited: float = 0.0

        self.pnl_by_strategy: dict[str, float] = {}
        self.fees_by_strategy: dict[str, float] = {}
        self.trades_by_strategy: dict[str, int] = {}

        self.equity_curve: list[tuple[float, float]] = []
        self.high_water: float = 0.0

    # -- plumbing ----------------------------------------------------------
    def _log(self, entry: JournalEntry) -> None:
        if self.record_journal:
            self.journal.append(entry)

    def _credit(self, venue: str, amount: float, ccy: str | None = None) -> None:
        key = (venue, ccy or self.base)
        self.cash[key] = self.cash.get(key, 0.0) + amount

    def cash_at(self, venue: str, ccy: str | None = None) -> float:
        return self.cash.get((venue, ccy or self.base), 0.0)

    def total_cash(self) -> float:
        return sum(self.cash.values())

    def _attribute(self, strategy: str, pnl: float = 0.0, fee: float = 0.0,
                   trade: bool = False) -> None:
        if pnl:
            self.pnl_by_strategy[strategy] = self.pnl_by_strategy.get(strategy, 0.0) + pnl
        if fee:
            self.fees_by_strategy[strategy] = self.fees_by_strategy.get(strategy, 0.0) + fee
        if trade:
            self.trades_by_strategy[strategy] = self.trades_by_strategy.get(strategy, 0) + 1

    # -- operations --------------------------------------------------------
    def deposit(self, t: float, venue: str, amount: float, note: str = "") -> None:
        self._credit(venue, amount)
        self.deposited += amount
        self._log(JournalEntry(t, Event.DEPOSIT, "-", venue, self.base, 0.0, 1.0,
                               amount, note=note))

    def withdraw(self, t: float, amount: float) -> float:
        """Pull up to `amount` of free cash out, proportionally across venues."""
        available = self.total_cash()
        take = min(max(amount, 0.0), max(available, 0.0))
        if take <= 0:
            return 0.0
        for key, bal in list(self.cash.items()):
            if bal <= 0:
                continue
            share = take * (bal / available)
            self.cash[key] = bal - share
        self.deposited -= take
        self._log(JournalEntry(t, Event.DEPOSIT, "-", "*", self.base, 0.0, 1.0,
                               -take, note="defund"))
        return take

    def transfer(self, t: float, src: str, dst: str, amount: float,
                 fee: float, strategy: str = "-") -> None:
        self._credit(src, -(amount + fee))
        self._credit(dst, amount)
        self.fees_paid += fee
        self._attribute(strategy, fee=fee)
        self._log(JournalEntry(t, Event.TRANSFER, strategy, f"{src}->{dst}",
                               self.base, 0.0, 1.0, -fee, note="rebalance"))

    def trade(self, t: float, strategy: str, venue: str, symbol: str, kind: Kind,
              qty: float, price: float, fee: float, note: str = "") -> float:
        """Buy (qty>0) or sell (qty<0). Returns realised PnL of this fill.

        Uses weighted-average cost basis. Reducing a position realises PnL
        against the average price; flipping through zero re-bases cleanly.
        """
        key = (venue, symbol)
        pos = self.positions.get(key)
        if pos is None:
            pos = Position(venue, symbol, kind, strategy=strategy, opened_t=t)
            self.positions[key] = pos

        realized = 0.0
        if pos.qty == 0.0 or (pos.qty > 0) == (qty > 0):
            # opening or adding: re-weight the average price
            new_qty = pos.qty + qty
            if new_qty != 0.0:
                pos.avg_price = (pos.cost_basis + qty * price) / new_qty
            pos.qty = new_qty
        else:
            # reducing / closing / flipping
            closing = min(abs(qty), abs(pos.qty))
            direction = 1.0 if pos.qty > 0 else -1.0
            realized = (price - pos.avg_price) * closing * direction
            remaining = pos.qty + qty
            if (remaining > 0) == (pos.qty > 0) or remaining == 0.0:
                pos.qty = remaining
            else:                       # flipped sides
                pos.qty = remaining
                pos.avg_price = price
            if pos.qty == 0.0:
                pos.avg_price = 0.0

        cash_delta = -qty * price - fee if kind is not Kind.PERP else -fee + realized
        if kind is Kind.PERP:
            # perps do not consume cash for notional, only margin (handled by
            # post_margin) -- realised PnL settles straight to cash
            pass
        self._credit(venue, cash_delta)

        self.realized_pnl += realized - fee   # fees are deductible against gains
        self.fees_paid += fee
        self._attribute(strategy, pnl=realized - fee, fee=fee, trade=True)

        if pos.qty == 0.0:
            self.positions.pop(key, None)

        self._log(JournalEntry(t, Event.TRADE, strategy, venue, symbol, qty, price,
                               cash_delta, realized, note))
        return realized

    def post_margin(self, t: float, strategy: str, venue: str, symbol: str,
                    amount: float) -> None:
        """Move cash into (amount>0) or out of (amount<0) a perp's margin."""
        key = (venue, symbol)
        pos = self.positions.get(key)
        if pos is None:
            pos = Position(venue, symbol, Kind.PERP, strategy=strategy, opened_t=t)
            self.positions[key] = pos
        pos.margin += amount
        self._credit(venue, -amount)

    def funding(self, t: float, strategy: str, venue: str, symbol: str,
                amount: float, note: str = "") -> None:
        """Perp funding payment. amount>0 = received."""
        self._credit(venue, amount)
        self.funding_flow += amount
        self.realized_pnl += amount
        self._attribute(strategy, pnl=amount)
        self._log(JournalEntry(t, Event.FUNDING, strategy, venue, symbol, 0.0, 0.0,
                               amount, amount, note))

    def cost(self, t: float, strategy: str, venue: str, amount: float,
             event: Event = Event.FEE, note: str = "") -> None:
        """A pure cost (borrow, shipping, listing fee, subscription...)."""
        self._credit(venue, -amount)
        self.fees_paid += amount
        self.realized_pnl -= amount
        self._attribute(strategy, pnl=-amount, fee=amount)
        self._log(JournalEntry(t, event, strategy, venue, self.base, 0.0, 0.0,
                               -amount, -amount, note))

    def write_off(self, t: float, strategy: str, venue: str, symbol: str,
                  note: str = "") -> float:
        """Destroy a position entirely (venue failure, unsellable stock)."""
        key = (venue, symbol)
        pos = self.positions.pop(key, None)
        if pos is None:
            return 0.0
        loss = pos.cost_basis + pos.margin
        self.write_offs += loss
        self.realized_pnl -= loss
        self._attribute(strategy, pnl=-loss)
        self._log(JournalEntry(t, Event.WRITE_OFF, strategy, venue, symbol,
                               -pos.qty, pos.avg_price, 0.0, -loss, note))
        return loss

    def seize_venue(self, t: float, venue: str, note: str = "venue failure") -> float:
        """Counterparty blows up: cash and positions at that venue vanish."""
        lost = 0.0
        for (v, ccy), amt in list(self.cash.items()):
            if v == venue:
                lost += amt
                self.cash[(v, ccy)] = 0.0
        for key in [k for k in self.positions if k[0] == venue]:
            pos = self.positions[key]
            lost += self.write_off(t, pos.strategy, venue, key[1], note)
        self.write_offs += max(lost, 0.0)
        self._log(JournalEntry(t, Event.WRITE_OFF, "-", venue, "*", 0.0, 0.0,
                               0.0, -lost, note))
        return lost

    def pay_tax(self, t: float, amount: float, venue: str) -> None:
        if amount <= 0:
            return
        self._credit(venue, -amount)
        self.taxes_paid += amount
        self._log(JournalEntry(t, Event.TAX, "-", venue, self.base, 0.0, 0.0,
                               -amount, -amount, "tax settlement"))

    # -- valuation ---------------------------------------------------------
    def gross_equity(self, prices: dict[tuple[str, str], float]) -> float:
        total = self.total_cash()
        for key, pos in self.positions.items():
            price = prices.get(key, pos.avg_price)
            total += pos.mark_value(price)
        return total

    def accrued_tax(self, tax_rate: float) -> float:
        """Tax owed on cumulative net realised gains (never negative)."""
        return max(0.0, tax_rate * max(0.0, self.realized_pnl) - self.taxes_paid)

    def equity(self, prices: dict[tuple[str, str], float],
               tax_rate: float = 0.0) -> float:
        """After-tax equity. This is the number that matters."""
        return self.gross_equity(prices) - self.accrued_tax(tax_rate)

    def snapshot(self, t: float, prices: dict[tuple[str, str], float],
                 tax_rate: float = 0.0) -> float:
        eq = self.equity(prices, tax_rate)
        self.equity_curve.append((t, eq))
        self.high_water = max(self.high_water, eq)
        return eq

    def drawdown(self, current_equity: float) -> float:
        if self.high_water <= 0:
            return 0.0
        return max(0.0, (self.high_water - current_equity) / self.high_water)

    def summary(self, prices: dict[tuple[str, str], float],
                tax_rate: float = 0.0) -> dict:
        return {
            "deposited": self.deposited,
            "cash": self.total_cash(),
            "gross_equity": self.gross_equity(prices),
            "equity_after_tax": self.equity(prices, tax_rate),
            "realized_pnl": self.realized_pnl,
            "fees_paid": self.fees_paid,
            "funding_flow": self.funding_flow,
            "write_offs": self.write_offs,
            "taxes_accrued": self.accrued_tax(tax_rate),
            "open_positions": len(self.positions),
            "pnl_by_strategy": dict(self.pnl_by_strategy),
            "trades_by_strategy": dict(self.trades_by_strategy),
        }
