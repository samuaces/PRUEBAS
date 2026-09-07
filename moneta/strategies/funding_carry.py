"""Delta-neutral perpetual funding carry.

MECHANISM (this is a real, well-documented trade, not an invention):
a perpetual future has no expiry, so exchanges keep its price anchored to
spot by making one side pay the other a "funding" fee every 8 hours. When
the market is net long -- which it usually is in an expansion -- longs pay
shorts. Buying 1 BTC of spot and simultaneously selling 1 BTC of perpetual
leaves you with zero price exposure and collects that fee.

WHERE THE MONEY COMES FROM: leveraged longs paying for their leverage.
That is a genuine, identifiable counterparty, which is the first question
worth asking of any strategy.

WHAT KILLS IT:
  * funding turns negative and stays there (you pay instead of collect);
  * the short leg needs more margin as price rises -- the spot leg gains
    the same amount, but it is in a different account, so you must actually
    move cash or you get liquidated on a position that was never wrong;
  * the exchange holding both legs fails, which costs you 100%, not 20%.

All three are simulated.
"""
from __future__ import annotations

from ..core.ledger import Kind, Ledger, Event
from ..core.strategy import (MarketContext, Opportunity, Strategy, StrategyKind)


class FundingCarry(Strategy):
    """Long spot, short perpetual: harvest funding paid by leveraged longs."""

    name = "funding_carry"
    kind = StrategyKind.CAPITAL
    venues = ("ex1",)
    prior_sigma = 0.004
    upkeep_h_per_week = 0.5
    monthly_cost = 0.0

    SPOT = ("ex1", "BTC")
    PERP = ("ex1", "BTC-PERP")

    def __init__(self, entry_funding: float = 0.00004, exit_funding: float = -0.00002,
                 ema_halflife_ticks: float = 6.0, margin_buffer: float = 2.0,
                 cash_reserve: float = 0.35):
        # enter when smoothed funding exceeds ~4.4%/yr, leave when it goes negative
        self.entry_funding = entry_funding
        self.exit_funding = exit_funding
        self.alpha = 1.0 - 0.5 ** (1.0 / ema_halflife_ticks)
        self.margin_buffer = margin_buffer
        #: cash held back per unit of notional purely to feed the short leg's
        #: margin when price rises. Deploying every last euro is the single
        #: most common way a carry book dies on a trade that was never wrong.
        self.cash_reserve = cash_reserve

    def new_state(self) -> dict:
        return {"ema": 0.0, "warm": 0, "qty": 0.0, "notional": 0.0,
                "liquidations": 0, "entries": 0, "funding_collected": 0.0,
                "deleverages": 0}

    # ------------------------------------------------------------------
    def scan(self, ctx: MarketContext) -> list[Opportunity]:
        fr = ctx.funding_rate(*self.PERP)
        if "ex1" in ctx.data["dead_venues"]:
            return []
        f = ctx.frictions
        # net edge per tick on deployed capital, after amortised entry cost
        capital_per_notional = 1.0 + f.margin_requirement + self.cash_reserve
        edge = fr / capital_per_notional
        return [Opportunity(
            strategy=self.name, label=f"BTC funding {fr*1e4:+.2f}bps/8h",
            edge=edge, edge_std=0.00018 / capital_per_notional,
            capital=1e9, horizon_h=8.0,
            meta={"funding": fr, "annualised": fr * 1095})]

    def mark_prices(self, ctx: MarketContext) -> dict[tuple[str, str], float]:
        return {self.SPOT: ctx.price(*self.SPOT), self.PERP: ctx.price(*self.PERP)}

    def capital_in_use(self, ctx, ledger, state) -> float:
        """Spot leg + posted margin + the reserve held back to feed it.

        The reserve looks like idle cash but it is not: without it the short
        leg gets liquidated on the first sharp rally. It is part of the cost
        of running the position and belongs in the denominator.
        """
        if state.get("qty", 0.0) <= 0:
            return 0.0
        notional = state["qty"] * ctx.price(*self.SPOT)
        return notional * (1.0 + ctx.frictions.margin_requirement + self.cash_reserve)

    # ------------------------------------------------------------------
    def step(self, ctx: MarketContext, ledger: Ledger, capital: float,
             state: dict, paper: bool) -> float:
        f = ctx.frictions
        st = state
        st["ema"] += self.alpha * (ctx.funding_rate(*self.PERP) - st["ema"])
        st["warm"] += 1

        if "ex1" in ctx.data["dead_venues"]:
            st["qty"] = 0.0
            st["notional"] = 0.0
            return 0.0

        spot_px = ctx.price(*self.SPOT)
        perp_px = ctx.price(*self.PERP)

        # -- collect / pay funding on the open short leg --------------------
        if st["qty"] > 0:
            fr = ctx.funding_rate(*self.PERP)
            notional = st["qty"] * perp_px
            payment = fr * notional          # short receives when fr > 0
            ledger.funding(ctx.t, self.name, "ex1", "BTC-PERP", payment,
                           note=f"funding {fr*1e4:+.2f}bps")
            st["funding_collected"] += payment
            self._maintain_margin(ctx, ledger, state, perp_px)

        # -- exit -----------------------------------------------------------
        if st["qty"] > 0 and (st["ema"] < self.exit_funding or capital <= 0):
            self._close(ctx, ledger, state, "funding turned negative")

        # -- entry ------------------------------------------------------------
        elif st["qty"] == 0 and st["warm"] >= 6 and st["ema"] > self.entry_funding \
                and capital > 0:
            cash = ledger.cash_at("ex1")
            deployable = min(capital, cash)
            notional = deployable / (1.0 + f.margin_requirement + self.cash_reserve)
            if notional * 1.0 > 50.0:        # skip dust
                qty = notional / spot_px
                part = notional / max(ctx.adv(*self.SPOT), 1.0)
                cost_bps = f.trade_cost_bps(part)
                if ctx.rng.random() > f.reject_rate:
                    fee_spot = notional * cost_bps * 1e-4
                    fee_perp = notional * cost_bps * 1e-4
                    ledger.trade(ctx.t, self.name, "ex1", "BTC", Kind.SPOT,
                                 qty, spot_px, fee_spot, "carry: buy spot")
                    ledger.post_margin(ctx.t, self.name, "ex1", "BTC-PERP",
                                       notional * f.margin_requirement)
                    ledger.trade(ctx.t, self.name, "ex1", "BTC-PERP", Kind.PERP,
                                 -qty, perp_px, fee_perp, "carry: short perp")
                    st["qty"] = qty
                    st["notional"] = notional
                    st["entries"] += 1

        # -- resize if the allocator cut us hard ------------------------------
        elif st["qty"] > 0 and capital > 0:
            target_notional = capital / (1.0 + f.margin_requirement
                                        + self.cash_reserve)
            if target_notional < st["notional"] * 0.5:
                self._close(ctx, ledger, state, "allocation cut")

        return self.upkeep_h_per_week / 21.0

    # ------------------------------------------------------------------
    def _maintain_margin(self, ctx: MarketContext, ledger: Ledger, st: dict,
                         perp_px: float) -> None:
        """Top the short leg's margin up, or get liquidated trying.

        The spot leg has gained exactly what the perp leg lost, but the gain
        is unrealised and sits in a different sub-account. Real carry books
        die here.
        """
        f = ctx.frictions
        pos = ledger.positions.get(self.PERP)
        if pos is None or pos.qty == 0:
            return
        notional = abs(pos.qty) * perp_px
        equity = pos.margin + pos.unrealized(perp_px)
        required = notional * f.maintenance_margin

        if equity >= required * self.margin_buffer:
            return

        need = notional * f.margin_requirement - equity
        cash = ledger.cash_at("ex1")
        if need <= cash:
            ledger.post_margin(ctx.t, self.name, "ex1", "BTC-PERP", need)
            return

        # Not enough free cash. Deleverage BOTH legs together -- shrinking
        # only the spot side would leave the book net short on a position
        # that was supposed to have no view at all.
        spot_px = ctx.price(*self.SPOT)
        spot = ledger.positions.get(self.SPOT)
        if spot is not None and spot.qty > 0:
            shrink = min(0.5, max(0.15, (need - cash) / max(notional, 1.0)))
            cut_qty = spot.qty * shrink
            part = cut_qty * spot_px / max(ctx.adv(*self.SPOT), 1.0)
            ledger.trade(ctx.t, self.name, "ex1", "BTC", Kind.SPOT, -cut_qty,
                         spot_px, cut_qty * spot_px * f.trade_cost_bps(part) * 1e-4,
                         "deleverage: spot leg")
            cover = min(abs(pos.qty), cut_qty)
            released = pos.margin * (cover / max(abs(pos.qty), 1e-12))
            ledger.trade(ctx.t, self.name, "ex1", "BTC-PERP", Kind.PERP, cover,
                         perp_px, cover * perp_px * f.trade_cost_bps(part) * 1e-4,
                         "deleverage: perp leg")
            ledger.post_margin(ctx.t, self.name, "ex1", "BTC-PERP", -released)
            st["qty"] = max(0.0, st["qty"] - cut_qty)
            st["notional"] = st["qty"] * spot_px
            st["deleverages"] = st.get("deleverages", 0) + 1

            pos = ledger.positions.get(self.PERP)
            if pos is None or pos.qty == 0:
                st["qty"] = 0.0
                return
            notional = abs(pos.qty) * perp_px
            required = notional * f.maintenance_margin
            equity = pos.margin + pos.unrealized(perp_px)
            cash = ledger.cash_at("ex1")
            top = min(max(notional * f.margin_requirement - equity, 0.0), cash)
            if top > 0:
                ledger.post_margin(ctx.t, self.name, "ex1", "BTC-PERP", top)
                equity += top

        if equity < required:
            # liquidation: the perp position is force-closed and the margin is gone
            ledger.trade(ctx.t, self.name, "ex1", "BTC-PERP", Kind.PERP,
                         -pos.qty, perp_px, notional * f.taker_fee_bps * 1e-4 * 2,
                         "LIQUIDATED")
            lost = ledger.positions.get(self.PERP)
            if lost is not None:
                ledger.post_margin(ctx.t, self.name, "ex1", "BTC-PERP", -lost.margin)
                ledger.cost(ctx.t, self.name, "ex1", lost.margin,
                            Event.WRITE_OFF, "liquidation penalty")
                ledger.positions.pop(self.PERP, None)
            st["liquidations"] += 1
            self._close_spot(ctx, ledger, st, "post-liquidation unwind")

    def _close_spot(self, ctx, ledger, st, note):
        f = ctx.frictions
        spot = ledger.positions.get(self.SPOT)
        if spot is not None and spot.qty > 0:
            px = ctx.price(*self.SPOT)
            part = spot.qty * px / max(ctx.adv(*self.SPOT), 1.0)
            fee = spot.qty * px * f.trade_cost_bps(part) * 1e-4
            ledger.trade(ctx.t, self.name, "ex1", "BTC", Kind.SPOT,
                         -spot.qty, px, fee, note)
        st["qty"] = 0.0
        st["notional"] = 0.0

    def _close(self, ctx: MarketContext, ledger: Ledger, st: dict, note: str) -> None:
        f = ctx.frictions
        perp = ledger.positions.get(self.PERP)
        if perp is not None and perp.qty != 0:
            px = ctx.price(*self.PERP)
            notional = abs(perp.qty) * px
            part = notional / max(ctx.adv(*self.PERP), 1.0)
            fee = notional * f.trade_cost_bps(part) * 1e-4
            margin = perp.margin
            ledger.trade(ctx.t, self.name, "ex1", "BTC-PERP", Kind.PERP,
                         -perp.qty, px, fee, note)
            ledger.post_margin(ctx.t, self.name, "ex1", "BTC-PERP", -margin)
            ledger.positions.pop(self.PERP, None)
        self._close_spot(ctx, ledger, st, note)

    def liquidate(self, ctx: MarketContext, ledger: Ledger, state: dict) -> None:
        self._close(ctx, ledger, state, "end of run")
