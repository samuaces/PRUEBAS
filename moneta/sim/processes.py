"""Stochastic processes for the market simulator.

Calibration notes (all annualised unless stated, 8-hour ticks => 1095/yr):

* Major crypto realised vol runs 45-75%/yr. 55%/yr => 1.66% per 8h tick.
* Perpetual funding on major venues is capped near +/-0.75% per 8h interval
  and has historically averaged slightly positive (longs pay shorts) in
  expansion regimes and slightly negative in contractions.
* Price returns are fat-tailed: a pure Gaussian understates the risk that
  kills a levered carry book, so jumps are added explicitly.
* Regimes are persistent: expected regime durations of weeks-to-months, not
  ticks, which is what makes "it worked for three months" so misleading.
"""
from __future__ import annotations

import math
import random

TICKS_PER_YEAR = 1095.0        # 8-hour ticks
TICKS_PER_DAY = 3.0


class OU:
    """Ornstein-Uhlenbeck mean-reverting process.

    dx = theta (mu - x) dt + sigma dW
    `halflife` is given in ticks, which is how humans actually think about
    mean reversion ("the spread closes in about a day").
    """

    def __init__(self, mu: float, sigma: float, halflife: float, x0: float | None = None):
        self.mu = mu
        self.sigma = sigma
        self.theta = math.log(2.0) / max(halflife, 1e-9)
        self.x = mu if x0 is None else x0

    def step(self, rng: random.Random, dt: float = 1.0) -> float:
        # exact discretisation of the OU transition density
        a = math.exp(-self.theta * dt)
        var = self.sigma ** 2 * (1 - a * a) / (2 * self.theta) if self.theta > 0 else \
            self.sigma ** 2 * dt
        self.x = self.mu + a * (self.x - self.mu) + math.sqrt(max(var, 0.0)) * rng.gauss(0, 1)
        return self.x

    def set_mu(self, mu: float) -> None:
        self.mu = mu


class RegimeChain:
    """Persistent Markov regime switching.

    States: 0 = expansion (bull), 1 = range (crab), 2 = contraction (bear).
    `mean_duration_days` controls persistence; transitions are otherwise
    uniform over the other states.
    """
    NAMES = ("expansion", "range", "contraction")

    def __init__(self, mean_duration_days: tuple[float, float, float] = (95.0, 70.0, 55.0),
                 start: int | None = None, rng: random.Random | None = None):
        self.mean_duration = mean_duration_days
        rng = rng or random.Random()
        self.state = start if start is not None else rng.choices([0, 1, 2], [0.4, 0.35, 0.25])[0]
        self.ticks_in_state = 0

    def step(self, rng: random.Random) -> int:
        self.ticks_in_state += 1
        p_switch = 1.0 / (self.mean_duration[self.state] * TICKS_PER_DAY)
        if rng.random() < p_switch:
            others = [s for s in (0, 1, 2) if s != self.state]
            # bull->crab and bear->crab are more likely than bull<->bear
            weights = [3.0 if s == 1 else 1.0 for s in others]
            self.state = rng.choices(others, weights)[0]
            self.ticks_in_state = 0
        return self.state

    @property
    def name(self) -> str:
        return self.NAMES[self.state]


class JumpDiffusion:
    """Geometric Brownian motion with Merton jumps and regime-dependent drift.

    Per tick:  S_{t+1} = S_t * exp((mu - sigma^2/2) dt + sigma sqrt(dt) Z + J)
    where J is a compound Poisson jump with a negative mean (crashes are
    sharper than melt-ups, which is the empirically observed asymmetry).
    """

    def __init__(self, s0: float, ann_vol: float = 0.55,
                 jump_intensity_per_year: float = 14.0,
                 jump_mean: float = -0.012, jump_std: float = 0.05):
        self.s = s0
        self.s0 = s0
        self.ann_vol = ann_vol
        self.lam = jump_intensity_per_year / TICKS_PER_YEAR
        self.jump_mean = jump_mean
        self.jump_std = jump_std

    def step(self, rng: random.Random, ann_drift: float, vol_mult: float = 1.0,
             shock: float = 0.0) -> float:
        sigma = self.ann_vol * vol_mult / math.sqrt(TICKS_PER_YEAR)
        mu = ann_drift / TICKS_PER_YEAR
        z = rng.gauss(0, 1)
        j = 0.0
        if rng.random() < self.lam:
            j = rng.gauss(self.jump_mean, self.jump_std)
        self.s *= math.exp(mu - 0.5 * sigma ** 2 + sigma * z + j + shock)
        self.s = max(self.s, 1e-8)
        return self.s


def poisson(lam: float, rng: random.Random) -> int:
    """Knuth's algorithm; lam here is always small (a few events per tick)."""
    if lam <= 0:
        return 0
    if lam > 30:                       # normal approximation for large lam
        return max(0, int(round(rng.gauss(lam, math.sqrt(lam)))))
    ell = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        p *= rng.random()
        if p <= ell:
            return k
        k += 1
        if k > 200:
            return k


def lognormal(median: float, sigma_log: float, rng: random.Random) -> float:
    return median * math.exp(sigma_log * rng.gauss(0, 1))


def truncated_normal(mean: float, sd: float, lo: float, hi: float,
                     rng: random.Random) -> float:
    """Exact truncated-normal draw by inverse CDF (no rejection bias).

    Rejection sampling would silently distort the tail when the acceptance
    region is narrow -- which is precisely the region a bargain lives in.
    """
    from ..core.stats import norm_cdf, norm_ppf
    a = norm_cdf((lo - mean) / sd)
    b = norm_cdf((hi - mean) / sd)
    if b - a < 1e-12:
        return min(max(mean, lo), hi)
    u = a + rng.random() * (b - a)
    return mean + sd * norm_ppf(min(max(u, 1e-12), 1 - 1e-12))


def truncated_normal_mass(mean: float, sd: float, lo: float, hi: float) -> float:
    """Probability mass of a normal inside [lo, hi]."""
    from ..core.stats import norm_cdf
    return max(0.0, norm_cdf((hi - mean) / sd) - norm_cdf((lo - mean) / sd))


def geometric_hazard(hazard_per_tick: float, rng: random.Random) -> bool:
    """Did the event fire this tick?"""
    return rng.random() < hazard_per_tick
