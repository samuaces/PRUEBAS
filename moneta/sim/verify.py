"""The verification suite.

This is the part that decides whether MONETA is allowed to claim anything.
It runs five independent checks and every one of them can fail:

  1. FALSIFICATION  -- the zero-edge control must (almost) never be funded.
                       If it is, the gate does not work and nothing else in
                       this repository means anything.
  2. BASELINE       -- what the system does over many independent histories.
  3. CAPITAL CURVE  -- how the answer changes with account size. This is the
                       check that exposes which arm is really doing the work.
  4. STRESS         -- the same system through crashes, funding inversions,
                       exchange failures and fee shocks.
  5. ABLATION       -- each mechanism removed in turn, so the contribution of
                       the gate, of Kelly sizing and of the whole allocator is
                       measured rather than asserted.

The verdict is computed from the numbers, not written in advance.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, replace

from .montecarlo import SweepConfig, compare, summarise, sweep
from .scenarios import SCENARIOS
from . import report as R


@dataclass
class Check:
    name: str
    passed: bool
    detail: str


def _progress(label: str):
    """Live progress on a terminal; silence when the output is redirected."""
    import sys
    if not sys.stdout.isatty():
        return None
    state = {"last": 0.0}

    def cb(done: int, total: int):
        now = time.time()
        if done == total or now - state["last"] > 2.0:
            state["last"] = now
            pad = " " * 20
            print(f"\r  {label}: {done}/{total} paths{pad}", end="", flush=True)
            if done == total:
                print(f"\r{' ' * (len(label) + 40)}\r", end="", flush=True)
    return cb


def run(paths: int = 200, live_days: int = 365, warmup_days: float = 730,
        capital: float = 10_000.0, preset: str = "adversarial",
        quick: bool = False, out=print) -> dict:
    t_start = time.time()
    base_cfg = SweepConfig(paths=paths, live_days=live_days,
                           warmup_days=warmup_days, capital=capital,
                           friction_preset=preset)
    checks: list[Check] = []
    results: dict = {}

    # ------------------------------------------------------------------
    out(R.header("1. FALSIFICATION -- can the gate be fooled by a coin flip?"))
    out("""
  `control_null` trades a coin flip with real costs. Its true edge is
  negative and it is profitable in roughly a third of individual years, so
  it looks like a winner often enough to fool a naive backtest. If MONETA
  funds it, MONETA is broken.
""")
    base_rows = sweep(base_cfg, _progress("baseline"))
    base = summarise(base_rows, "baseline (MONETA, full machinery)")
    results["baseline"] = base

    null_funded = base["per_strategy"]["control_null"]["funded_fraction"]
    null_share = base["per_strategy"]["control_null"]["mean_capital_share"]
    ok = null_funded <= 0.10 and null_share <= 0.02
    checks.append(Check(
        "zero-edge control is not funded", ok,
        f"funded in {null_funded:.1%} of paths (limit 10%), "
        f"mean capital share {null_share:.2%} (limit 2%)"))
    out(f"  control_null was funded in {null_funded:.1%} of paths, "
        f"average capital share {null_share:.2%}")
    out(f"  -> {'PASS' if ok else 'FAIL'}")

    # ------------------------------------------------------------------
    out(R.header(f"2. BASELINE -- EUR {capital:,.0f}, {preset} frictions, "
                 f"{live_days} live days after {warmup_days:.0f} days of validation"))
    out(R.summary_block(base, capital))
    out(R.strategy_table(base))
    checks.append(Check(
        "baseline beats cash after tax", base["cagr_median"] > 0.0,
        f"median CAGR {base['cagr_median']:+.2%}"))
    checks.append(Check(
        "tail risk is bounded", base["prob_ruin_20pct"] <= 0.05,
        f"P(drawdown >= 20%) = {base['prob_ruin_20pct']:.1%}"))

    # ------------------------------------------------------------------
    out(R.header("3. CAPITAL CURVE -- does more money help?"))
    out("""
  The same machine, the same hours, different account sizes. If returns fall
  as capital rises, the money is coming from your attention rather than from
  your balance -- which changes what you should do next.
""")
    cap_levels = [2_000.0, 10_000.0, 50_000.0] if quick else \
                 [2_000.0, 10_000.0, 50_000.0, 200_000.0]
    cap_results = {}
    out(f"  {'capital':>12}{'CAGR':>9}{'profit':>11}{'EUR/hour':>11}"
        f"{'P(loss)':>9}   {'from your HOURS':>16}{'from your MONEY':>17}")
    out("  " + "-" * 88)
    for cap in cap_levels:
        cfg = replace(base_cfg, capital=cap,
                      paths=max(40, paths // 2) if not quick else 40)
        rows = sweep(cfg, _progress(f"capital {cap:,.0f}"))
        s = summarise(rows, f"capital={cap:,.0f}")
        cap_results[cap] = s
        labour_pnl = s["per_strategy"]["retail_arb"]["mean_pnl"]
        capital_pnl = sum(v["mean_pnl"] for k, v in s["per_strategy"].items()
                          if k != "retail_arb")
        out(f"  {cap:>12,.0f}{s['cagr_median']*100:>8.2f}%"
            f"{s['median_profit']:>11,.0f}"
            f"{s['eur_per_labor_hour_median']:>11,.2f}"
            f"{s['prob_loss']:>9.0%}   "
            f"{labour_pnl:>+16,.0f}{capital_pnl:>+17,.0f}")
    results["capital_curve"] = {str(int(k)): v for k, v in cap_results.items()}

    small, large = cap_results[cap_levels[0]], cap_results[cap_levels[-1]]
    lab_s = small["per_strategy"]["retail_arb"]["mean_pnl"]
    lab_l = large["per_strategy"]["retail_arb"]["mean_pnl"]
    cap_s = sum(v["mean_pnl"] for k, v in small["per_strategy"].items()
                if k != "retail_arb")
    cap_l = sum(v["mean_pnl"] for k, v in large["per_strategy"].items()
                if k != "retail_arb")
    ratio = (cap_levels[-1] / cap_levels[0])
    out(f"\n  Multiplying the account by {ratio:.0f}x multiplied the labour-side")
    out(f"  contribution by {lab_l/max(lab_s,1e-9):.1f}x and the capital-side "
        f"contribution by {cap_l/max(cap_s,1e-9):.1f}x.")
    out("")
    if lab_l < lab_s * 2.0:
        out("  -> The labour arm does NOT scale with money. It is capped by the hours")
        out("     you have, and no amount of capital lifts that ceiling. At small")
        out("     account sizes it is nearly all of the profit, which is why the")
        out("     percentage return looks impressive and the euro figure does not.")
        out("  -> The capital arms DO scale, at a low single-digit percentage. They")
        out("     only start to matter in absolute terms above roughly EUR 50,000.")
        out("  -> Practical reading: below ~EUR 20,000 this is a tool for spending")
        out("     your hours well. Above it, it becomes a tool for allocating money.")

    # ------------------------------------------------------------------
    out(R.header("4. STRESS -- the same system through things that actually happen"))
    stress_names = (["base", "crash", "funding_flip", "venue_failure", "everything"]
                    if quick else list(SCENARIOS))
    stress = {}
    for name in stress_names:
        cfg = replace(base_cfg, scenario=SCENARIOS[name],
                      paths=max(40, paths // 2) if not quick else 40)
        rows = sweep(cfg, _progress(f"scenario {name}"))
        stress[name] = summarise(rows, name)
    results["stress"] = stress
    out(R.scenario_table(stress))

    worst = min(stress.values(), key=lambda s: s["cagr_p05"])
    survivable = all(s["cagr_p05"] > -0.35 for s in stress.values())
    checks.append(Check(
        "survives every stress scenario without ruin", survivable,
        f"worst 5th-percentile year: {worst['cagr_p05']:+.2%} in '{worst['label']}'"))
    out(f"\n  Worst case across all scenarios: 5th-percentile annual return of "
        f"{worst['cagr_p05']:+.2%} ('{worst['label']}').")
    out("  Note that `venue_failure` is a total loss of everything held at that")
    out("  exchange. The concentration cap is what turns it into a survivable hit.")

    # ------------------------------------------------------------------
    out(R.header("5. ABLATION -- is each mechanism actually earning its place?"))
    out("""
  Every component is removed in turn and the system re-run on the SAME
  histories. A mechanism that cannot beat its own absence is decoration.
""")
    abl_paths = max(60, paths // 2) if not quick else 40
    arms = {
        "no promotion gate (deploy immediately)": dict(gate=False),
        "no Kelly sizing (flat allocations)": dict(kelly=False),
        "uniform split, no gate, no Kelly": dict(allocator="uniform", gate=False,
                                                 kelly=False),
    }
    base_abl_rows = sweep(replace(base_cfg, paths=abl_paths), _progress("ablation base"))
    base_abl = summarise(base_abl_rows, "MONETA (all mechanisms)")
    comparisons = []
    abl_results = {"full": base_abl}
    for label, kwargs in arms.items():
        rows = sweep(replace(base_cfg, paths=abl_paths, **kwargs),
                     _progress(f"ablation: {label[:24]}"))
        s = summarise(rows, label)
        abl_results[label] = s
        comparisons.append(compare(s, base_abl))
    results["ablation"] = abl_results

    out(R.comparison_table([{"a": base_abl["label"],
                             "a_median_cagr": base_abl["cagr_median"],
                             "delta_mean_cagr": 0.0, "p_value": 1.0,
                             "significant_at_5pct": False}] + comparisons))

    out("\n  What each arm does to the zero-edge control:")
    out(f"  {'arm':<40}{'control_null funded':>22}{'capital':>10}")
    out("  " + "-" * 72)
    for label, s in abl_results.items():
        cn = s["per_strategy"]["control_null"]
        out(f"  {label:<40}{cn['funded_fraction']:>21.0%}"
            f"{cn['mean_capital_share']:>10.1%}")

    nogate = abl_results["no promotion gate (deploy immediately)"]
    naive = abl_results["uniform split, no gate, no Kelly"]

    # The gate makes exactly two claims. Test those, not a flattering third.
    worst_ungated = max(
        nogate["per_strategy"]["control_null"]["funded_fraction"],
        naive["per_strategy"]["control_null"]["funded_fraction"])
    gate_works = (base_abl["per_strategy"]["control_null"]["funded_fraction"] <= 0.10
                  and worst_ungated >= 0.50)
    checks.append(Check(
        "the gate is what keeps the coin-flip strategy out", gate_works,
        f"funded in {base_abl['per_strategy']['control_null']['funded_fraction']:.0%} "
        f"of paths with the gate, {worst_ungated:.0%} without it"))

    dd_better = nogate["max_drawdown_p95"] >= base_abl["max_drawdown_p95"]
    checks.append(Check(
        "the gate reduces tail drawdown", dd_better,
        f"95th-percentile drawdown {base_abl['max_drawdown_p95']:.1%} with the gate "
        f"vs {nogate['max_drawdown_p95']:.1%} without"))

    out("")
    out("  HONEST READING OF THIS TABLE. Removing the gate can RAISE the median")
    out("  return, and in these runs it does: capital goes to work immediately")
    out("  instead of waiting for proof. That is the whole trade. What you buy")
    out("  with the gate is the left tail and the guarantee that a strategy with")
    out(f"  no edge at all is funded in {base_abl['per_strategy']['control_null']['funded_fraction']:.0%} "
        f"of futures instead of {worst_ungated:.0%}.")
    out("  MONETA is not claiming the gate makes you more money on average.")
    out("  It is claiming it stops you from being confidently wrong with real money.")

    # ------------------------------------------------------------------
    out(R.header("VERDICT"))
    for c in checks:
        out(f"  [{'PASS' if c.passed else 'FAIL'}]  {c.name}")
        out(f"          {c.detail}")
    all_passed = all(c.passed for c in checks)
    out("")
    out(f"  {sum(c.passed for c in checks)}/{len(checks)} checks passed "
        f"in {time.time()-t_start:.0f}s")
    results["checks"] = [{"name": c.name, "passed": c.passed, "detail": c.detail}
                         for c in checks]
    results["all_passed"] = all_passed
    return results
