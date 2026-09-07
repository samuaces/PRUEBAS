"""MONETA test suite. Run with: python -m moneta.tests.test_moneta"""
from __future__ import annotations

import math
import random
import unittest

from ..core.allocator import Allocator, AllocatorConfig
from ..core.engine import EngineConfig, run_path
from ..core.frictions import ADVERSARIAL, OPTIMISTIC, PRESETS, REALISTIC
from ..core.ledger import Event, Kind, Ledger
from ..core.risk import RiskGovernor, RiskLimits
from ..core.stats import (EdgePosterior, Welford, anytime_lower_bound, betainc,
                          bootstrap_ci, cagr, cvar, max_drawdown, norm_cdf,
                          norm_ppf, percentile, sharpe, t_cdf, welch_t_test)
from ..core.strategy import Book, Phase
from ..sim.market import SimWorld, WorldConfig
from ..sim.processes import OU, TICKS_PER_YEAR, poisson, truncated_normal
from ..sim.scenarios import SCENARIOS
from ..strategies import build_default


class TestSpecialFunctions(unittest.TestCase):
    def test_norm_cdf_known_values(self):
        self.assertAlmostEqual(norm_cdf(0.0), 0.5, places=10)
        self.assertAlmostEqual(norm_cdf(1.96), 0.975002, places=5)
        self.assertAlmostEqual(norm_cdf(-1.96), 0.024998, places=5)

    def test_norm_ppf_inverts_cdf(self):
        for p in (0.001, 0.01, 0.1, 0.35, 0.5, 0.77, 0.99, 0.999):
            self.assertAlmostEqual(norm_cdf(norm_ppf(p)), p, places=6)

    def test_t_cdf_against_published_quantiles(self):
        # two-sided 95% critical values from standard tables
        for df, crit in ((1, 12.706), (5, 2.571), (10, 2.228), (30, 2.042),
                         (100, 1.984)):
            self.assertAlmostEqual(t_cdf(crit, df), 0.975, places=3)
        self.assertAlmostEqual(t_cdf(0.0, 7), 0.5, places=10)

    def test_t_cdf_symmetry(self):
        for x in (0.3, 1.1, 2.7):
            self.assertAlmostEqual(t_cdf(x, 9) + t_cdf(-x, 9), 1.0, places=9)

    def test_betainc_edges(self):
        self.assertEqual(betainc(2, 3, 0.0), 0.0)
        self.assertEqual(betainc(2, 3, 1.0), 1.0)
        self.assertAlmostEqual(betainc(0.5, 0.5, 0.5), 0.5, places=9)


class TestMetrics(unittest.TestCase):
    def test_max_drawdown(self):
        self.assertAlmostEqual(max_drawdown([100, 120, 60, 90]), 0.5)
        self.assertEqual(max_drawdown([1, 2, 3]), 0.0)

    def test_cagr(self):
        self.assertAlmostEqual(cagr(100, 121, 2.0), 0.1, places=9)
        self.assertAlmostEqual(cagr(100, 100, 3.0), 0.0, places=9)

    def test_sharpe_scaling(self):
        rng = random.Random(0)
        rets = [rng.gauss(0.001, 0.01) for _ in range(4000)]
        s = sharpe(rets, 1095)
        self.assertAlmostEqual(s, 0.001 / 0.01 * math.sqrt(1095), delta=0.6)

    def test_percentile_and_cvar(self):
        xs = list(range(101))
        self.assertAlmostEqual(percentile(xs, 0.5), 50.0)
        self.assertAlmostEqual(percentile(xs, 0.0), 0.0)
        self.assertAlmostEqual(percentile(xs, 1.0), 100.0)
        self.assertLess(cvar(xs, 0.05), 5.0)

    def test_welford_matches_batch(self):
        rng = random.Random(3)
        xs = [rng.gauss(5, 2) for _ in range(2000)]
        w = Welford()
        for x in xs:
            w.push(x)
        mean = sum(xs) / len(xs)
        var = sum((x - mean) ** 2 for x in xs) / (len(xs) - 1)
        self.assertAlmostEqual(w.mean, mean, places=9)
        self.assertAlmostEqual(w.var, var, places=7)

    def test_welch_detects_difference(self):
        rng = random.Random(11)
        a = [rng.gauss(1.0, 1.0) for _ in range(300)]
        b = [rng.gauss(0.0, 1.0) for _ in range(300)]
        _, _, p = welch_t_test(a, b)
        self.assertLess(p, 1e-10)
        _, _, p2 = welch_t_test(a, [rng.gauss(1.0, 1.0) for _ in range(300)])
        self.assertGreater(p2, 0.01)


class TestPosterior(unittest.TestCase):
    def test_recovers_a_true_mean(self):
        rng = random.Random(1)
        p = EdgePosterior(prior_sigma=0.02)
        for _ in range(3000):
            p.push(rng.gauss(0.004, 0.02))
        self.assertAlmostEqual(p.mu_n, 0.004, delta=0.0012)
        self.assertAlmostEqual(p.sigma_hat, 0.02, delta=0.002)
        self.assertGreater(p.prob_mu_greater(0.0), 0.999)

    def test_sceptical_prior_shrinks_small_samples(self):
        """One lucky observation must not convince it of anything."""
        p = EdgePosterior(prior_sigma=0.01)
        p.push(0.5)
        self.assertLess(p.mu_n, 0.5 / 2)

    def test_credible_interval_brackets_the_mean(self):
        rng = random.Random(5)
        p = EdgePosterior(prior_sigma=0.01)
        for _ in range(1000):
            p.push(rng.gauss(0.002, 0.01))
        lo, hi = p.credible_interval(0.90)
        self.assertLess(lo, p.mu_n)
        self.assertGreater(hi, p.mu_n)
        self.assertLess(lo, 0.002)
        self.assertGreater(hi, 0.002)


class TestAnytimeValidity(unittest.TestCase):
    """The central statistical claim of the whole system."""

    def _crossings(self, gate, paths=400, n=1000, seed=0):
        rng = random.Random(seed)
        fired = 0
        for _ in range(paths):
            post = EdgePosterior(prior_sigma=0.01)
            for i in range(n):
                post.push(rng.gauss(0.0, 0.01))
                if i >= 60 and gate(post):
                    fired += 1
                    break
        return fired / paths

    def test_fixed_n_threshold_is_fooled_by_repeated_looks(self):
        rate = self._crossings(lambda p: p.prob_mu_greater(0.0) > 0.95)
        self.assertGreater(rate, 0.15,
                           "a fixed-n 95% test peeked at continuously should "
                           "fire far more than 5% of the time")

    def test_anytime_bound_honours_its_guarantee(self):
        for alpha in (0.05, 0.10):
            rate = self._crossings(lambda p, a=alpha: p.anytime_lower_bound(a) > 0)
            self.assertLessEqual(rate, alpha,
                                 f"anytime-valid bound at alpha={alpha} fired "
                                 f"{rate:.1%} of the time on zero-edge data")

    def test_anytime_bound_still_detects_a_real_edge(self):
        rng = random.Random(9)
        p = EdgePosterior(prior_sigma=0.01)
        for _ in range(4000):
            p.push(rng.gauss(0.0012, 0.01))     # Sharpe ~4/yr
        self.assertGreater(p.anytime_lower_bound(0.05), 0.0)

    def test_radius_shrinks_with_evidence(self):
        from ..core.stats import normal_mixture_radius
        r100 = normal_mixture_radius(100, 0.01)
        r10000 = normal_mixture_radius(10000, 0.01)
        self.assertLess(r10000, r100)


class TestLedger(unittest.TestCase):
    def test_spot_round_trip_conserves_cash(self):
        L = Ledger()
        L.deposit(0, "v", 10_000.0)
        L.trade(1, "s", "v", "X", Kind.SPOT, 2, 100.0, 1.0)
        self.assertAlmostEqual(L.cash_at("v"), 10_000 - 200 - 1)
        realized = L.trade(2, "s", "v", "X", Kind.SPOT, -1, 120.0, 0.6)
        self.assertAlmostEqual(realized, 20.0)
        self.assertAlmostEqual(L.cash_at("v"), 10_000 - 200 - 1 + 120 - 0.6)

    def test_perp_short_cover_settles_pnl_to_cash(self):
        L = Ledger()
        L.deposit(0, "v", 1000.0)
        L.post_margin(0, "s", "v", "P", 300.0)
        L.trade(1, "s", "v", "P", Kind.PERP, -1, 100.0, 0.1)
        L.trade(2, "s", "v", "P", Kind.PERP, 1, 90.0, 0.1)
        self.assertAlmostEqual(L.cash_at("v"), 700 + 10 - 0.2, places=9)

    def test_average_cost_basis(self):
        L = Ledger()
        L.deposit(0, "v", 1e6)
        L.trade(0, "s", "v", "X", Kind.SPOT, 1, 100.0, 0.0)
        L.trade(1, "s", "v", "X", Kind.SPOT, 1, 200.0, 0.0)
        self.assertAlmostEqual(L.positions[("v", "X")].avg_price, 150.0)
        r = L.trade(2, "s", "v", "X", Kind.SPOT, -2, 150.0, 0.0)
        self.assertAlmostEqual(r, 0.0)

    def test_fees_are_deductible_and_attributed(self):
        L = Ledger()
        L.deposit(0, "v", 1000.0)
        L.trade(1, "s1", "v", "X", Kind.SPOT, 1, 100.0, 2.0)
        L.trade(2, "s1", "v", "X", Kind.SPOT, -1, 110.0, 3.0)
        self.assertAlmostEqual(L.realized_pnl, 10 - 5)
        self.assertAlmostEqual(L.pnl_by_strategy["s1"], 5.0)
        self.assertAlmostEqual(L.fees_paid, 5.0)

    def test_tax_never_negative_and_reduces_equity(self):
        L = Ledger()
        L.deposit(0, "v", 1000.0)
        L.trade(1, "s", "v", "X", Kind.SPOT, 1, 100.0, 0.0)
        L.trade(2, "s", "v", "X", Kind.SPOT, -1, 50.0, 0.0)   # a loss
        self.assertEqual(L.accrued_tax(0.25), 0.0)
        L2 = Ledger()
        L2.deposit(0, "v", 1000.0)
        L2.trade(1, "s", "v", "X", Kind.SPOT, 1, 100.0, 0.0)
        L2.trade(2, "s", "v", "X", Kind.SPOT, -1, 200.0, 0.0)
        self.assertAlmostEqual(L2.accrued_tax(0.25), 25.0)
        self.assertAlmostEqual(L2.equity({}, 0.25), L2.gross_equity({}) - 25.0)

    def test_withdraw_is_proportional_and_bounded(self):
        L = Ledger()
        L.deposit(0, "a", 300.0)
        L.deposit(0, "b", 700.0)
        got = L.withdraw(1, 500.0)
        self.assertAlmostEqual(got, 500.0)
        self.assertAlmostEqual(L.cash_at("a"), 150.0)
        self.assertAlmostEqual(L.cash_at("b"), 350.0)
        self.assertAlmostEqual(L.withdraw(2, 99_999.0), 500.0)
        self.assertAlmostEqual(L.total_cash(), 0.0)

    def test_venue_seizure_destroys_everything_there(self):
        L = Ledger()
        L.deposit(0, "good", 500.0)
        L.deposit(0, "bad", 500.0)
        L.trade(1, "s", "bad", "X", Kind.SPOT, 1, 100.0, 0.0)
        L.seize_venue(2, "bad")
        self.assertAlmostEqual(L.cash_at("bad"), 0.0)
        self.assertNotIn(("bad", "X"), L.positions)
        self.assertAlmostEqual(L.cash_at("good"), 500.0)

    def test_money_is_never_created_from_nothing(self):
        """Equity may only change by realised P&L, marks, fees and flows."""
        L = Ledger()
        L.deposit(0, "v", 10_000.0)
        rng = random.Random(4)
        price = 100.0
        for t in range(300):
            price *= math.exp(rng.gauss(0, 0.02))
            qty = rng.choice([-1, 1]) * rng.uniform(0.1, 2.0)
            pos = L.positions.get(("v", "X"))
            if pos and abs(pos.qty + qty) > 20:
                qty = -qty
            L.trade(t, "s", "v", "X", Kind.SPOT, qty, price, abs(qty) * price * 0.001)
        marks = {("v", "X"): price}
        equity = L.gross_equity(marks)
        # reconstruct independently from the journal
        cash = sum(e.cash_delta for e in L.journal)
        held = L.positions.get(("v", "X"))
        recon = cash + (held.qty * price if held else 0.0)
        self.assertAlmostEqual(equity, recon, places=6)


class TestFrictions(unittest.TestCase):
    def test_presets_are_ordered_by_severity(self):
        self.assertLess(OPTIMISTIC.round_trip_bps(), REALISTIC.round_trip_bps())
        self.assertLess(REALISTIC.round_trip_bps(), ADVERSARIAL.round_trip_bps())
        self.assertGreater(OPTIMISTIC.commerce_net_pct(),
                           ADVERSARIAL.commerce_net_pct())

    def test_impact_grows_with_size(self):
        for p in PRESETS.values():
            self.assertLess(p.trade_cost_bps(0.0), p.trade_cost_bps(0.01))
            self.assertLess(p.trade_cost_bps(0.01), p.trade_cost_bps(0.10))

    def test_stale_probability_bounds(self):
        for p in PRESETS.values():
            self.assertAlmostEqual(p.stale_probability(1e12), 0.0, places=6)
            self.assertEqual(p.stale_probability(0.0), 1.0)
            self.assertGreater(p.stale_probability(100.0), 0.0)


class TestRisk(unittest.TestCase):
    def test_halts_on_drawdown(self):
        g = RiskGovernor(RiskLimits(max_total_drawdown=0.10, max_daily_loss=1.0))
        for t, e in ((0, 1000), (8, 1100), (16, 1050)):
            g.observe(t, e)
            self.assertTrue(g.check_account(t, e))
        g.observe(24, 900)
        self.assertFalse(g.check_account(24, 900))
        self.assertIn("drawdown", g.state.reason)

    def test_halts_on_daily_loss(self):
        g = RiskGovernor(RiskLimits(max_total_drawdown=0.99, max_daily_loss=0.05))
        g.observe(0, 1000)
        g.check_account(0, 1000)
        g.observe(24, 900)
        self.assertFalse(g.check_account(24, 900))

    def test_concentration_caps(self):
        g = RiskGovernor(RiskLimits(max_per_strategy=0.35, max_per_venue=0.40,
                                    max_deployed=0.85, min_cash_buffer=0.15))
        caps = g.cap_allocations(10_000, {"a": 9000, "b": 9000, "c": 9000},
                                 {"a": ("X",), "b": ("X",), "c": ("Y",)})
        for v in caps.values():
            self.assertLessEqual(v, 3500 + 1e-9)
        self.assertLessEqual(caps["a"] + caps["b"], 4000 + 1e-6)
        self.assertLessEqual(sum(caps.values()), 8500 + 1e-6)

    def test_strategy_policing(self):
        strategies = build_default()
        book = Book(strategies[0], 1000.0, 0.01)
        book.phase = Phase.LIVE
        book.live_index_curve = [1.0, 1.2, 0.6]      # 50% drawdown
        g = RiskGovernor(RiskLimits(strategy_kill_drawdown=0.40))
        g.police_strategy(100.0, book)
        self.assertIs(book.phase, Phase.RETIRED)


class TestAllocator(unittest.TestCase):
    def _books(self, specs, ticks=1500, seed=3):
        rng = random.Random(seed)
        strategies = {s.name: s for s in build_default()}
        books = {}
        for name, mu, sd in specs:
            b = Book(strategies[name], 10_000.0, 0.01)
            for _ in range(ticks):
                r = rng.gauss(mu, sd)
                b.posterior.push(r)
                b.cash_posterior.push(r)
            books[name] = b
        return books

    def test_funds_a_real_edge_and_rejects_noise(self):
        books = self._books([("funding_carry", 0.0012, 0.004),
                             ("control_null", 0.0, 0.004),
                             ("cross_venue_arb", -0.0008, 0.004)])
        al = Allocator(AllocatorConfig(), seed=2)
        al.review_phases(1000.0, books)
        self.assertIs(books["funding_carry"].phase, Phase.LIVE)
        self.assertIs(books["control_null"].phase, Phase.PAPER)
        self.assertIs(books["cross_venue_arb"].phase, Phase.PAPER)

    def test_unfunded_strategies_get_no_capital(self):
        books = self._books([("control_null", 0.0, 0.004)])
        al = Allocator(AllocatorConfig(), seed=2)
        al.review_phases(1000.0, books)
        targets = al.allocate(1000.0, books, 100_000.0)
        self.assertEqual(targets["control_null"], 0.0)

    def test_kelly_size_falls_with_volatility(self):
        calm = self._books([("funding_carry", 0.0012, 0.002)])["funding_carry"]
        wild = self._books([("funding_carry", 0.0012, 0.02)])["funding_carry"]
        al = Allocator(AllocatorConfig(max_kelly=10.0), seed=1)
        calm.phase = wild.phase = Phase.LIVE
        t_calm = sum(al.kelly_target(calm, 100_000, 0, 1.0)[0] for _ in range(60))
        t_wild = sum(al.kelly_target(wild, 100_000, 0, 1.0)[0] for _ in range(60))
        self.assertGreater(t_calm, t_wild)

    def test_demotes_a_decayed_strategy(self):
        books = self._books([("funding_carry", 0.0, 0.004)])
        b = books["funding_carry"]
        b.phase = Phase.LIVE
        al = Allocator(AllocatorConfig(), seed=2)
        al.review_phases(1000.0, books)
        self.assertIn(b.phase, (Phase.PAPER, Phase.RETIRED))


class TestWorld(unittest.TestCase):
    def test_reproducible_from_seed(self):
        def run(seed):
            w = SimWorld(WorldConfig(days=40), ADVERSARIAL, seed=seed)
            out = []
            while not w.done:
                c = w.tick()
                out.append((c.price("ex1", "BTC"), c.funding_rate("ex1", "BTC-PERP")))
            return out
        self.assertEqual(run(11), run(11))
        self.assertNotEqual(run(11), run(12))

    def test_funding_is_capped(self):
        w = SimWorld(WorldConfig(days=900), ADVERSARIAL, seed=3)
        while not w.done:
            c = w.tick()
            self.assertLessEqual(abs(c.funding_rate("ex1", "BTC-PERP")), 0.0075 + 1e-12)

    def test_prices_stay_positive(self):
        w = SimWorld(WorldConfig(days=900), ADVERSARIAL,
                     SCENARIOS["everything"], seed=4)
        while not w.done:
            c = w.tick()
            for key, px in c.data["prices"].items():
                self.assertGreater(px, 0.0, key)

    def test_deal_estimate_differs_from_truth(self):
        w = SimWorld(WorldConfig(days=200), REALISTIC, seed=5)
        diffs = []
        while not w.done:
            for d in w.tick().data["deals"]:
                diffs.append(d.resale_true / d.resale_est)
        self.assertGreater(len(diffs), 50)
        self.assertNotAlmostEqual(min(diffs), max(diffs), places=3)

    def test_scenario_forces_venue_failure(self):
        w = SimWorld(WorldConfig(days=200), ADVERSARIAL,
                     SCENARIOS["venue_failure"], seed=6)
        while not w.done:
            w.tick()
        self.assertIn("ex1", w.dead_venues)


class TestProcesses(unittest.TestCase):
    def test_ou_stationary_moments(self):
        rng = random.Random(2)
        theta_halflife = 10.0
        ou = OU(mu=0.5, sigma=0.1, halflife=theta_halflife)
        xs = [ou.step(rng) for _ in range(60_000)]
        theta = math.log(2) / theta_halflife
        expected_sd = 0.1 / math.sqrt(2 * theta)
        mean = sum(xs) / len(xs)
        sd = math.sqrt(sum((x - mean) ** 2 for x in xs) / len(xs))
        self.assertAlmostEqual(mean, 0.5, delta=0.02)
        self.assertAlmostEqual(sd, expected_sd, delta=expected_sd * 0.08)

    def test_poisson_mean(self):
        rng = random.Random(6)
        for lam in (0.3, 2.0, 9.0):
            xs = [poisson(lam, rng) for _ in range(30_000)]
            self.assertAlmostEqual(sum(xs) / len(xs), lam, delta=lam * 0.06)

    def test_truncated_normal_respects_bounds(self):
        rng = random.Random(8)
        for _ in range(5000):
            x = truncated_normal(0.9, 0.2, 0.2, 0.78, rng)
            self.assertGreaterEqual(x, 0.2 - 1e-9)
            self.assertLessEqual(x, 0.78 + 1e-9)


class TestStrategies(unittest.TestCase):
    def test_each_strategy_runs_a_full_path(self):
        for strat in build_default():
            with self.subTest(strategy=strat.name):
                w = SimWorld(WorldConfig(days=200), ADVERSARIAL, seed=7)
                L = Ledger(record_journal=False)
                strat.fund(L, 0, 10_000.0)
                state = strat.new_state()
                ctx = None
                while not w.done:
                    ctx = w.tick()
                    ctx.data["labor_remaining"] = ctx.data["labor_budget_h"]
                    strat.step(ctx, L, 10_000.0, state, False)
                strat.liquidate(ctx, L, state)
                eq = L.equity(strat.mark_prices(ctx))
                self.assertGreater(eq, 0.0)
                self.assertLess(eq, 10_000.0 * 5)

    def test_strategies_hold_no_shared_state(self):
        """Two books driven by one Strategy object must not interfere."""
        for strat in build_default():
            with self.subTest(strategy=strat.name):
                a, b = strat.new_state(), strat.new_state()
                self.assertIsNot(a, b)
                if a:
                    key = next(iter(a))
                    a[key] = "poisoned"
                    self.assertNotEqual(b.get(key), "poisoned")

    def test_carry_stays_delta_neutral(self):
        from ..strategies.funding_carry import FundingCarry
        strat = FundingCarry()
        w = SimWorld(WorldConfig(days=400), REALISTIC, seed=12)
        L = Ledger(record_journal=False)
        strat.fund(L, 0, 10_000.0)
        st = strat.new_state()
        worst = 0.0
        while not w.done:
            ctx = w.tick()
            strat.step(ctx, L, 10_000.0, st, False)
            spot = L.positions.get(("ex1", "BTC"))
            perp = L.positions.get(("ex1", "BTC-PERP"))
            if spot and perp:
                imbalance = abs(spot.qty + perp.qty) / max(abs(spot.qty), 1e-9)
                worst = max(worst, imbalance)
        self.assertLess(worst, 0.10,
                        "carry book drifted more than 10% away from neutral")

    def test_retail_inventory_accounting_is_exact(self):
        from ..strategies.retail_arb import RetailArb
        strat = RetailArb()
        w = SimWorld(WorldConfig(days=300), REALISTIC, seed=13)
        L = Ledger(record_journal=False)
        strat.fund(L, 0, 5_000.0)
        st = strat.new_state()
        ctx = None
        while not w.done:
            ctx = w.tick()
            ctx.data["labor_remaining"] = ctx.data["labor_budget_h"]
            strat.step(ctx, L, 5_000.0, st, False)
            held = sum(i["cost"] for i in st["inventory"])
            booked = sum(p.cost_basis for k, p in L.positions.items()
                         if k[1].startswith("INV:"))
            self.assertAlmostEqual(held, booked, places=6,
                                   msg="inventory list and ledger disagree")
        strat.liquidate(ctx, L, st)
        self.assertEqual(st["inventory"], [])
        self.assertFalse([k for k in L.positions if k[1].startswith("INV:")])

    def test_control_null_has_no_edge(self):
        from ..strategies.control_null import ControlNull
        finals = []
        for seed in range(25):
            w = SimWorld(WorldConfig(days=365), ADVERSARIAL, seed=seed)
            strat = ControlNull()
            L = Ledger(record_journal=False)
            strat.fund(L, 0, 10_000.0)
            st = strat.new_state()
            ctx = None
            while not w.done:
                ctx = w.tick()
                strat.step(ctx, L, 10_000.0, st, False)
            strat.liquidate(ctx, L, st)
            finals.append(L.equity(strat.mark_prices(ctx)))
        mean = sum(finals) / len(finals)
        self.assertLess(mean, 10_000.0,
                        "the control arm should lose money to costs on average")


class TestEngine(unittest.TestCase):
    def _run(self, days=500, warmup=200, seed=1, scenario="base", capital=10_000.0):
        w = SimWorld(WorldConfig(days=days), ADVERSARIAL, SCENARIOS[scenario],
                     seed=seed)
        return run_path(w, build_default(), ADVERSARIAL,
                        EngineConfig(starting_capital=capital,
                                     paper_notional=capital,
                                     warmup_days=warmup, seed=seed))

    def test_runs_and_reports(self):
        r = self._run()
        self.assertGreater(r.end, 0.0)
        self.assertEqual(len(r.final_phases), 5)
        self.assertGreaterEqual(r.max_drawdown, 0.0)

    def test_no_capital_is_deployed_during_validation(self):
        w = SimWorld(WorldConfig(days=150), ADVERSARIAL, seed=2)
        from ..core.engine import Engine
        eng = Engine(build_default(), ADVERSARIAL,
                     EngineConfig(starting_capital=10_000, warmup_days=1000, seed=2))
        ctx = None
        while not w.done:
            ctx = w.tick()
            eng.step(ctx)
            for b in eng.books.values():
                self.assertEqual(b.allocation, 0.0)
                self.assertEqual(b.funded, 0.0)

    def test_survives_every_scenario(self):
        for name in SCENARIOS:
            with self.subTest(scenario=name):
                r = self._run(days=500, warmup=200, seed=5, scenario=name)
                self.assertGreater(r.end, 0.0, f"{name} wiped the account out")

    def test_equity_never_exceeds_what_the_books_hold(self):
        from ..core.engine import Engine
        w = SimWorld(WorldConfig(days=400), ADVERSARIAL, seed=3)
        eng = Engine(build_default(), ADVERSARIAL,
                     EngineConfig(starting_capital=10_000, warmup_days=120, seed=3))
        while not w.done:
            ctx = w.tick()
            eng.step(ctx)
            manual = eng.idle_cash + sum(
                b.live.equity(b.strategy.mark_prices(ctx), eng.tax_rate)
                for b in eng.books.values())
            self.assertAlmostEqual(eng.equity(ctx), manual, places=6)

    def test_paper_books_never_touch_real_money(self):
        from ..core.engine import Engine
        w = SimWorld(WorldConfig(days=300), ADVERSARIAL, seed=8)
        eng = Engine(build_default(), ADVERSARIAL,
                     EngineConfig(starting_capital=10_000, warmup_days=50, seed=8))
        while not w.done:
            eng.step(w.tick())
        for b in eng.books.values():
            self.assertGreater(b.paper.deposited, 0.0)
            if b.phase is Phase.PAPER:
                self.assertEqual(b.funded, 0.0)


def main():
    unittest.main(module=__name__, argv=["moneta-tests", "-v"], exit=False)


if __name__ == "__main__":
    main()
