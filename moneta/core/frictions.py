"""Friction models -- the reason most backtests lie.

Every cost that stands between a theoretical edge and money in your bank
account lives here: fees, spread, slippage, latency-induced adverse
selection, transfer costs, borrow, returns, taxes and counterparty failure.

MONETA reports the ADVERSARIAL preset by default. If a strategy only works
under OPTIMISTIC, it does not work.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class FrictionModel:
    name: str

    # --- exchange / market microstructure -------------------------------
    taker_fee_bps: float          # per side, basis points of notional
    maker_fee_bps: float
    half_spread_bps: float        # cost of crossing half the quoted spread
    slippage_base_bps: float      # fixed slippage on top of the spread
    impact_coef: float            # sqrt-impact coefficient Y (~ daily vol)
    latency_ms: float             # signal -> exchange round trip
    reject_rate: float            # fraction of orders that simply fail

    # --- carry costs ------------------------------------------------------
    borrow_rate_annual: float     # cost of holding a short leg
    margin_requirement: float     # initial margin fraction for perps
    maintenance_margin: float     # liquidation threshold

    # --- moving money -----------------------------------------------------
    transfer_fee_flat: float      # per rebalancing transfer, in quote ccy
    transfer_hours: float         # capital dead time during a transfer
    fx_spread_bps: float          # converting between currencies

    # --- physical / marketplace commerce ---------------------------------
    marketplace_fee_pct: float    # e.g. eBay/Amazon final value fee
    payment_fee_pct: float        # card / PayPal processing
    payment_fee_flat: float
    shipping_cost: float          # per item shipped
    return_rate: float            # fraction of sales returned
    return_loss_pct: float        # value destroyed per return
    defect_rate: float            # items that turn out unsellable

    # --- the state ---------------------------------------------------------
    tax_rate: float               # on net realised gains

    # --- counterparty ------------------------------------------------------
    venue_failure_annual: float   # P(venue loses your balance in a year)

    # ------------------------------------------------------------------
    def trade_cost_bps(self, participation: float = 0.0, maker: bool = False) -> float:
        """Cost of one *side* of a trade, in basis points.

        `participation` = order notional / average daily volume of the venue.
        Impact follows the empirical square-root law, impact = Y*sqrt(Q/ADV),
        with Y on the order of daily volatility (Almgren et al. 2005; Toth et
        al. 2011). This is what makes size expensive and stops the allocator
        from pretending an edge scales forever.
        """
        fee = self.maker_fee_bps if maker else self.taker_fee_bps
        impact = self.impact_coef * math.sqrt(max(participation, 0.0)) * 1e4
        return fee + self.half_spread_bps + self.slippage_base_bps + impact

    def round_trip_bps(self, participation: float = 0.0, maker: bool = False) -> float:
        return 2.0 * self.trade_cost_bps(participation, maker)

    def stale_probability(self, opportunity_halflife_ms: float) -> float:
        """P(the opportunity is gone by the time your order lands).

        Exponential decay of the opportunity over the latency window. This is
        the single most under-modelled cost in retail arbitrage bots.
        """
        if opportunity_halflife_ms <= 0:
            return 1.0
        lam = math.log(2.0) / opportunity_halflife_ms
        return 1.0 - math.exp(-lam * self.latency_ms)

    def commerce_net_pct(self) -> float:
        """Fraction of gross sale price that survives fees, returns, defects."""
        gross_keep = 1.0 - self.marketplace_fee_pct - self.payment_fee_pct
        returns_drag = self.return_rate * self.return_loss_pct
        return gross_keep * (1.0 - returns_drag) * (1.0 - self.defect_rate)

    def as_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------
# Presets. Numbers are calibrated to publicly documented retail conditions
# (major crypto venue fee tiers, eBay/Amazon final-value fees, consumer
# broadband latency, published marketplace return rates).
# --------------------------------------------------------------------------

OPTIMISTIC = FrictionModel(
    name="optimistic",
    taker_fee_bps=4.0, maker_fee_bps=1.0, half_spread_bps=0.5,
    slippage_base_bps=0.5, impact_coef=0.006, latency_ms=25.0, reject_rate=0.005,
    borrow_rate_annual=0.02, margin_requirement=0.20, maintenance_margin=0.05,
    transfer_fee_flat=1.0, transfer_hours=0.25, fx_spread_bps=5.0,
    marketplace_fee_pct=0.10, payment_fee_pct=0.020, payment_fee_flat=0.30,
    shipping_cost=3.50, return_rate=0.03, return_loss_pct=0.30, defect_rate=0.01,
    tax_rate=0.19, venue_failure_annual=0.002,
)

REALISTIC = FrictionModel(
    name="realistic",
    taker_fee_bps=7.5, maker_fee_bps=2.0, half_spread_bps=1.5,
    slippage_base_bps=1.5, impact_coef=0.018, latency_ms=90.0, reject_rate=0.02,
    borrow_rate_annual=0.06, margin_requirement=0.25, maintenance_margin=0.06,
    transfer_fee_flat=3.0, transfer_hours=1.0, fx_spread_bps=15.0,
    marketplace_fee_pct=0.132, payment_fee_pct=0.029, payment_fee_flat=0.35,
    shipping_cost=5.00, return_rate=0.07, return_loss_pct=0.45, defect_rate=0.03,
    tax_rate=0.24, venue_failure_annual=0.01,
)

ADVERSARIAL = FrictionModel(
    name="adversarial",
    taker_fee_bps=10.0, maker_fee_bps=4.0, half_spread_bps=3.0,
    slippage_base_bps=3.0, impact_coef=0.040, latency_ms=220.0, reject_rate=0.05,
    borrow_rate_annual=0.12, margin_requirement=0.30, maintenance_margin=0.075,
    transfer_fee_flat=6.0, transfer_hours=3.0, fx_spread_bps=30.0,
    marketplace_fee_pct=0.15, payment_fee_pct=0.034, payment_fee_flat=0.45,
    shipping_cost=7.00, return_rate=0.12, return_loss_pct=0.60, defect_rate=0.06,
    tax_rate=0.28, venue_failure_annual=0.03,
)

PRESETS = {p.name: p for p in (OPTIMISTIC, REALISTIC, ADVERSARIAL)}


def get_preset(name: str) -> FrictionModel:
    try:
        return PRESETS[name]
    except KeyError:
        raise SystemExit(f"unknown friction preset {name!r}; "
                         f"choose from {sorted(PRESETS)}")
