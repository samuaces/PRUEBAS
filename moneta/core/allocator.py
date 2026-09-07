"""Capital allocator: the part of MONETA that is actually novel.

Most people lose money by betting everything on one idea they are emotionally
attached to. MONETA instead runs a *portfolio of experiments* and lets the
data decide, with three mechanisms stacked on top of each other:

1. PROMOTION GATE (scepticism).
   A strategy starts in PAPER with a prior centred on "you have no edge",
   carrying real weight (kappa0 pseudo-observations). It only receives real
   money once its posterior says P(mu > hurdle) exceeds `promote_prob` with
   at least `min_observations` behind it and an acceptable paper drawdown.
   This is what stops an overfitted backtest from ever touching the account.

2. THOMPSON SAMPLING (exploration).
   Among funded strategies, capital is allocated by drawing each strategy's
   true edge from its posterior and sizing on the draw. Uncertain strategies
   occasionally get a big draw and thus a chance to prove themselves;
   confidently-bad ones almost never do. No hand-tuned exploration schedule.

3. FRACTIONAL KELLY (sizing).
   Given a sampled edge mu and variance sigma^2, the growth-optimal fraction
   is mu/sigma^2. Full Kelly is famously unusable when mu is estimated -- so
   MONETA sizes at `kelly_fraction` of it and clamps. Estimation error in mu
   is already reflected because mu came from the posterior, not a point
   estimate: uncertainty shrinks the bet automatically.

Demotion is symmetric: a live strategy whose posterior decays back below the
hurdle loses its funding without anyone having to notice.
"""
from __future__ import annotations

import random
from dataclasses import dataclass

from .strategy import Book, Phase


@dataclass
class AllocatorConfig:
    #: Minimum per-tick return that counts as "an edge worth funding".
    #: Left at 0.0 the engine fills it in with the risk-free rate, because
    #: the real question is never "does this make money" but "does this beat
    #: leaving the money alone".
    hurdle: float = 0.0
    #: total probability of ever funding a strategy that has no edge at all.
    #: This is a time-uniform guarantee: it holds no matter how often the
    #: gate is checked, which a plain posterior threshold does not.
    alpha: float = 0.10
    #: where the confidence sequence is tightest, in ticks (~3 months)
    rho: float = 260.0
    #: posterior confidence below which a live strategy is defunded
    demote_prob: float = 0.60
    #: observations required before promotion is even considered
    min_observations: int = 60
    #: paper drawdown that disqualifies a strategy from promotion
    max_paper_drawdown: float = 0.30
    #: fraction of full Kelly to bet (0.25 = quarter Kelly)
    kelly_fraction: float = 0.25
    #: hard cap on the Kelly fraction of equity for one strategy
    max_kelly: float = 0.50
    #: capital ramp: a newly promoted strategy starts at this fraction of
    #: its Kelly target and ramps up as evidence accumulates
    ramp_ticks: int = 90
    #: re-evaluate promotions/demotions every N ticks
    review_every: int = 3
    #: floor allocation for a live strategy so it keeps producing data
    min_live_fraction: float = 0.01
    #: Ablation switch. True = fund everything from day one with no evidence
    #: at all, which is what "I backtested it and it looked good" amounts to.
    bypass_gate: bool = False


class Allocator:
    def __init__(self, config: AllocatorConfig | None = None, seed: int = 0):
        self.cfg = config or AllocatorConfig()
        self.rng = random.Random(seed)
        self.history: list[dict] = []
        self.promotions: list[str] = []
        self.demotions: list[str] = []

    # ------------------------------------------------------------------
    # Phase management
    # ------------------------------------------------------------------
    def review_phases(self, t: float, books: dict[str, Book]) -> None:
        cfg = self.cfg
        if cfg.bypass_gate:
            for book in books.values():
                if book.phase is Phase.PAPER:
                    book.phase = Phase.LIVE
                    book.promoted_at = book.promoted_at if book.promoted_at is not None else t
            return
        for book in books.values():
            if book.phase is Phase.RETIRED:
                continue
            post = book.posterior
            p_edge = post.prob_mu_greater(cfg.hurdle)

            if book.phase is Phase.PAPER:
                # Two independent routes to promotion, so the alpha budget is
                # split between them and the time-uniform guarantee survives
                # the union bound.
                half = cfg.alpha / 2.0
                lb_total = post.anytime_lower_bound(half, cfg.rho)
                lb_cash = book.cash_posterior.anytime_lower_bound(half, cfg.rho)
                passed = max(lb_total, lb_cash)
                route = "total return" if lb_total >= lb_cash else "realised cash"
                if (post.n >= cfg.min_observations
                        and passed > cfg.hurdle
                        and book.paper_drawdown <= cfg.max_paper_drawdown):
                    book.phase = Phase.LIVE
                    book.promoted_at = t
                    book.note(t, f"PROMOTED on {route}: anytime-valid lower "
                                 f"bound {passed:+.6f}/tick > {cfg.hurdle:.6f} "
                                 f"after n={post.n}, paper dd="
                                 f"{book.paper_drawdown:.1%}")
                    self.promotions.append(book.name)

            elif book.phase in (Phase.LIVE, Phase.PROBATION):
                if post.n >= cfg.min_observations and p_edge < cfg.demote_prob:
                    book.phase = Phase.PAPER
                    book.note(t, f"DEMOTED to paper: P(edge)={p_edge:.3f} "
                                 f"< {cfg.demote_prob:.2f}")
                    self.demotions.append(book.name)
                elif book.phase is Phase.PROBATION and p_edge >= 0.90 \
                        and book.live_drawdown < 0.10:
                    book.phase = Phase.LIVE
                    book.note(t, "restored from probation")

    # ------------------------------------------------------------------
    # Sizing
    # ------------------------------------------------------------------
    def kelly_target(self, book: Book, equity: float, t: float,
                     probation_factor: float) -> tuple[float, float]:
        """Return (target_capital, sampled_mu) for one funded strategy."""
        cfg = self.cfg
        post = book.posterior

        mu = post.sample_mu(self.rng)             # Thompson draw
        sigma2 = max(post.scale() ** 2, 1e-12)
        if mu <= cfg.hurdle:
            return 0.0, mu

        f = cfg.kelly_fraction * (mu - cfg.hurdle) / sigma2
        f = max(0.0, min(f, cfg.max_kelly))

        # ramp newly promoted strategies in rather than jumping to full size
        if book.promoted_at is not None and cfg.ramp_ticks > 0:
            age = (t - book.promoted_at)
            ramp = min(1.0, 0.15 + 0.85 * age / max(cfg.ramp_ticks, 1))
            f *= ramp

        if book.phase is Phase.PROBATION:
            f *= probation_factor

        f = max(f, cfg.min_live_fraction) if f > 0 else 0.0
        return f * equity, mu

    def allocate(self, t: float, books: dict[str, Book], equity: float,
                 probation_factor: float = 0.35, ctx=None) -> dict[str, float]:
        """Compute target capital per strategy. Risk governor caps it after."""
        targets: dict[str, float] = {}
        draws: dict[str, float] = {}
        for name, book in books.items():
            if not book.is_fundable:
                targets[name] = 0.0
                continue
            target, mu = self.kelly_target(book, equity, t, probation_factor)
            if ctx is not None:
                # Never hand a strategy more than it can put to work. The
                # surplus would sit idle inside its book, earning nothing,
                # while counting against every concentration limit.
                target = min(target, book.strategy.capacity(ctx, book.live_state))
            targets[name] = target
            draws[name] = mu

        self.history.append({
            "t": t, "equity": equity,
            "targets": dict(targets), "draws": draws,
            "phases": {n: b.phase.value for n, b in books.items()},
        })
        return targets

    # ------------------------------------------------------------------
    def report(self, books: dict[str, Book]) -> list[dict]:
        rows = []
        for name, b in books.items():
            post = b.posterior
            lo, hi = post.credible_interval(0.90)
            rows.append({
                "strategy": name,
                "phase": b.phase.value,
                "n": post.n,
                "mu_per_tick": post.mu_n,
                "sigma_per_tick": post.sigma_hat,
                "p_edge": post.prob_mu_greater(self.cfg.hurdle),
                "lb_total": post.anytime_lower_bound(self.cfg.alpha / 2, self.cfg.rho),
                "lb_cash": b.cash_posterior.anytime_lower_bound(self.cfg.alpha / 2,
                                                                self.cfg.rho),
                "ci90_lo": lo, "ci90_hi": hi,
                "paper_drawdown": b.paper_drawdown,
                "live_drawdown": b.live_drawdown,
                "promoted_at_days": (b.promoted_at / 24.0
                                     if b.promoted_at is not None else None),
                "allocation": b.allocation,
                "funded": b.funded,
            })
        rows.sort(key=lambda r: (-r["p_edge"], r["strategy"]))
        return rows


class UniformAllocator(Allocator):
    """Baseline: split capital evenly across every strategy, no gate.

    This is the control arm of the ablation study -- it is what a person
    does when they "diversify" without measuring anything. If MONETA's
    machinery is not beating this, the machinery is decoration.
    """

    def review_phases(self, t: float, books: dict[str, Book]) -> None:
        for book in books.values():
            if book.phase is Phase.PAPER:
                book.phase = Phase.LIVE
                book.promoted_at = book.promoted_at or t

    def allocate(self, t, books, equity, probation_factor: float = 1.0):
        live = [n for n, b in books.items() if b.is_fundable]
        share = (equity * 0.85 / len(live)) if live else 0.0
        targets = {n: (share if n in live else 0.0) for n in books}
        self.history.append({"t": t, "equity": equity, "targets": dict(targets),
                             "draws": {}, "phases": {n: b.phase.value
                                                     for n, b in books.items()}})
        return targets
