"""Statistical arbitrage on a cointegrated pair.

MECHANISM: two assets driven by the same underlying factor drift apart for
reasons unrelated to that factor. Short the rich one, buy the cheap one, and
wait for the gap to close. Market-neutral by construction.

WHERE THE MONEY COMES FROM: whoever needed liquidity urgently enough to push
one leg away from its fair relationship. That is a real counterparty, but it
is also a crowded one -- this is the most competed-for edge in the file.

WHAT KILLS IT: the relationship simply stops holding. A spread that has
mean-reverted for two years is not obliged to do it again, and the trade that
kills you is the one where you keep averaging into a "cheap" spread that has
permanently re-based. The simulator injects exactly that: a slow random-walk
component in the spread plus occasional hard cointegration breaks.

The strategy is NOT allowed to see the true spread volatility -- it estimates
it from its own rolling history, like a real implementation must.
"""
from __future__ import annotations

import math

from ..core.ledger import Kind, Ledger
from ..core.strategy import (MarketContext, Opportunity, Strategy, StrategyKind)


class StatArbPairs(Strategy):
    """Mean-reversion on the A/B spread, with a stop for broken relationships."""

    name = "stat_arb_pairs"
    kind = StrategyKind.CAPITAL
    venues = ("ex1",)
    prior_sigma = 0.006
    upkeep_h_per_week = 1.5
    monthly_cost = 0.0

    A = ("ex1", "PA")
    B = ("ex1", "PB")

    def __init__(self, entry_z: float = 2.0, exit_z: float = 0.4,
                 stop_z: float = 4.0, window: int = 120,
                 max_hold_ticks: int = 60):
        self.entry_z = entry_z
        self.exit_z = exit_z
        self.stop_z = stop_z
        self.window = window
        self.max_hold_ticks = max_hold_ticks

    def new_state(self) -> dict:
        return {"hist": [], "side": 0, "entry_z": 0.0, "held": 0,
                "qa": 0.0, "qb": 0.0, "trades": 0, "wins": 0, "stops": 0,
                "timeouts": 0}

    # ------------------------------------------------------------------
    def _observed_spread(self, ctx: MarketContext) -> float:
        """log(PA) - beta*log(PB): what a real implementation can measure."""
        pa, pb = ctx.price(*self.A), ctx.price(*self.B)
        beta = ctx.data["pair"]["beta"]
        return math.log(pa) - beta * math.log(pb)

    def _zscore(self, st: dict, spread: float) -> float | None:
        h = st["hist"]
        if len(h) < 40:
            return None
        m = sum(h) / len(h)
        var = sum((x - m) ** 2 for x in h) / (len(h) - 1)
        sd = math.sqrt(var)
        if sd < 1e-9:
            return None
        return (spread - m) / sd

    def scan(self, ctx: MarketContext) -> list[Opportunity]:
        return []      # signals are generated inside step from private state

    def mark_prices(self, ctx: MarketContext) -> dict[tuple[str, str], float]:
        return {self.A: ctx.price(*self.A), self.B: ctx.price(*self.B)}

    # ------------------------------------------------------------------
    def step(self, ctx: MarketContext, ledger: Ledger, capital: float,
             state: dict, paper: bool) -> float:
        f, st = ctx.frictions, state
        if "ex1" in ctx.data["dead_venues"]:
            st["side"] = 0
            return 0.0

        spread = self._observed_spread(ctx)
        z = self._zscore(st, spread)
        st["hist"].append(spread)
        if len(st["hist"]) > self.window:
            st["hist"].pop(0)
        if z is None:
            return self.upkeep_h_per_week / 21.0

        pa, pb = ctx.price(*self.A), ctx.price(*self.B)

        # -- manage an open position ----------------------------------------
        if st["side"] != 0:
            st["held"] += 1
            signed_z = z * st["side"]          # positive == moved against us
            if signed_z < self.exit_z * (1 if st["side"] else 1) and abs(z) < self.exit_z:
                self._close(ctx, ledger, st, pa, pb, "converged")
            elif abs(z) > self.stop_z and signed_z > 0:
                st["stops"] += 1
                self._close(ctx, ledger, st, pa, pb, "stopped out: spread broke")
            elif st["held"] > self.max_hold_ticks:
                st["timeouts"] += 1
                self._close(ctx, ledger, st, pa, pb, "held too long")
            return self.upkeep_h_per_week / 21.0

        # -- open a new position ---------------------------------------------
        if capital <= 0 or abs(z) < self.entry_z:
            return self.upkeep_h_per_week / 21.0

        cash = ledger.cash_at("ex1")
        notional_per_leg = min(capital, cash) * 0.5
        if notional_per_leg < 50.0:
            return self.upkeep_h_per_week / 21.0
        if ctx.rng.random() < f.reject_rate:
            return self.upkeep_h_per_week / 21.0

        side = -1 if z > 0 else 1      # z>0 => A rich => short A, long B
        qa = notional_per_leg / pa * side
        qb = notional_per_leg / pb * -side

        part = notional_per_leg / max(ctx.adv(*self.A), 1.0)
        cost_bps = f.trade_cost_bps(part)
        fee = notional_per_leg * cost_bps * 1e-4

        ledger.post_margin(ctx.t, self.name, "ex1", "PA", notional_per_leg * f.margin_requirement)
        ledger.post_margin(ctx.t, self.name, "ex1", "PB", notional_per_leg * f.margin_requirement)
        ledger.trade(ctx.t, self.name, "ex1", "PA", Kind.PERP, qa, pa, fee, "pair leg A")
        ledger.trade(ctx.t, self.name, "ex1", "PB", Kind.PERP, qb, pb, fee, "pair leg B")

        st.update(side=side, entry_z=z, held=0, qa=qa, qb=qb)
        st["trades"] += 1
        return self.upkeep_h_per_week / 21.0

    # ------------------------------------------------------------------
    def _close(self, ctx: MarketContext, ledger: Ledger, st: dict,
               pa: float, pb: float, note: str) -> None:
        f = ctx.frictions
        pnl = 0.0
        for key, px in ((self.A, pa), (self.B, pb)):
            pos = ledger.positions.get(key)
            if pos is None or pos.qty == 0:
                continue
            notional = abs(pos.qty) * px
            part = notional / max(ctx.adv(*key), 1.0)
            fee = notional * f.trade_cost_bps(part) * 1e-4
            margin = pos.margin
            pnl += ledger.trade(ctx.t, self.name, key[0], key[1], Kind.PERP,
                                -pos.qty, px, fee, note)
            ledger.post_margin(ctx.t, self.name, key[0], key[1], -margin)
            ledger.positions.pop(key, None)
        if pnl > 0:
            st["wins"] += 1
        st.update(side=0, held=0, qa=0.0, qb=0.0)

    def liquidate(self, ctx: MarketContext, ledger: Ledger, state: dict) -> None:
        if state["side"] != 0:
            self._close(ctx, ledger, state, ctx.price(*self.A), ctx.price(*self.B),
                        "end of run")
