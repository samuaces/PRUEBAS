"""Statistical primitives.

Everything in MONETA that decides "does this strategy actually have an edge?"
routes through this module. No external dependencies: the special functions
are implemented here so the engine runs on a bare Python install.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

# --------------------------------------------------------------------------
# Special functions
# --------------------------------------------------------------------------

def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def norm_ppf(p: float) -> float:
    """Inverse standard normal CDF (Acklam's rational approximation)."""
    if not 0.0 < p < 1.0:
        raise ValueError("p must be in (0,1)")
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / \
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > phigh:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / \
                ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q = p - 0.5
    r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / \
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)


def _betacf(a: float, b: float, x: float) -> float:
    """Continued fraction for the incomplete beta function (Lentz's method)."""
    tiny = 1e-30
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < tiny:
        d = tiny
    d = 1.0 / d
    h = d
    for m in range(1, 300):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 3e-12:
            break
    return h


def betainc(a: float, b: float, x: float) -> float:
    """Regularised incomplete beta I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = (math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
             + a * math.log(x) + b * math.log1p(-x))
    front = math.exp(lbeta)
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(a, b, x) / a
    return 1.0 - math.exp(
        math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
        + b * math.log1p(-x) + a * math.log(x)
    ) * _betacf(b, a, 1.0 - x) / b


def t_cdf(t: float, df: float) -> float:
    """CDF of the Student-t distribution."""
    if df <= 0:
        raise ValueError("df must be positive")
    if df > 400:                      # numerically indistinguishable from normal
        return norm_cdf(t)
    x = df / (df + t * t)
    p = 0.5 * betainc(df / 2.0, 0.5, x)
    return 1.0 - p if t > 0 else p


def t_sample(df: float, rng: random.Random) -> float:
    """Draw from a standard Student-t with `df` degrees of freedom."""
    if df > 400:
        return rng.gauss(0.0, 1.0)
    z = rng.gauss(0.0, 1.0)
    # chi-square(df) == gamma(df/2, scale=2)
    v = rng.gammavariate(df / 2.0, 2.0)
    return z / math.sqrt(v / df)


# --------------------------------------------------------------------------
# Online moments
# --------------------------------------------------------------------------

@dataclass
class Welford:
    """Numerically stable online mean/variance."""
    n: int = 0
    mean: float = 0.0
    m2: float = 0.0

    def push(self, x: float) -> None:
        self.n += 1
        delta = x - self.mean
        self.mean += delta / self.n
        self.m2 += delta * (x - self.mean)

    @property
    def var(self) -> float:
        return self.m2 / (self.n - 1) if self.n > 1 else 0.0

    @property
    def std(self) -> float:
        return math.sqrt(self.var)

    def as_dict(self) -> dict:
        return {"n": self.n, "mean": self.mean, "std": self.std}


# --------------------------------------------------------------------------
# Bayesian edge posterior
# --------------------------------------------------------------------------

@dataclass
class EdgePosterior:
    """Normal-Inverse-Gamma posterior over (mu, sigma^2) of a return stream.

    The prior is deliberately *sceptical*: mu0 = 0 with real weight (kappa0),
    so a strategy must produce evidence to earn capital. This is the core of
    the promotion gate -- an unproven strategy defaults to "no edge".
    """
    mu0: float = 0.0
    kappa0: float = 12.0     # prior counts: ~12 observations of "zero edge"
    alpha0: float = 3.0
    beta0: float = 0.0       # set from prior_sigma in __post_init__
    prior_sigma: float = 0.01

    n: int = 0
    _sum: float = 0.0
    _sumsq: float = 0.0

    def __post_init__(self) -> None:
        if self.beta0 == 0.0:
            # E[sigma^2] = beta0 / (alpha0 - 1)  =>  beta0 = sigma^2 (alpha0-1)
            self.beta0 = self.prior_sigma ** 2 * (self.alpha0 - 1.0)

    # -- updating ----------------------------------------------------------
    def push(self, x: float) -> None:
        self.n += 1
        self._sum += x
        self._sumsq += x * x

    def push_many(self, xs) -> None:
        for x in xs:
            self.push(x)

    # -- posterior parameters ---------------------------------------------
    @property
    def sample_mean(self) -> float:
        return self._sum / self.n if self.n else 0.0

    @property
    def kappa_n(self) -> float:
        return self.kappa0 + self.n

    @property
    def mu_n(self) -> float:
        return (self.kappa0 * self.mu0 + self._sum) / self.kappa_n

    @property
    def alpha_n(self) -> float:
        return self.alpha0 + self.n / 2.0

    @property
    def beta_n(self) -> float:
        if self.n == 0:
            return self.beta0
        xbar = self.sample_mean
        ss = self._sumsq - self.n * xbar * xbar          # sum of squared devs
        ss = max(ss, 0.0)
        return (self.beta0 + 0.5 * ss
                + (self.kappa0 * self.n * (xbar - self.mu0) ** 2)
                / (2.0 * self.kappa_n))

    @property
    def sigma_hat(self) -> float:
        """Posterior mean of sigma."""
        return math.sqrt(self.beta_n / max(self.alpha_n - 1.0, 1e-9))

    @property
    def empirical_sigma(self) -> float:
        """Plain sample standard deviation, with no prior mixed in."""
        if self.n < 2:
            return self.sigma_hat
        xbar = self.sample_mean
        ss = max(self._sumsq - self.n * xbar * xbar, 0.0)
        return math.sqrt(ss / (self.n - 1))

    def scale(self, min_n: int = 30) -> float:
        """Scale parameter to use for interval estimates.

        The prior on sigma is an absolute number, which is fine while a
        strategy is young and dangerous once it is not: the same strategy
        measured on a EUR 2,000 book and a EUR 200,000 book produces returns
        of wildly different magnitude, and a fixed prior scale swamps the
        data in the second case -- so the gate would refuse to ever open on
        a large account, silently, for a strategy that works. Past `min_n`
        observations the data sets the scale.
        """
        return self.empirical_sigma if self.n >= min_n else self.sigma_hat

    @property
    def _t_scale(self) -> float:
        return math.sqrt(self.beta_n / (self.alpha_n * self.kappa_n))

    @property
    def _t_df(self) -> float:
        return 2.0 * self.alpha_n

    # -- inference ---------------------------------------------------------
    def sample_mu(self, rng: random.Random) -> float:
        """Thompson draw of the true mean return."""
        return self.mu_n + self._t_scale * t_sample(self._t_df, rng)

    def anytime_lower_bound(self, alpha: float = 0.05, rho: float = 260.0) -> float:
        """Time-uniform lower confidence bound on the true mean return.

        This, not `prob_mu_greater`, is what the promotion gate acts on:
        it is the version that survives being checked continuously.
        """
        return anytime_lower_bound(self.n, self.mu_n, self.scale(), alpha, rho)

    def prob_mu_greater(self, threshold: float = 0.0) -> float:
        """P(mu > threshold | data). The promotion gate's decision variable."""
        scale = self._t_scale
        if scale <= 0:
            return 1.0 if self.mu_n > threshold else 0.0
        t = (threshold - self.mu_n) / scale
        return 1.0 - t_cdf(t, self._t_df)

    def credible_interval(self, level: float = 0.90) -> tuple[float, float]:
        df, scale = self._t_df, self._t_scale
        # invert the t CDF by bisection (cheap, called rarely)
        lo_p, hi_p = (1 - level) / 2, 1 - (1 - level) / 2
        return (self.mu_n + scale * _t_ppf(lo_p, df),
                self.mu_n + scale * _t_ppf(hi_p, df))

    def as_dict(self) -> dict:
        lo, hi = self.credible_interval()
        return {"n": self.n, "mu": self.mu_n, "sigma": self.sigma_hat,
                "p_positive": self.prob_mu_greater(0.0), "ci90": [lo, hi]}


# --------------------------------------------------------------------------
# Anytime-valid inference
# --------------------------------------------------------------------------

def normal_mixture_radius(n: int, sigma: float, alpha: float = 0.05,
                          rho: float = 260.0) -> float:
    """Radius of a time-uniform confidence sequence for the mean.

    THE PROBLEM THIS SOLVES. A fixed-sample 95% test is only valid if you
    look once. MONETA looks at every strategy every few ticks and promotes
    the moment the evidence crosses the line -- hundreds of peeks per year.
    Under that regime a plain 95% posterior threshold fires on pure noise
    far more than 5% of the time, which is precisely how a coin-flipper ends
    up funded and how a backtester ends up broke.

    The normal-mixture (Robbins) boundary is valid *uniformly over all n*:
    the probability that a zero-mean stream EVER crosses it is at most
    alpha, no matter how often you check. `rho` tunes where the boundary is
    tightest; ~260 ticks is about three months of 8-hour observations.

    Reference: Robbins (1970); Howard, Ramdas, McAuliffe & Sekhon (2021),
    "Time-uniform Chernoff bounds via nonnegative supermartingales".
    """
    if n <= 0 or sigma <= 0:
        return float("inf")
    inner = math.sqrt((n + rho) / rho) / alpha
    if inner <= 1.0:
        return float("inf")
    return math.sqrt(2.0 * (n + rho) * sigma ** 2 * math.log(inner)) / n


def anytime_lower_bound(n: int, mean: float, sigma: float,
                        alpha: float = 0.05, rho: float = 260.0) -> float:
    """Lower end of the time-uniform confidence sequence for the mean."""
    return mean - normal_mixture_radius(n, sigma, alpha, rho)


def _t_ppf(p: float, df: float, tol: float = 1e-9) -> float:
    lo, hi = -60.0, 60.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if t_cdf(mid, df) < p:
            lo = mid
        else:
            hi = mid
        if hi - lo < tol:
            break
    return 0.5 * (lo + hi)


# --------------------------------------------------------------------------
# Performance metrics
# --------------------------------------------------------------------------

def max_drawdown(equity: list[float]) -> float:
    """Maximum peak-to-trough decline as a fraction of the peak."""
    peak, mdd = -math.inf, 0.0
    for v in equity:
        peak = max(peak, v)
        if peak > 0:
            mdd = max(mdd, (peak - v) / peak)
    return mdd


def returns_from_equity(equity: list[float]) -> list[float]:
    out = []
    for prev, cur in zip(equity, equity[1:]):
        out.append((cur - prev) / prev if prev > 0 else 0.0)
    return out


def sharpe(returns: list[float], periods_per_year: float) -> float:
    if len(returns) < 2:
        return 0.0
    m = sum(returns) / len(returns)
    var = sum((r - m) ** 2 for r in returns) / (len(returns) - 1)
    sd = math.sqrt(var)
    if sd <= 0:
        return 0.0
    return (m / sd) * math.sqrt(periods_per_year)


def sortino(returns: list[float], periods_per_year: float) -> float:
    if len(returns) < 2:
        return 0.0
    m = sum(returns) / len(returns)
    downside = [r for r in returns if r < 0]
    if not downside:
        return float("inf") if m > 0 else 0.0
    dd = math.sqrt(sum(r * r for r in downside) / len(returns))
    if dd <= 0:
        return 0.0
    return (m / dd) * math.sqrt(periods_per_year)


def cagr(start: float, end: float, years: float) -> float:
    if start <= 0 or years <= 0:
        return 0.0
    if end <= 0:
        return -1.0
    return (end / start) ** (1.0 / years) - 1.0


def percentile(xs: list[float], q: float) -> float:
    """Linear-interpolated percentile, q in [0,1]."""
    if not xs:
        return 0.0
    s = sorted(xs)
    if len(s) == 1:
        return s[0]
    pos = q * (len(s) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(s) - 1)
    frac = pos - lo
    return s[lo] * (1 - frac) + s[hi] * frac


def cvar(xs: list[float], q: float = 0.05) -> float:
    """Expected value of the worst q-tail (conditional value at risk)."""
    if not xs:
        return 0.0
    s = sorted(xs)
    k = max(1, int(math.ceil(q * len(s))))
    return sum(s[:k]) / k


def bootstrap_ci(xs: list[float], stat=None, level: float = 0.95,
                 iters: int = 2000, seed: int = 7) -> tuple[float, float]:
    """Percentile bootstrap confidence interval for a statistic."""
    if not xs:
        return (0.0, 0.0)
    stat = stat or (lambda v: sum(v) / len(v))
    rng = random.Random(seed)
    n = len(xs)
    reps = []
    for _ in range(iters):
        reps.append(stat([xs[rng.randrange(n)] for _ in range(n)]))
    a = (1 - level) / 2
    return (percentile(reps, a), percentile(reps, 1 - a))


def welch_t_test(a: list[float], b: list[float]) -> tuple[float, float, float]:
    """Welch's t-test. Returns (t, df, two-sided p-value)."""
    na, nb = len(a), len(b)
    if na < 2 or nb < 2:
        return (0.0, 0.0, 1.0)
    ma, mb = sum(a) / na, sum(b) / nb
    va = sum((x - ma) ** 2 for x in a) / (na - 1)
    vb = sum((x - mb) ** 2 for x in b) / (nb - 1)
    se2 = va / na + vb / nb
    if se2 <= 0:
        return (0.0, 0.0, 1.0)
    t = (ma - mb) / math.sqrt(se2)
    df = se2 ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1))
    p = 2.0 * (1.0 - t_cdf(abs(t), df))
    return (t, df, p)
