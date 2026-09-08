"""VETA test suite. python -m unittest veta.tests.test_veta"""
from __future__ import annotations

import json
import random
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..brief import write_brief
from ..health import assess_repo, is_outside, payout_factor
from ..model import (Bounty, amount_is_ambiguous, extract_amount,
                     extract_amounts, looks_claimed, parse_ts)
from ..score import (BetaPosterior, ScoreConfig, WinModel, assess,
                     estimate_hours, rank)
from ..sources import algora, github, manual
from ..store import Record

FIXTURE = json.loads((Path(__file__).parent.parent / "fixtures" /
                      "github.json").read_text(encoding="utf-8"))
NOW = datetime.now(timezone.utc)


def days_ago(d: float) -> str:
    return (NOW - timedelta(days=d)).isoformat()


class FakeHttp:
    """Serves the fixture, so the whole pipeline runs with no network."""

    def __init__(self, fail_search: bool = False):
        self.fail_search = fail_search
        self.calls = 0

    def get_json(self, url: str, headers=None):
        self.calls += 1
        if "/search/issues" in url:
            if self.fail_search:
                raise RuntimeError("HTTP 403 Forbidden")
            return {"items": FIXTURE["issues"]}
        for repo, prs in FIXTURE["pulls"].items():
            if url.endswith(f"/repos/{repo}/pulls") or f"/repos/{repo}/pulls?" in url:
                return prs
        for repo, meta in FIXTURE["meta"].items():
            if url.rstrip("/").endswith(f"/repos/{repo}"):
                return meta
        for cu, comments in FIXTURE["comments"].items():
            if url.startswith(cu):
                return comments
        raise RuntimeError(f"unexpected url {url}")


class TestAmounts(unittest.TestCase):
    def test_currency_symbols_and_words(self):
        for text, expect in [("/bounty $500", (500.0, "USD")),
                             ("1,250 USD reward", (1250.0, "USD")),
                             ("Pago 300€ por esto", (300.0, "EUR")),
                             ("€750 for this", (750.0, "EUR")),
                             ("400 euros", (400.0, "EUR"))]:
            self.assertEqual(extract_amount(text), expect, text)

    def test_rejects_things_that_are_not_prices(self):
        for text in ["bump to v2.15.0", "error code 404", "timeout after 30000 ms",
                     "fixes #1234", "", "no money here"]:
            self.assertIsNone(extract_amount(text), text)

    def test_flags_ambiguity_instead_of_guessing_quietly(self):
        self.assertTrue(amount_is_ambiguous("$25 bounty + $50 bonus"))
        self.assertFalse(amount_is_ambiguous("$25 bounty"))
        self.assertEqual(len(extract_amounts("$25 bounty + $50 bonus")), 2)

    def test_sanity_band(self):
        self.assertIsNone(extract_amount("$2"))
        self.assertIsNone(extract_amount("$250000"))


class TestClaims(unittest.TestCase):
    def test_detects_real_claims(self):
        for text in ["/attempt", "/attempt #12", "I am working on this",
                     "I'm on it", "can i take this?", "taking it",
                     "started working on this", "assign this to me",
                     "picking it up"]:
            self.assertTrue(looks_claimed(text), text)

    def test_ignores_ordinary_comments(self):
        for text in ["any update?", "LGTM", "this looks broken", "+1",
                     "I had this problem too", ""]:
            self.assertFalse(looks_claimed(text), text)


class TestHealth(unittest.TestCase):
    def _prs(self, merge_rate, last_merge_days, n=20, assoc="CONTRIBUTOR"):
        out = []
        for i in range(n):
            created = 8 + i * 11
            merged = i < int(n * merge_rate)
            out.append({"author_association": assoc,
                        "created_at": days_ago(created),
                        "merged_at": days_ago(max(last_merge_days, created - 6))
                        if merged else None,
                        "comments": 1, "user": {"login": f"d{i}"}, "repo": "o/r"})
        return out

    def test_excludes_maintainers_own_pull_requests(self):
        self.assertFalse(is_outside({"author_association": "OWNER"}))
        self.assertFalse(is_outside({"author_association": "MEMBER"}))
        self.assertTrue(is_outside({"author_association": "CONTRIBUTOR"}))
        self.assertTrue(is_outside({"author_association": "FIRST_TIME_CONTRIBUTOR"}))

    def test_healthy_repo_scores_high(self):
        h = assess_repo("o/r", self._prs(0.85, 2), open_pr_count=9)
        self.assertGreater(h.outside_merge_rate, 0.7)
        f, _ = payout_factor(h)
        self.assertGreater(f, 0.8)

    def test_dead_repo_scores_near_zero(self):
        h = assess_repo("o/r", self._prs(0.05, 260), open_pr_count=180)
        f, reasons = payout_factor(h)
        self.assertLess(f, 0.15)
        self.assertTrue(any("merge" in r for r in reasons))

    def test_archived_repo_is_hopeless(self):
        h = assess_repo("o/r", self._prs(0.9, 1), archived=True)
        f, _ = payout_factor(h)
        self.assertEqual(f, 0.0)

    def test_unknown_health_is_not_treated_as_good(self):
        f, _ = payout_factor(None)
        self.assertLess(f, 0.8)

    def test_no_outside_prs_is_reported_not_silently_perfect(self):
        h = assess_repo("o/r", self._prs(1.0, 1, assoc="OWNER"))
        self.assertEqual(h.outside_prs, 0)
        self.assertTrue(h.error)
        f, _ = payout_factor(h)
        self.assertLess(f, 0.6)


class TestEffort(unittest.TestCase):
    def _b(self, **kw):
        base = dict(source="t", id="1", title="t", url="u", amount=100.0)
        base.update(kw)
        return Bounty(**base)

    def test_easy_issues_estimate_lower_than_hard_ones(self):
        easy = estimate_hours(self._b(title="Fix typo in README",
                                      labels=("good first issue", "documentation"),
                                      body="typo in the readme, one word"))
        hard = estimate_hours(self._b(title="Redesign the plugin architecture",
                                      labels=("refactor", "design"),
                                      body="investigate race conditions " * 40,
                                      comments=60))
        self.assertLess(easy[1], hard[1])
        self.assertLess(easy[1], 4.0)
        self.assertGreater(hard[1], 10.0)

    def test_a_reproduction_lowers_the_estimate(self):
        with_repro = estimate_hours(self._b(body="Steps to reproduce:\n```\nx\n```"))
        without = estimate_hours(self._b(body="It is broken somehow, please fix"))
        self.assertLess(with_repro[1], without[1])

    def test_range_brackets_the_estimate_and_widens_with_vagueness(self):
        lo, mid, hi = estimate_hours(self._b(body="It's broken."))
        self.assertLess(lo, mid)
        self.assertLess(mid, hi)
        clear = estimate_hours(self._b(body="Steps to reproduce:\n```\nx\n```" * 10))
        self.assertLess((clear[2] - clear[0]) / clear[1], (hi - lo) / mid)

    def test_estimates_stay_bounded(self):
        crazy = estimate_hours(self._b(labels=("refactor", "epic", "design"),
                                       body="refactor rewrite redesign migrate " * 200,
                                       comments=400))
        self.assertLessEqual(crazy[1], 80.0)


class TestSkillPosterior(unittest.TestCase):
    def test_starts_sceptical(self):
        self.assertLess(BetaPosterior().mean, 0.30)

    def test_learns_from_outcomes(self):
        p = BetaPosterior()
        for _ in range(30):
            p.update(True)
        self.assertGreater(p.mean, 0.7)
        q = BetaPosterior()
        for _ in range(30):
            q.update(False)
        self.assertLess(q.mean, 0.10)

    def test_interval_narrows_with_evidence(self):
        few, many = BetaPosterior(), BetaPosterior()
        for _ in range(3):
            few.update(True)
        for _ in range(200):
            many.update(True)
        w = lambda p: p.credible_interval()[1] - p.credible_interval()[0]
        self.assertGreater(w(few), w(many))

    def test_sampling_stays_in_range(self):
        rng = random.Random(0)
        p = BetaPosterior()
        for _ in range(500):
            self.assertTrue(0.0 <= p.sample(rng) <= 1.0)


class TestScoring(unittest.TestCase):
    def setUp(self):
        self.healthy = assess_repo("acme/tool", FIXTURE["pulls"]["acme/tool"],
                                   open_pr_count=9)
        self.dead = assess_repo("ghost/dead", FIXTURE["pulls"]["ghost/dead"],
                                open_pr_count=180)
        self.good = github.to_bounty(FIXTURE["issues"][0])

    def test_same_bounty_is_worth_less_in_a_dead_repo(self):
        a = assess(self.good, self.healthy)
        b = assess(self.good, self.dead)
        self.assertGreater(a.ev_per_hour, b.ev_per_hour * 3)
        self.assertTrue(a.verdict.startswith("ATTEMPT"))
        self.assertTrue(b.verdict.startswith("SKIP"))

    def test_the_biggest_payout_is_not_the_best_deal(self):
        small = assess(github.to_bounty(FIXTURE["issues"][0]), self.healthy)
        huge = assess(github.to_bounty(FIXTURE["issues"][1]), self.healthy)
        self.assertGreater(huge.bounty.amount, small.bounty.amount * 4)
        self.assertGreater(small.ev_per_hour, huge.ev_per_hour)

    def test_an_assignee_collapses_the_odds(self):
        free = assess(self.good, self.healthy)
        taken = assess(github.to_bounty(FIXTURE["issues"][4]), self.healthy)
        self.assertLess(taken.p_win, free.p_win / 3)
        self.assertTrue(any("assigned" in w for w in taken.warnings))

    def test_rivals_reduce_but_do_not_annihilate_the_odds(self):
        b = github.to_bounty(FIXTURE["issues"][0])
        alone = assess(b, self.healthy).p_win
        b.claimants = ("rival",)
        contested = assess(b, self.healthy).p_win
        self.assertLess(contested, alone)
        self.assertGreater(contested, alone * 0.4)

    def test_closed_bounties_are_worthless(self):
        b = github.to_bounty(FIXTURE["issues"][0])
        b.state = "closed"
        a = assess(b, self.healthy)
        self.assertEqual(a.p_win, 0.0)
        self.assertIn("closed", a.verdict)

    def test_ranking_orders_by_euros_per_hour(self):
        items = [assess(github.to_bounty(i), self.healthy)
                 for i in FIXTURE["issues"] if github.to_bounty(i)]
        ranked = rank(items)
        rates = [a.ev_per_hour for a in ranked]
        self.assertEqual(rates, sorted(rates, reverse=True))

    def test_ambiguous_amounts_produce_a_warning(self):
        b = Bounty(source="t", id="1", title="$25 bounty + $50 bonus", url="u",
                   amount=50.0, body="")
        self.assertTrue(any("amounts" in w for w in assess(b, self.healthy).warnings))


class TestSources(unittest.TestCase):
    def test_github_issue_without_an_amount_is_dropped(self):
        self.assertIsNone(github.to_bounty(FIXTURE["issues"][5]))

    def test_github_parses_repo_and_amount(self):
        b = github.to_bounty(FIXTURE["issues"][0])
        self.assertEqual(b.repo, "acme/tool")
        self.assertEqual(b.amount, 400.0)
        self.assertEqual(b.state, "open")

    def test_github_search_reports_total_failure_loudly(self):
        errors: list[str] = []
        out = github.search(FakeHttp(fail_search=True), errors=errors)
        self.assertEqual(out, [])
        self.assertTrue(errors)
        self.assertIn("EVERY label", errors[0])

    def test_github_search_finds_the_priced_issues(self):
        errors: list[str] = []
        out = github.search(FakeHttp(), labels=["💎 Bounty"], errors=errors)
        self.assertEqual(errors, [])
        self.assertTrue(out)
        self.assertTrue(all(b.amount > 0 for b in out))

    def test_claims_are_read_from_the_thread(self):
        b = github.to_bounty(FIXTURE["issues"][1])
        b = github.enrich_claims(FakeHttp(), b)
        self.assertIn("rival1", b.claimants)
        self.assertNotIn("bob", b.claimants)

    def test_algora_tolerates_several_payload_shapes(self):
        shapes = [
            {"id": "1", "title": "a", "amount": 500, "currency": "USD",
             "url": "https://github.com/o/r/issues/1", "status": "open"},
            {"id": "2", "task": {"title": "b", "url": "https://github.com/o/r/issues/2"},
             "reward": {"amount": 25000, "currency": "USD"}, "status": "active"},
            {"uuid": "3", "name": "c", "amount_in_cents": 7500,
             "html_url": "https://github.com/x/y/issues/3"},
        ]
        for s in shapes:
            b = algora.to_bounty(s)
            self.assertIsNotNone(b, s)
            self.assertGreater(b.amount, 0)
            self.assertIn("/", b.repo)

    def test_algora_finds_the_list_in_any_envelope(self):
        item = {"id": 1, "amount": 100, "title": "t"}
        for env in ([item], {"items": [item]}, {"data": [item]},
                    {"results": [item]}, {"edges": [{"node": item}]}):
            self.assertEqual(len(algora._records(env)), 1, env)

    def test_manual_file_round_trip(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "m.json"
            p.write_text(json.dumps([
                {"title": "paid gig", "url": "u", "amount": 300, "currency": "EUR",
                 "repo": "o/r", "created_at": days_ago(3)},
                {"title": "no amount", "url": "u2", "amount": 0},
            ]))
            out = manual.load(p)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].amount, 300.0)


class TestPipeline(unittest.TestCase):
    def test_end_to_end_ranks_the_good_bounty_first(self):
        from ..pipeline import ScanConfig, scan
        results = scan(ScanConfig(sources=("github",), deep_check=6,
                                  claim_check=6), http=FakeHttp())
        self.assertTrue(results)
        top = results[0]
        self.assertEqual(top.bounty.repo, "acme/tool")
        self.assertTrue(top.verdict.startswith("ATTEMPT"))
        # everything in the dead repo must rank below everything in the live one
        dead = [a for a in results if a.bounty.repo == "ghost/dead"]
        self.assertTrue(all(d.ev_per_hour < top.ev_per_hour for d in dead))

    def test_dead_repo_bounties_are_all_skipped(self):
        from ..pipeline import ScanConfig, scan
        results = scan(ScanConfig(sources=("github",), deep_check=6),
                       http=FakeHttp())
        for a in results:
            if a.bounty.repo == "ghost/dead" and a.health is not None:
                self.assertTrue(a.verdict.startswith("SKIP"), a.bounty.title)


class TestRecord(unittest.TestCase):
    def _rec(self):
        d = tempfile.mkdtemp()
        return Record(Path(d) / "r.json")

    def test_abandoned_counts_as_a_loss(self):
        r = self._rec()
        a = assess(github.to_bounty(FIXTURE["issues"][0]), None)
        r.start(a)
        r.finish(a.bounty.key(), "abandoned", 9.0, 0.0)
        self.assertEqual(r.skill().attempts, 1)
        self.assertLess(r.skill().mean, BetaPosterior().mean)

    def test_measures_the_real_hourly_rate(self):
        r = self._rec()
        for i, (outcome, hours, paid) in enumerate(
                [("won", 5.0, 400.0), ("lost", 6.0, 0.0), ("won", 4.0, 200.0)]):
            b = github.to_bounty(FIXTURE["issues"][0])
            b.id = str(i)
            r.start(assess(b, None))
            r.finish(b.key(), outcome, hours, paid)
        s = r.stats()
        self.assertAlmostEqual(s["eur_per_hour"], 600.0 / 15.0, places=6)
        self.assertAlmostEqual(s["win_rate"], 2 / 3, places=6)

    def test_survives_a_reload(self):
        r = self._rec()
        a = assess(github.to_bounty(FIXTURE["issues"][0]), None)
        r.start(a)
        r.finish(a.bounty.key(), "won", 3.0, 400.0)
        again = Record(r.path)
        self.assertEqual(len(again.attempts), 1)
        self.assertEqual(again.attempts[0].outcome, "won")

    def test_starting_twice_does_not_duplicate(self):
        r = self._rec()
        a = assess(github.to_bounty(FIXTURE["issues"][0]), None)
        r.start(a)
        r.start(a)
        self.assertEqual(len(r.attempts), 1)


class TestBrief(unittest.TestCase):
    def test_brief_leads_with_the_time_box(self):
        h = assess_repo("acme/tool", FIXTURE["pulls"]["acme/tool"], open_pr_count=9)
        a = assess(github.to_bounty(FIXTURE["issues"][0]), h)
        text = write_brief(a)
        self.assertIn("Budget:", text)
        self.assertIn("Hard stop:", text)
        self.assertIn(a.bounty.url, text)
        self.assertLess(text.index("Hard stop"), text.index("## The task"))

    def test_brief_carries_the_warnings(self):
        h = assess_repo("ghost/dead", FIXTURE["pulls"]["ghost/dead"],
                        open_pr_count=180)
        a = assess(github.to_bounty(FIXTURE["issues"][3]), h)
        text = write_brief(a)
        self.assertIn("merge", text.lower())
        self.assertIn(a.verdict, text)


class TestPolicy(unittest.TestCase):
    """The claim VETA is built on, checked on a small but real sweep."""

    def test_ev_ranking_beats_taking_the_biggest_payout(self):
        import statistics as st
        from ..sim.hunter import run_season
        veta = [run_season("veta (EV con salud del repo)", s, use_ev_floor=False)
                for s in range(6)]
        payout = [run_season("mayor pago primero", s) for s in range(6)]
        self.assertGreater(st.median([r.eur_per_hour for r in veta]),
                           st.median([r.eur_per_hour for r in payout]) * 1.5)

    def test_ev_ranking_loses_less_work_to_repos_that_never_merge(self):
        import statistics as st
        from ..sim.hunter import run_season
        veta = [run_season("veta (EV con salud del repo)", s, use_ev_floor=False)
                for s in range(6)]
        naive = [run_season("pago / horas estimadas", s) for s in range(6)]
        self.assertLess(st.mean([r.repo_refused for r in veta]),
                        st.mean([r.repo_refused for r in naive]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
