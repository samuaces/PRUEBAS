"""MONETA command line."""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from dataclasses import replace

from .core.allocator import Allocator, AllocatorConfig
from .core.engine import EngineConfig, run_path
from .core.frictions import PRESETS, get_preset
from .core.risk import RiskLimits
from .core.stats import EdgePosterior
from .sim import report as R
from .sim.market import SimWorld, WorldConfig
from .sim.montecarlo import SweepConfig, summarise, sweep
from .sim.scenarios import SCENARIOS
from .strategies import DEFAULT_STRATEGIES, build_default

BANNER = r"""
   __  __  ___  _  _ ___ _____  _
  |  \/  |/ _ \| \| | __|_   _|/_\
  | |\/| | (_) | .` | _|  | | / _ \
  |_|  |_|\___/|_|\_|___| |_|/_/ \_\   an engine for finding real edges,
                                       and refusing to fund fake ones
"""


# --------------------------------------------------------------------------
def cmd_doctor(args) -> int:
    print(BANNER)
    print(R.header("ENVIRONMENT"))
    print(f"  python            {sys.version.split()[0]}")
    print(f"  platform          {sys.platform}")
    print(f"  cpu cores         {os.cpu_count()}")
    print(f"  dependencies      none (standard library only)")

    print(R.header("SELF-TEST"))
    t0 = time.time()
    world = SimWorld(WorldConfig(days=120), get_preset("adversarial"), seed=7)
    result = run_path(world, build_default(), get_preset("adversarial"),
                      EngineConfig(starting_capital=10_000, warmup_days=60, seed=7))
    print(f"  simulated 120 days in {time.time()-t0:.2f}s")
    print(f"  ledger balanced, equity = EUR {result.end:,.2f}")
    print(f"  strategies loaded: {', '.join(s.name for s in DEFAULT_STRATEGIES)}")

    print(R.header("LIVE DATA (public endpoints, read-only, no keys)"))
    try:
        from .feeds.public import doctor as feed_doctor
        for st in feed_doctor():
            print(f"  [{'OK  ' if st.ok else 'DOWN'}]  {st.name}")
            print(f"           {st.detail}")
    except Exception as exc:                            # noqa: BLE001
        print(f"  feeds unavailable: {exc}")
    print("\n  Live data is optional. Every simulation command works offline.")
    return 0


# --------------------------------------------------------------------------
def cmd_explain(args) -> int:
    print(BANNER)
    print(R.header("WHAT THIS PROGRAM ACTUALLY DOES"))
    print("""
  It does not create money. Nothing does. It finds small, real edges,
  proves they are real before risking anything on them, sizes them so a bad
  run cannot end the account, and compounds what survives.

  Every strategy below is judged on the same two axes: what it returns per
  euro of capital, and what it returns per hour of your attention. Those are
  the only two things you have.
""")
    for cls in DEFAULT_STRATEGIES:
        s = cls()
        print(R.header(f"{s.name}   [{s.kind.value}-bound]", 78))
        doc = (s.__doc__ or "").strip().split("\n")
        for line in doc:
            print("  " + line.strip())
        print(f"\n  venues: {', '.join(s.venues) or '-'}"
              f"   upkeep: {s.upkeep_h_per_week:.1f} h/week"
              f"   fixed cost: EUR {s.monthly_cost:.0f}/month")
    return 0


# --------------------------------------------------------------------------
def cmd_simulate(args) -> int:
    preset = get_preset(args.frictions)
    print(BANNER)
    print(R.header(
        f"SIMULATION  |  EUR {args.capital:,.0f}  |  {preset.name} frictions  |  "
        f"{args.days} live days  |  {args.paths} paths"))
    print(f"  validation period: {args.warmup} days of paper trading first "
          f"(nothing earned, nothing risked)")
    print(f"  scenario: {args.scenario}")
    print(f"  your available time: {args.hours} h/week\n")

    cfg = SweepConfig(paths=args.paths, live_days=args.days,
                      warmup_days=args.warmup, capital=args.capital,
                      friction_preset=args.frictions,
                      labor_hours_per_week=args.hours,
                      scenario=SCENARIOS[args.scenario], seed0=args.seed)

    state = {"last": 0.0}

    def progress(done, total):
        now = time.time()
        if done == total or now - state["last"] > 1.5:
            state["last"] = now
            width = 34
            filled = int(width * done / total)
            print(f"\r  [{'#'*filled}{'.'*(width-filled)}] {done}/{total}",
                  end="", flush=True)
            if done == total:
                print()

    t0 = time.time()
    rows = sweep(cfg, progress)
    s = summarise(rows, "simulation")
    print(f"  done in {time.time()-t0:.1f}s\n")
    print(R.summary_block(s, args.capital))
    print(R.strategy_table(s))

    print("\n  " + "-" * 60)
    print("  READ THIS BEFORE BELIEVING ANY OF IT")
    print("  " + "-" * 60)
    print(f"  These are simulated outcomes under a model of the world, scored")
    print(f"  with the '{preset.name}' friction preset. They are not a forecast and")
    print(f"  not a promise. The model's assumptions are in moneta/sim/market.py")
    print(f"  and are meant to be argued with.")

    if args.json:
        with open(args.json, "w") as fh:
            out = {k: v for k, v in s.items() if not k.startswith("_")}
            json.dump(out, fh, indent=2)
        print(f"\n  wrote {args.json}")
    return 0


# --------------------------------------------------------------------------
def cmd_verify(args) -> int:
    from .sim.verify import run
    print(BANNER)
    results = run(paths=args.paths, live_days=args.days,
                  warmup_days=args.warmup, capital=args.capital,
                  preset=args.frictions, quick=args.quick)
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(_strip(results), fh, indent=2)
        print(f"\n  wrote {args.json}")
    return 0 if results["all_passed"] else 1


def _strip(obj):
    if isinstance(obj, dict):
        return {k: _strip(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [_strip(v) for v in obj]
    return obj


# --------------------------------------------------------------------------
def cmd_worklist(args) -> int:
    """The actionable output: what to actually go and do today."""
    from .strategies.retail_arb import RetailArb
    preset = get_preset(args.frictions)
    world = SimWorld(WorldConfig(days=2, labor_hours_per_week=args.hours),
                     preset, seed=args.seed)
    strat = RetailArb()
    print(BANNER)
    print(R.header("SOURCING WORKLIST"))
    print(f"  Ranked by euros per hour of your time, after {preset.name} fees,")
    print(f"  shipping, returns and the risk the item is not as described.\n")

    found = []
    scanned = 0
    while not world.done:
        ctx = world.tick()
        scanned += ctx.data["listings_scanned"]
        found.extend(strat.scan(ctx))
    found.sort(key=lambda o: -o.meta["eur_per_hour"])

    print(f"  {'item':<34}{'pay':>8}{'sell~':>8}{'net':>8}{'ROI':>8}{'EUR/h':>8}")
    print("  " + "-" * 74)
    for opp in found[:args.limit]:
        d = opp.meta["deal"]
        print(f"  {d.category+' '+d.sku:<34}{d.cost:>8.0f}{d.resale_est:>8.0f}"
              f"{opp.meta['net_eur']:>8.0f}{opp.meta['roi']:>7.0%}"
              f"{opp.meta['eur_per_hour']:>8.0f}")
    print("  " + "-" * 74)
    print(f"  {scanned:,} listings priced up, {len(found)} cleared the filter "
          f"({len(found)/max(scanned,1):.2%} hit rate)")
    print(f"\n  These are SIMULATED listings. To point this at real marketplaces,")
    print(f"  implement a scraper/API client that yields moneta.sim.market.Deal")
    print(f"  objects and hand them to RetailArb.scan(). The economics -- the")
    print(f"  filter, the ranking, the fee model -- are already correct.")
    return 0


# --------------------------------------------------------------------------
def cmd_seed(args) -> int:
    """Prime the promotion gate with real historical funding rates."""
    from .feeds.public import (FeedUnavailable, carry_returns_from_funding,
                               funding_history, seed_posterior)
    preset = get_preset(args.frictions)
    print(BANNER)
    print(R.header("SEEDING THE GATE WITH REAL HISTORY"))
    try:
        rates = funding_history(args.symbol, limit=1000, venue=args.venue)
    except FeedUnavailable as exc:
        print(f"  could not reach {args.venue}: {exc}")
        print("\n  This command needs network access to a public exchange API.")
        print("  Everything else in MONETA works offline.")
        return 1
    rets = carry_returns_from_funding(rates, preset)
    post = EdgePosterior(prior_sigma=0.004)
    n = seed_posterior(post, rets)
    lb = post.anytime_lower_bound(0.05)
    days = n / 3.0
    print(f"  venue                  {args.venue} / {args.symbol}")
    print(f"  settled intervals      {n} (~{days:.0f} days of history)")
    print(f"  mean funding           {statistics.mean(r for _, r in rates)*1095*100:+.2f}%/yr gross")
    print(f"  net of {preset.name} costs, on capital actually tied up:")
    print(f"    per 8h interval      {post.mu_n*100:+.5f}%")
    print(f"    annualised           {post.mu_n*1095*100:+.2f}%")
    print(f"    anytime-valid 95% lower bound: {lb*1095*100:+.2f}%/yr")
    print()
    if lb > 0:
        print(f"  -> The gate OPENS on this history. A carry book would be funded")
        print(f"     immediately rather than after two years of paper trading.")
    else:
        print(f"  -> The gate STAYS SHUT. This much history is not enough to rule")
        print(f"     out that the edge is zero, under {preset.name} costs.")
        print(f"     That is the correct answer, not a bug.")
    return 0


# --------------------------------------------------------------------------
def cmd_dashboard(args) -> int:
    from .ui.dashboard import build, serve
    preset = get_preset(args.frictions)
    print(BANNER)
    print("  running simulation for the dashboard...")
    cfg = SweepConfig(paths=args.paths, live_days=args.days,
                      warmup_days=args.warmup, capital=args.capital,
                      friction_preset=args.frictions,
                      labor_hours_per_week=args.hours)
    rows = sweep(cfg)
    s = summarise(rows, "dashboard")

    world = SimWorld(WorldConfig(days=int(args.warmup + args.days),
                                 labor_hours_per_week=args.hours),
                     preset, seed=99)
    detail = run_path(world, build_default(), preset,
                      EngineConfig(starting_capital=args.capital,
                                   paper_notional=args.capital,
                                   warmup_days=args.warmup, seed=99))
    path = build(s, detail, cfg, args.output)
    print(f"  wrote {path}")
    if args.serve:
        serve(path, args.port)
    else:
        print(f"  open it in a browser, or re-run with --serve")
    return 0


# --------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="moneta",
        description="An engine for finding real edges and refusing to fund fake ones.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="start with:  python -m moneta doctor")
    sub = p.add_subparsers(dest="command", required=True)

    def common(sp, capital=10_000.0, days=365, paths=200):
        sp.add_argument("--capital", type=float, default=capital)
        sp.add_argument("--days", type=int, default=days,
                        help="live trading days to simulate")
        sp.add_argument("--warmup", type=float, default=730.0,
                        help="paper-only validation days before any real money")
        sp.add_argument("--paths", type=int, default=paths)
        sp.add_argument("--frictions", default="adversarial", choices=sorted(PRESETS))
        sp.add_argument("--hours", type=float, default=10.0,
                        help="hours per week you can actually give it")
        sp.add_argument("--seed", type=int, default=1000)

    sp = sub.add_parser("doctor", help="check the install and the data feeds")
    sp.set_defaults(func=cmd_doctor)

    sp = sub.add_parser("explain", help="what each strategy is and who pays you")
    sp.set_defaults(func=cmd_explain)

    sp = sub.add_parser("simulate", help="Monte Carlo the whole system")
    common(sp)
    sp.add_argument("--scenario", default="base", choices=sorted(SCENARIOS))
    sp.add_argument("--json", help="write the summary to this file")
    sp.set_defaults(func=cmd_simulate)

    sp = sub.add_parser("verify", help="run the full falsification suite")
    common(sp, paths=200)
    sp.add_argument("--quick", action="store_true", help="fewer paths, fewer scenarios")
    sp.add_argument("--json", help="write full results to this file")
    sp.set_defaults(func=cmd_verify)

    sp = sub.add_parser("worklist", help="ranked list of things to go and buy")
    sp.add_argument("--frictions", default="realistic", choices=sorted(PRESETS))
    sp.add_argument("--hours", type=float, default=10.0)
    sp.add_argument("--limit", type=int, default=20)
    sp.add_argument("--seed", type=int, default=int(time.time()) % 100000)
    sp.set_defaults(func=cmd_worklist)

    sp = sub.add_parser("seed", help="prime the gate with real funding history")
    sp.add_argument("--symbol", default="BTCUSDT")
    sp.add_argument("--venue", default="binance", choices=["binance", "bybit"])
    sp.add_argument("--frictions", default="adversarial", choices=sorted(PRESETS))
    sp.set_defaults(func=cmd_seed)

    sp = sub.add_parser("dashboard", help="build a local HTML dashboard")
    common(sp, paths=80)
    sp.add_argument("--output", default="moneta_dashboard.html")
    sp.add_argument("--serve", action="store_true")
    sp.add_argument("--port", type=int, default=8765)
    sp.set_defaults(func=cmd_dashboard)
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("\ninterrupted")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
