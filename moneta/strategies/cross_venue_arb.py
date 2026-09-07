"""Cross-venue spot arbitrage -- the idea everybody has, and why it fails.

MECHANISM: the same asset trades at slightly different prices on two
exchanges. Buy on the cheap one, sell on the expensive one, pocket the
difference. It is genuinely riskless *if* both legs fill.

WHY IT IS IN MONETA: because it is the single most common "I'll write a bot
and print money" idea on Reddit and YouTube, and it is the cleanest possible
demonstration of what the friction model is for. The gross spread on a
liquid pair is a few basis points. A retail round trip costs 21-32bps. The
edge is real and it is smaller than the toll.

The implementation is NOT a strawman: it filters aggressively, only firing
when the observed dislocation clears its own modelled cost plus a margin,
and it accounts for the fact that the window may have closed during the
~100-200ms your order spends in flight -- in which case you are left holding
one leg and must unwind it at a loss (adverse selection).

Cross-venue inventory has to be rebalanced too: you end up long cash on one
venue and long coin on the other, and moving either back costs a fee and
hours of transfer time.
"""
from __future__ import annotations

from ..core.ledger import Kind, Ledger, Event
from ..core.strategy import (MarketContext, Opportunity, Strategy, StrategyKind)


class CrossVenueArb(Strategy):
    """Buy on the cheap venue, sell on the rich one -- if the toll allows."""

    name = "cross_venue_arb"
    kind = StrategyKind.CAPITAL
    venues = ("ex1", "ex2")
    prior_sigma = 0.002
    upkeep_h_per_week = 1.0
    monthly_cost = 25.0          # a VPS near the exchange and a data feed

    #: required net edge, in bps, on top of all modelled costs
    min_net_bps = 1.5

    def new_state(self) -> dict:
        return {"attempts": 0, "fills": 0, "stale": 0, "rejected": 0,
                "gross_bps_taken": 0.0, "imbalance": 0.0, "transfers": 0,
                "skipped": 0}

    def deposit_split(self) -> dict[str, float]:
        return {"ex1": 0.5, "ex2": 0.5}

    # ------------------------------------------------------------------
    def _net_bps(self, ctx: MarketContext, w, notional: float) -> float:
        """Expected net basis points after every modelled cost."""
        f = ctx.frictions
        part_buy = notional / max(ctx.adv(w.buy_venue, w.symbol), 1.0)
        part_sell = notional / max(ctx.adv(w.sell_venue, w.symbol), 1.0)
        cost = f.trade_cost_bps(part_buy) + f.trade_cost_bps(part_sell)
        stale = f.stale_probability(w.halflife_ms)
        # if the window closes mid-flight you keep the costs and lose the edge,
        # plus roughly half a spread unwinding the leg that did fill
        unwind = f.half_spread_bps + f.slippage_base_bps
        expected = (1 - stale) * (w.gross_bps - cost) - stale * (cost + unwind)
        # amortised rebalancing: every arb shifts inventory across venues
        rebalance_bps = (f.transfer_fee_flat / max(notional, 1.0)) * 1e4 * 0.5
        return expected - rebalance_bps

    def scan(self, ctx: MarketContext) -> list[Opportunity]:
        out: list[Opportunity] = []
        dead = ctx.data["dead_venues"]
        for w in ctx.data["arb_windows"]:
            if w.buy_venue in dead or w.sell_venue in dead:
                continue
            notional = min(w.capacity, 25_000.0)
            net = self._net_bps(ctx, w, notional)
            if net <= self.min_net_bps:
                continue
            out.append(Opportunity(
                strategy=self.name,
                label=f"{w.symbol} {w.buy_venue}->{w.sell_venue} {w.gross_bps:.1f}bps",
                edge=net * 1e-4, edge_std=abs(net) * 1e-4 * 1.5,
                capital=notional, horizon_h=0.01,
                meta={"gross_bps": w.gross_bps, "net_bps": net,
                      "halflife_ms": w.halflife_ms, "window": w}))
        out.sort(key=lambda o: -o.edge)
        return out

    def mark_prices(self, ctx: MarketContext) -> dict[tuple[str, str], float]:
        return {}     # positions are opened and closed within the same tick

    def capital_in_use(self, ctx, ledger, state) -> float:
        """Everything on both venues is working capital: it has to be sitting
        there in advance or the trade cannot be done at all."""
        return ledger.cash_at("ex1") + ledger.cash_at("ex2")

    def capacity(self, ctx: MarketContext, state: dict) -> float:
        return sum(min(w.capacity, 25_000.0) for w in ctx.data["arb_windows"]) or 5_000.0

    # ------------------------------------------------------------------
    def step(self, ctx: MarketContext, ledger: Ledger, capital: float,
             state: dict, paper: bool) -> float:
        f, st = ctx.frictions, state
        if capital <= 0:
            return 0.0

        budget = min(capital, ledger.cash_at("ex1") + ledger.cash_at("ex2"))
        opportunities = self.scan(ctx)
        st["skipped"] += len(ctx.data["arb_windows"]) - len(opportunities)

        for opp in opportunities:
            w = opp.meta["window"]
            notional = min(opp.capital, budget * 0.5)
            if notional < 100.0:
                break
            if ledger.cash_at(w.buy_venue) < notional:
                break

            st["attempts"] += 1
            if ctx.rng.random() < f.reject_rate:
                st["rejected"] += 1
                continue

            part_buy = notional / max(ctx.adv(w.buy_venue, w.symbol), 1.0)
            part_sell = notional / max(ctx.adv(w.sell_venue, w.symbol), 1.0)
            cost_bps = f.trade_cost_bps(part_buy) + f.trade_cost_bps(part_sell)

            went_stale = ctx.rng.random() < f.stale_probability(w.halflife_ms)
            if went_stale:
                st["stale"] += 1
                realised_bps = -(cost_bps + f.half_spread_bps + f.slippage_base_bps)
            else:
                st["fills"] += 1
                st["gross_bps_taken"] += w.gross_bps
                realised_bps = w.gross_bps - cost_bps

            # both legs net out within the tick; book the outcome as one trade
            px = ctx.price(w.buy_venue, w.symbol)
            qty = notional / px
            ledger.trade(ctx.t, self.name, w.buy_venue, "ARB", Kind.SPOT,
                         qty, px, 0.0, "arb: buy leg")
            ledger.trade(ctx.t, self.name, w.buy_venue, "ARB", Kind.SPOT,
                         -qty, px * (1 + realised_bps * 1e-4), 0.0,
                         f"arb: sell leg {realised_bps:+.1f}bps")

            st["imbalance"] += notional
            budget -= notional

        # -- inventory rebalancing between venues ----------------------------
        if st["imbalance"] > max(capital, 1.0) * 1.5:
            fee = f.transfer_fee_flat
            if ledger.cash_at("ex1") > fee:
                ledger.transfer(ctx.t, "ex1", "ex2", 0.0, fee, self.name)
                st["transfers"] += 1
                st["imbalance"] = 0.0

        # -- fixed running costs -----------------------------------------------
        monthly_tick_cost = self.monthly_cost / (30.0 * 3.0)
        if ledger.cash_at("ex1") > monthly_tick_cost:
            ledger.cost(ctx.t, self.name, "ex1", monthly_tick_cost,
                        Event.FEE, "VPS + data feed")
        return self.upkeep_h_per_week / 21.0

    def liquidate(self, ctx, ledger, state) -> None:
        pass
