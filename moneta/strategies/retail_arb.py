"""Retail / marketplace arbitrage: buy things below their resale value.

MECHANISM: identical goods clear at different prices on different venues and
at different times. Someone selling a used espresso machine at 08:00 on a
local classifieds app wants it gone; someone on a national marketplace will
pay the going rate for it three weeks later. The gap is large -- 40-120% is
routine -- because the two populations barely overlap and the seller is
paying for speed and convenience.

WHERE THE MONEY COMES FROM: sellers buying liquidity and buyers buying
selection. Both are getting something they want. Nobody is being tricked,
which is more than can be said for most "passive income" pitches.

WHY IT BELONGS IN A PROGRAM: the edge per item is obvious to a human in
five seconds. The bottleneck is *finding* enough items -- that is search,
filtering and ranking over thousands of listings, which is exactly what a
computer is for. The human still has to buy, photograph, list and ship.

WHAT MAKES IT DIFFERENT FROM THE OTHER STRATEGIES: it is bounded by
attention, not capital. Doubling the money does nothing once the hours run
out. MONETA measures it in EUR per labour-hour precisely so this ceiling
shows up in the numbers instead of in a nasty surprise six months in.

WHAT KILLS IT: items that do not sell (capital dead on a shelf), items that
are not as described, returns, and marketplace fee changes.
"""
from __future__ import annotations

from ..core.ledger import Event, Kind, Ledger
from ..core.strategy import (MarketContext, Opportunity, Strategy, StrategyKind)


class RetailArb(Strategy):
    """Source under-priced goods, resell them, get paid for the attention."""

    name = "retail_arb"
    kind = StrategyKind.LABOR
    venues = ("market",)
    prior_sigma = 0.012
    upkeep_h_per_week = 1.0
    monthly_cost = 15.0            # listing tools / storage

    #: minimum expected net return on the cash tied up in one item
    min_roi = 0.22
    #: minimum expected euros per hour of human attention
    min_eur_per_hour = 18.0
    #: fire-sale an item that has not sold after this many days
    stale_days = 120.0
    fire_sale_ratio = 0.45

    def new_state(self) -> dict:
        return {"inventory": [], "bought": 0, "sold": 0, "duds": 0,
                "fire_sales": 0, "returns": 0, "labor_h": 0.0,
                "lost_to_competition": 0,
                "revenue": 0.0, "cogs": 0.0, "passed": 0, "next_id": 0}

    # ------------------------------------------------------------------
    def _expected_net(self, ctx: MarketContext, deal) -> float:
        """Expected euros kept from one flip, after every cost."""
        f = ctx.frictions
        keep = f.commerce_net_pct()
        gross = deal.resale_est * keep - f.shipping_cost - f.payment_fee_flat
        return (1.0 - deal.condition_risk) * gross - deal.cost

    def scan(self, ctx: MarketContext) -> list[Opportunity]:
        out = []
        for d in ctx.data["deals"]:
            net = self._expected_net(ctx, d)
            roi = net / max(d.cost, 1e-9)
            eur_h = net / max(d.labor_h, 1e-9)
            if roi < self.min_roi or eur_h < self.min_eur_per_hour:
                continue
            horizon = d.sell_halflife_days * 24.0
            out.append(Opportunity(
                strategy=self.name,
                label=f"{d.category} {d.sku}: pay {d.cost:.0f} -> sell ~{d.resale_est:.0f}",
                edge=roi, edge_std=roi * 0.55, capital=d.cost,
                horizon_h=horizon, labor_h=d.labor_h,
                meta={"deal": d, "net_eur": net, "roi": roi,
                      "eur_per_hour": eur_h}))
        # best euros-per-hour first: attention is the binding constraint
        out.sort(key=lambda o: -o.meta["eur_per_hour"])
        return out

    def mark_prices(self, ctx: MarketContext) -> dict[tuple[str, str], float]:
        """Inventory is carried at cost -- never mark unsold stock to hope."""
        return {}

    def capital_in_use(self, ctx, ledger, state) -> float:
        """Money tied up in stock sitting on the shelf."""
        return sum(i["cost"] for i in state.get("inventory", ()))

    def capacity(self, ctx: MarketContext, state: dict) -> float:
        """The most stock this can hold before hours, not money, bind.

        Attention is the constraint: you can only source and ship so many
        items a week, and each one sits on the shelf for a while before it
        sells. That product -- items in flight times what an item costs --
        is the ceiling, and no amount of extra capital raises it. Handing
        this strategy more than this figure would park cash it cannot use
        inside a book where it earns nothing.
        """
        hours = ctx.data.get("labor_budget_h", 0.0) * 21.0      # per week
        flips_per_week = hours / max(0.75, 1e-9)
        weeks_on_shelf = 21.0 / 7.0
        held = sum(i["cost"] for i in state.get("inventory", ()))
        avg_cost = (held / max(len(state.get("inventory", ())), 1)) if held else 45.0
        return max(500.0, flips_per_week * weeks_on_shelf * avg_cost * 1.6)

    # ------------------------------------------------------------------
    def step(self, ctx: MarketContext, ledger: Ledger, capital: float,
             state: dict, paper: bool) -> float:
        f, st = ctx.frictions, state
        labor_used = 0.0
        labor_left = ctx.data.get("labor_remaining", ctx.data["labor_budget_h"])

        # -- 1. work the existing inventory ---------------------------------
        labor_used += self._process_inventory(ctx, ledger, st, labor_left - labor_used)

        # -- 2. source new stock ---------------------------------------------
        opportunities = self.scan(ctx)
        st["passed"] += len(ctx.data["deals"]) - len(opportunities)
        cash = ledger.cash_at("market")
        deployable = min(capital, cash) if capital > 0 else 0.0

        for opp in opportunities:
            d = opp.meta["deal"]
            sourcing_h = d.labor_h * 0.6          # find, negotiate, collect, list
            if d.cost > deployable or sourcing_h > (labor_left - labor_used):
                continue
            fee = f.payment_fee_pct * d.cost + f.payment_fee_flat
            if d.cost + fee > ledger.cash_at("market"):
                continue

            # somebody else got there first. The hours spent looking at it
            # are still gone -- that is what makes sourcing a real cost.
            if ctx.rng.random() < d.competition:
                labor_used += sourcing_h * 0.35
                st["lost_to_competition"] += 1
                continue

            sym = f"INV:{st['next_id']}"
            ledger.trade(ctx.t, self.name, "market", sym, Kind.INVENTORY,
                         d.cost, 1.0, fee, f"buy {d.sku}")
            st["inventory"].append({
                "sym": sym, "sku": d.sku, "cost": d.cost,
                "resale": d.resale_true, "bought_t": ctx.t,
                "halflife_days": d.sell_halflife_days,
                "ship_labor_h": d.labor_h * 0.4,
                "dud": ctx.rng.random() < d.condition_risk,
                "relisted": 0,
            })
            st["next_id"] += 1
            st["bought"] += 1
            st["cogs"] += d.cost
            deployable -= d.cost
            labor_used += sourcing_h

        # -- 3. fixed costs -----------------------------------------------------
        tick_cost = self.monthly_cost / 90.0
        if ledger.cash_at("market") > tick_cost:
            ledger.cost(ctx.t, self.name, "market", tick_cost, Event.FEE,
                        "listing tools / storage")

        st["labor_h"] += labor_used
        ctx.data["labor_remaining"] = max(0.0, labor_left - labor_used)
        return labor_used + self.upkeep_h_per_week / 21.0

    # ------------------------------------------------------------------
    def _process_inventory(self, ctx: MarketContext, ledger: Ledger,
                           st: dict, labor_left: float) -> float:
        """Sell, refund, write off and fire-sale the stock on the shelf.

        Each item is its own ledger symbol carried at cost, so a write-off
        removes exactly that item and a sale realises exactly
        (proceeds - cost) with no pooling artefacts.
        """
        f = ctx.frictions
        keep = 1.0 - f.marketplace_fee_pct - f.payment_fee_pct
        used = 0.0
        still: list[dict] = []

        for item in st["inventory"]:
            age_days = (ctx.t - item["bought_t"]) / 24.0

            # an item that was never sellable is discovered on inspection
            if item["dud"] and age_days >= 1.0:
                ledger.write_off(ctx.t, self.name, "market", item["sym"],
                                 f"not as described: {item['sku']}")
                st["duds"] += 1
                continue

            hazard = 1.0 - 0.5 ** ((ctx.dt_h / 24.0) / max(item["halflife_days"], 0.1))
            fire_sale = age_days > self.stale_days
            if not (fire_sale or ctx.rng.random() < hazard):
                still.append(item)
                continue

            if used + item["ship_labor_h"] > labor_left:
                still.append(item)            # no hours left to pack it today
                continue
            used += item["ship_labor_h"]

            price = item["resale"] * (self.fire_sale_ratio if fire_sale else 1.0)

            # the buyer sends it back: two lots of postage plus damage, and
            # the item goes back on the shelf worth less than before
            if not fire_sale and ctx.rng.random() < f.return_rate:
                damage = price * f.return_loss_pct
                ledger.cost(ctx.t, self.name, "market",
                            2 * f.shipping_cost + f.payment_fee_flat,
                            Event.FEE, f"return: {item['sku']}")
                st["returns"] += 1
                item = {**item, "bought_t": ctx.t,
                        "resale": max(item["resale"] - damage, item["cost"] * 0.3),
                        "relisted": item["relisted"] + 1}
                if item["relisted"] >= 3:
                    ledger.write_off(ctx.t, self.name, "market", item["sym"],
                                     "unsellable after repeated returns")
                    st["duds"] += 1
                    continue
                still.append(item)
                continue

            proceeds = price * keep - f.shipping_cost - f.payment_fee_flat
            cost = item["cost"]
            ledger.trade(ctx.t, self.name, "market", item["sym"], Kind.INVENTORY,
                         -cost, proceeds / cost, 0.0, f"sell {item['sku']}")
            st["revenue"] += proceeds
            st["sold"] += 1
            if fire_sale:
                st["fire_sales"] += 1

        st["inventory"] = still
        return used

    def liquidate(self, ctx: MarketContext, ledger: Ledger, state: dict) -> None:
        """Dump remaining stock at the fire-sale price."""
        f = ctx.frictions
        keep = 1.0 - f.marketplace_fee_pct - f.payment_fee_pct
        for item in state["inventory"]:
            proceeds = max(item["resale"] * self.fire_sale_ratio * keep
                           - f.shipping_cost - f.payment_fee_flat, 0.0)
            cost = item["cost"]
            ledger.trade(ctx.t, self.name, "market", item["sym"], Kind.INVENTORY,
                         -cost, proceeds / cost, 0.0, "liquidate stock")
            state["revenue"] += proceeds
        state["inventory"] = []
