"""The simulated world.

One `SimWorld` produces a single coherent history that ALL strategies see.
That matters: if each strategy had its own private random world, the
portfolio would look far more diversified than it is. Here a crash hits the
carry book, the stat-arb book and the marketplace at the same time, exactly
as it would in real life.

Everything below is parameterised from publicly observable retail conditions
and is stated explicitly so the assumptions can be argued with. The point of
this file is to be falsifiable, not flattering.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

from ..core.frictions import FrictionModel
from ..core.strategy import MarketContext
from .processes import (OU, JumpDiffusion, RegimeChain, TICKS_PER_DAY,
                        TICKS_PER_YEAR, lognormal, poisson, truncated_normal,
                        truncated_normal_mass)


# --------------------------------------------------------------------------
# Objects handed to strategies
# --------------------------------------------------------------------------

@dataclass
class ArbWindow:
    """A momentary price dislocation between two venues."""
    symbol: str
    buy_venue: str
    sell_venue: str
    gross_bps: float          # raw price difference, before any cost
    halflife_ms: float        # how fast it decays
    capacity: float           # notional it can absorb before impact kills it


@dataclass
class Deal:
    """A physical item that may or may not be worth more than it costs.

    Two prices matter and they are not the same number. `resale_est` is what
    a comparables lookup tells you the thing is worth -- that is all you can
    see when deciding. `resale_true` is what it actually fetches, and it is
    only revealed when it sells. Handing a backtest the true price is the
    most flattering bug in this entire domain, so it is kept out of reach.
    """
    sku: str
    category: str
    cost: float               # what you pay now
    resale_est: float         # comparables estimate -- visible to the strategy
    resale_true: float        # what it really fetches -- revealed at sale
    sell_halflife_days: float # median time to sell
    labor_h: float            # sourcing + listing + packing + shipping
    condition_risk: float     # P(item is not as described / unsellable)
    competition: float        # P(somebody else buys it first)

    @property
    def gross_margin(self) -> float:
        return self.resale_est / self.cost - 1.0


@dataclass
class Scenario:
    """Deterministic stress injected on top of the stochastic world.

    All `*_at_day` fields are counted from the start of LIVE TRADING, not
    from the start of the simulation. A crash that lands during the paper
    validation period tests nothing: the engine has no money deployed yet,
    so it would "survive" every scenario by having been asleep. `offset_days`
    is set by the harness to the length of the warm-up.
    """
    name: str = "base"
    offset_days: float = 0.0
    crash_at_day: float | None = None
    crash_size: float = -0.35          # instantaneous log shock
    funding_flip_at_day: float | None = None   # force sustained negative funding
    venue_failure_at_day: float | None = None
    failing_venue: str = "ex2"
    fee_multiplier_at_day: float | None = None
    fee_multiplier: float = 2.0
    marketplace_fee_shock: float = 0.0  # added to marketplace_fee_pct
    cointegration_break_at_day: float | None = None
    vol_multiplier: float = 1.0


@dataclass
class WorldConfig:
    days: int = 365
    labor_hours_per_week: float = 10.0
    # -- assets -----------------------------------------------------------
    btc0: float = 30000.0
    btc_ann_vol: float = 0.55
    # regime-dependent annual drift for the risky asset
    drift_by_regime: tuple[float, float, float] = (0.55, 0.02, -0.45)
    # -- funding (fraction of notional per 8h interval) --------------------
    # long-run averages: +1.2bps/8h in expansion (~13%/yr), +0.6bps in range,
    # -0.4bps in contraction. Venue cap +/-75bps.
    funding_mu_by_regime: tuple[float, float, float] = (0.00012, 0.00006, -0.00004)
    funding_sigma: float = 0.000105     # => stationary sd ~1.8bps per interval
    funding_halflife_ticks: float = 9.0
    funding_cap: float = 0.0075
    # -- cross-venue dislocations -----------------------------------------
    arb_lambda_by_regime: tuple[float, float, float] = (1.1, 0.55, 1.6)
    arb_gross_mean_bps: float = 4.5
    arb_dislocation_prob: float = 0.05
    arb_dislocation_mean_bps: float = 38.0
    arb_halflife_ms_median: float = 850.0
    arb_capacity_median: float = 3500.0
    # -- cointegrated pair -------------------------------------------------
    pair_spread_sd: float = 0.012        # stationary sd of the tradable spread
    pair_halflife_ticks: float = 15.0
    pair_drift_sd: float = 0.0032        # permanent, non-reverting component
    pair_break_hazard_monthly: float = 0.030
    # -- marketplace -------------------------------------------------------
    # A scanner sweeps thousands of listings; these are the ones that survive
    # a coarse category/price filter and get a comparables lookup. Most of
    # them are NOT bargains -- the cost ratio is centred just below fair
    # value, so genuine finds sit in the left tail and are rare.
    deal_lambda: float = 45.0            # listings priced up per 8h tick
    deal_emit_ratio: float = 0.78        # only these are worth a human look
    deal_resale_median: float = 70.0
    deal_resale_sigma_log: float = 0.75
    deal_cost_ratio_mean: float = 0.90   # cost as a fraction of estimated resale
    deal_cost_ratio_sd: float = 0.20
    deal_resale_error_sigma: float = 0.20  # how wrong the comparables estimate is
    deal_sell_halflife_median_days: float = 21.0
    deal_labor_h_mean: float = 0.75
    deal_condition_risk: float = 0.06
    # The better the bargain, the faster somebody else takes it.
    deal_competition_base: float = 0.15
    deal_competition_slope: float = 0.85
    # -- venues -------------------------------------------------------------
    adv_ex1: float = 4.0e8
    adv_ex2: float = 6.0e7
    adv_pair: float = 1.2e7


class SimWorld:
    """Generates one coherent market history, tick by tick (8h ticks)."""

    VENUES = ("ex1", "ex2", "market")

    def __init__(self, cfg: WorldConfig | None = None,
                 frictions: FrictionModel | None = None,
                 scenario: Scenario | None = None, seed: int = 0):
        self.cfg = cfg or WorldConfig()
        self.base_frictions = frictions
        self.scenario = scenario or Scenario()
        self.seed = seed
        self.reset(seed)

    # ------------------------------------------------------------------
    def reset(self, seed: int) -> None:
        cfg = self.cfg
        self.rng = random.Random(seed)
        r = self.rng
        self.t = 0.0
        self.tick_idx = 0
        self.n_ticks = int(cfg.days * TICKS_PER_DAY)

        self.regime = RegimeChain(rng=r)
        self.btc = JumpDiffusion(cfg.btc0, ann_vol=cfg.btc_ann_vol)
        self.funding = OU(cfg.funding_mu_by_regime[self.regime.state],
                          cfg.funding_sigma, cfg.funding_halflife_ticks)
        # idiosyncratic basis of venue 2 versus venue 1, in bps
        self.venue2_basis = OU(0.0, 3.5, halflife=6.0)
        # perp basis versus spot, in bps (annualised carry shows up here)
        self.perp_basis = OU(6.0, 5.0, halflife=12.0)

        # cointegrated pair: shared factor + tradable spread + permanent drift
        self.pair_a = JumpDiffusion(100.0, ann_vol=0.62)
        self.pair_spread = OU(0.0, self._pair_sigma(), cfg.pair_halflife_ticks)
        self.pair_permanent = 0.0
        self.pair_beta = 1.0
        self.pair_cointegrated = True

        self.dead_venues: set[str] = set()
        self.frictions = self.base_frictions
        self.history: list[dict] = []
        self.labor_per_tick = cfg.labor_hours_per_week / 21.0   # 21 ticks/week

    def _pair_sigma(self) -> float:
        """OU sigma that yields the configured stationary sd."""
        theta = math.log(2.0) / self.cfg.pair_halflife_ticks
        return self.cfg.pair_spread_sd * math.sqrt(2 * theta)

    # ------------------------------------------------------------------
    @property
    def done(self) -> bool:
        return self.tick_idx >= self.n_ticks

    def tick(self) -> MarketContext:
        cfg, r, sc = self.cfg, self.rng, self.scenario
        abs_day = self.t / 24.0
        # `day` drives the stress scenario only, and is measured from the
        # start of live trading. `abs_day` is the simulation clock and is what
        # the engine sees.
        day = abs_day - sc.offset_days

        # -- regime ---------------------------------------------------------
        state = self.regime.step(r)
        self.funding.set_mu(cfg.funding_mu_by_regime[state])
        if sc.funding_flip_at_day is not None and day >= sc.funding_flip_at_day:
            self.funding.set_mu(-0.00025)      # sustained -27%/yr for shorts

        vol_mult = sc.vol_multiplier
        shock = 0.0
        if sc.crash_at_day is not None and \
                abs(day - sc.crash_at_day) < 1.0 / TICKS_PER_DAY / 2:
            shock = sc.crash_size

        # -- prices ---------------------------------------------------------
        btc = self.btc.step(r, cfg.drift_by_regime[state], vol_mult, shock)
        basis2 = self.venue2_basis.step(r)                 # bps
        perp_basis = self.perp_basis.step(r)               # bps
        btc_ex2 = btc * (1 + basis2 * 1e-4)
        btc_perp = btc * (1 + perp_basis * 1e-4)

        # -- cointegrated pair ----------------------------------------------
        pa = self.pair_a.step(r, cfg.drift_by_regime[state] * 0.7, vol_mult)
        break_now = (r.random() < cfg.pair_break_hazard_monthly / (30 * TICKS_PER_DAY))
        if sc.cointegration_break_at_day is not None and day >= sc.cointegration_break_at_day:
            break_now = break_now or self.pair_cointegrated
        if break_now and self.pair_cointegrated:
            self.pair_cointegrated = False
            self.pair_permanent += r.choice([-1, 1]) * r.uniform(0.04, 0.11)
        if not self.pair_cointegrated and r.random() < 1.0 / (45 * TICKS_PER_DAY):
            self.pair_cointegrated = True      # relationship re-forms elsewhere
            self.pair_spread.x = 0.0
        spread = self.pair_spread.step(r)
        self.pair_permanent += r.gauss(0.0, cfg.pair_drift_sd)
        if not self.pair_cointegrated:
            self.pair_permanent += r.gauss(0.0, cfg.pair_drift_sd * 4)
        pb = pa / self.pair_beta * math.exp(-(spread + self.pair_permanent))

        # -- funding ---------------------------------------------------------
        fr = max(-cfg.funding_cap, min(cfg.funding_cap, self.funding.step(r)))

        # -- frictions (possibly shocked) -------------------------------------
        fr_model = self.base_frictions
        if sc.fee_multiplier_at_day is not None and day >= sc.fee_multiplier_at_day:
            from dataclasses import replace
            fr_model = replace(
                fr_model,
                taker_fee_bps=fr_model.taker_fee_bps * sc.fee_multiplier,
                maker_fee_bps=fr_model.maker_fee_bps * sc.fee_multiplier,
                marketplace_fee_pct=fr_model.marketplace_fee_pct + sc.marketplace_fee_shock)
        elif sc.marketplace_fee_shock:
            from dataclasses import replace
            fr_model = replace(fr_model,
                               marketplace_fee_pct=fr_model.marketplace_fee_pct
                               + sc.marketplace_fee_shock)

        # -- venue failure ------------------------------------------------------
        failed_now: list[str] = []
        hazard = fr_model.venue_failure_annual / TICKS_PER_YEAR
        for v in ("ex1", "ex2"):
            if v in self.dead_venues:
                continue
            forced = (sc.venue_failure_at_day is not None
                      and day >= sc.venue_failure_at_day and v == sc.failing_venue)
            if forced or r.random() < hazard:
                self.dead_venues.add(v)
                failed_now.append(v)

        # -- cross-venue dislocations -------------------------------------------
        windows: list[ArbWindow] = []
        if "ex1" not in self.dead_venues and "ex2" not in self.dead_venues:
            lam = cfg.arb_lambda_by_regime[state] * vol_mult
            for _ in range(poisson(lam, r)):
                if r.random() < cfg.arb_dislocation_prob:
                    gross = r.expovariate(1.0 / cfg.arb_dislocation_mean_bps)
                else:
                    gross = r.expovariate(1.0 / cfg.arb_gross_mean_bps)
                buy, sell = ("ex1", "ex2") if r.random() < 0.5 else ("ex2", "ex1")
                windows.append(ArbWindow(
                    symbol="BTC", buy_venue=buy, sell_venue=sell, gross_bps=gross,
                    halflife_ms=lognormal(cfg.arb_halflife_ms_median, 0.55, r),
                    capacity=lognormal(cfg.arb_capacity_median, 0.7, r)))

        # -- marketplace deal flow ------------------------------------------------
        # The scanner prices up `deal_lambda` listings per tick, but only the
        # fraction cheap enough to be worth a human's time is materialised;
        # the rest cost nothing but CPU. `listings_scanned` keeps the honest
        # denominator for the hit-rate reported to the user.
        deals: list[Deal] = []
        scanned = poisson(cfg.deal_lambda, r)
        emit_p = truncated_normal_mass(cfg.deal_cost_ratio_mean,
                                       cfg.deal_cost_ratio_sd, 0.20,
                                       cfg.deal_emit_ratio)
        for _ in range(poisson(scanned * emit_p, r)):
            est = lognormal(cfg.deal_resale_median, cfg.deal_resale_sigma_log, r)
            ratio = truncated_normal(cfg.deal_cost_ratio_mean, cfg.deal_cost_ratio_sd,
                                     0.20, cfg.deal_emit_ratio, r)
            true_price = est * math.exp(r.gauss(0.0, cfg.deal_resale_error_sigma)
                                        - 0.5 * cfg.deal_resale_error_sigma ** 2)
            margin = 1.0 / ratio - 1.0
            comp = min(0.90, max(0.0, cfg.deal_competition_base
                                 + cfg.deal_competition_slope * max(margin - 0.25, 0.0)))
            deals.append(Deal(
                sku=f"S{self.tick_idx:05d}-{len(deals)}",
                category=r.choice(["audio", "console", "tools", "kitchen", "photo"]),
                cost=est * ratio,
                resale_est=est,
                resale_true=true_price,
                sell_halflife_days=lognormal(cfg.deal_sell_halflife_median_days, 0.6, r),
                labor_h=max(0.20, r.gauss(cfg.deal_labor_h_mean, 0.22)),
                condition_risk=cfg.deal_condition_risk,
                competition=comp))

        prices = {
            ("ex1", "BTC"): btc,
            ("ex1", "BTC-PERP"): btc_perp,
            ("ex2", "BTC"): btc_ex2,
            ("ex1", "PA"): pa,
            ("ex1", "PB"): pb,
        }
        data = {
            "prices": prices,
            "funding": {("ex1", "BTC-PERP"): fr},
            "adv": {("ex1", "BTC"): cfg.adv_ex1, ("ex1", "BTC-PERP"): cfg.adv_ex1,
                    ("ex2", "BTC"): cfg.adv_ex2,
                    ("ex1", "PA"): cfg.adv_pair, ("ex1", "PB"): cfg.adv_pair},
            "regime": self.regime.name,
            "regime_id": state,
            "arb_windows": windows,
            "deals": deals,
            "listings_scanned": scanned,
            "pair": {"a": pa, "b": pb, "beta": self.pair_beta,
                     "spread": spread + self.pair_permanent,
                     "spread_sd": cfg.pair_spread_sd,
                     "cointegrated": self.pair_cointegrated},
            "dead_venues": set(self.dead_venues),
            "failed_now": failed_now,
            "labor_budget_h": self.labor_per_tick,
            "day": abs_day,
            "scenario_day": day,
        }

        ctx = MarketContext(self.t, 8.0, fr_model, r, data)
        self.t += 8.0
        self.tick_idx += 1
        return ctx

    # ------------------------------------------------------------------
    def summary(self) -> dict:
        return {"days": self.cfg.days, "ticks": self.n_ticks,
                "dead_venues": sorted(self.dead_venues),
                "final_regime": self.regime.name,
                "scenario": self.scenario.name}
