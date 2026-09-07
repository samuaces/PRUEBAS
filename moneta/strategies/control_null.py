"""The control arm: a strategy that is guaranteed to have no edge.

This exists to falsify MONETA itself.

Every claim the system makes rests on one assumption: that the promotion
gate can tell a real edge from a lucky streak. The only way to test that
is to feed it something with a *known* answer. `control_null` takes random
directional positions -- a coin flip, sized like a real trade, paying real
fees. Its true expected return is negative by exactly the cost of trading.

If MONETA ever gives this strategy meaningful capital, MONETA is broken and
the verification suite fails. It is the smoke detector for the entire
apparatus, and it is the reason to trust the numbers the other four produce.
"""
from __future__ import annotations

from ..core.ledger import Kind, Ledger
from ..core.strategy import (MarketContext, Opportunity, Strategy, StrategyKind)


class ControlNull(Strategy):
    """Coin-flip trades with real costs. Must never be funded."""

    name = "control_null"
    kind = StrategyKind.CAPITAL
    venues = ("ex1",)
    prior_sigma = 0.02
    upkeep_h_per_week = 0.0

    SYM = ("ex1", "BTC")

    def __init__(self, hold_ticks: int = 15):
        self.hold_ticks = hold_ticks

    def new_state(self) -> dict:
        return {"held": 0, "qty": 0.0, "trades": 0}

    def scan(self, ctx: MarketContext) -> list[Opportunity]:
        return [Opportunity(strategy=self.name, label="coin flip",
                            edge=0.0, edge_std=0.02, capital=1e9, horizon_h=24.0)]

    def mark_prices(self, ctx: MarketContext) -> dict[tuple[str, str], float]:
        return {self.SYM: ctx.price(*self.SYM)}

    def capital_in_use(self, ctx, ledger, state) -> float:
        """Margin posted against open legs."""
        return sum(p.margin for p in ledger.positions.values())

    def step(self, ctx: MarketContext, ledger: Ledger, capital: float,
             state: dict, paper: bool) -> float:
        f, st = ctx.frictions, state
        if "ex1" in ctx.data["dead_venues"]:
            st["qty"] = 0.0
            return 0.0
        px = ctx.price(*self.SYM)

        if st["qty"] != 0:
            st["held"] += 1
            if st["held"] >= self.hold_ticks:
                self._close(ctx, ledger, st, px)
            return 0.0

        if capital <= 0:
            return 0.0
        notional = min(capital, ledger.cash_at("ex1")) * 0.4
        if notional < 50.0:
            return 0.0
        side = 1.0 if ctx.rng.random() < 0.5 else -1.0
        qty = side * notional / px
        part = notional / max(ctx.adv(*self.SYM), 1.0)
        fee = notional * f.trade_cost_bps(part) * 1e-4
        ledger.post_margin(ctx.t, self.name, "ex1", "BTC", notional * f.margin_requirement)
        ledger.trade(ctx.t, self.name, "ex1", "BTC", Kind.PERP, qty, px, fee, "coin flip")
        st.update(qty=qty, held=0)
        st["trades"] += 1
        return 0.0

    def _close(self, ctx, ledger, st, px):
        f = ctx.frictions
        pos = ledger.positions.get(self.SYM)
        if pos is not None and pos.qty != 0:
            notional = abs(pos.qty) * px
            fee = notional * f.trade_cost_bps(notional / max(ctx.adv(*self.SYM), 1.0)) * 1e-4
            margin = pos.margin
            ledger.trade(ctx.t, self.name, "ex1", "BTC", Kind.PERP, -pos.qty, px, fee, "unwind")
            ledger.post_margin(ctx.t, self.name, "ex1", "BTC", -margin)
            ledger.positions.pop(self.SYM, None)
        st.update(qty=0.0, held=0)

    def liquidate(self, ctx, ledger, state) -> None:
        if state["qty"] != 0:
            self._close(ctx, ledger, state, ctx.price(*self.SYM))
