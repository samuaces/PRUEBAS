"""Human-readable rendering of simulation output."""
from __future__ import annotations

import math


def _pct(x: float, places: int = 2) -> str:
    return f"{x*100:+.{places}f}%"


def rule(char: str = "=", width: int = 78) -> str:
    return char * width


def header(title: str, width: int = 78) -> str:
    return f"\n{rule('=', width)}\n{title}\n{rule('=', width)}"


def bar(value: float, lo: float, hi: float, width: int = 28) -> str:
    if hi <= lo:
        return " " * width
    pos = int(round((value - lo) / (hi - lo) * (width - 1)))
    pos = max(0, min(width - 1, pos))
    zero = int(round((0.0 - lo) / (hi - lo) * (width - 1))) if lo <= 0 <= hi else -1
    cells = []
    for i in range(width):
        if i == pos:
            cells.append("#")
        elif i == zero:
            cells.append("|")
        else:
            cells.append("-")
    return "".join(cells)


def summary_block(s: dict, capital: float | None = None) -> str:
    L = []
    L.append(f"  paths simulated          {s['paths']}")
    L.append(f"  annual return (median)   {_pct(s['cagr_median'])}")
    L.append(f"  annual return (mean)     {_pct(s['cagr_mean'])}"
             f"   95% CI [{_pct(s['cagr_ci95'][0])}, {_pct(s['cagr_ci95'][1])}]")
    L.append(f"  5th / 95th percentile    {_pct(s['cagr_p05'])} / {_pct(s['cagr_p95'])}")
    L.append(f"  worst 5% average (CVaR)  {_pct(s['cvar05_cagr'])}")
    L.append(f"  probability of a loss    {s['prob_loss']:.0%}")
    L.append(f"  P(drawdown >= 20%)       {s['prob_ruin_20pct']:.1%}")
    L.append(f"  max drawdown med / p95   {s['max_drawdown_median']:.1%} / {s['max_drawdown_p95']:.1%}")
    L.append(f"  Sharpe (median)          {s['sharpe_median']:.2f}")
    L.append(f"  emergency halts          {s['halted_fraction']:.1%} of paths")
    if capital:
        L.append(f"  median profit            EUR {s['median_profit']:,.0f} on EUR {capital:,.0f}")
    L.append(f"  your hours (median)      {s['labor_hours_median']:.0f} h/yr"
             f"  ->  EUR {s['eur_per_labor_hour_median']:,.2f}/hour")
    L.append(f"  tax paid / fees paid     EUR {s['tax_paid_median']:,.0f}"
             f" / EUR {s['fees_paid_median']:,.0f} (median)")
    return "\n".join(L)


def strategy_table(s: dict) -> str:
    L = ["", f"  {'strategy':<18}{'funded':>8}{'capital':>9}{'mean P&L':>11}"
             f"{'promoted':>11}",
         f"  {'':<18}{'in paths':>8}{'share':>9}{'per year':>11}{'on day':>11}",
         "  " + "-" * 57]
    rows = sorted(s["per_strategy"].items(),
                  key=lambda kv: -kv[1]["mean_pnl"])
    for name, v in rows:
        promo = (f"{v['median_promotion_day']:.0f}"
                 if v["median_promotion_day"] else "never")
        L.append(f"  {name:<18}{v['funded_fraction']:>7.0%}"
                 f"{v['mean_capital_share']:>9.1%}"
                 f"{v['mean_pnl']:>+11,.0f}{promo:>11}")
    return "\n".join(L)


def comparison_table(comparisons: list[dict]) -> str:
    L = ["", f"  {'arm':<34}{'median':>10}{'vs baseline':>14}{'p-value':>10}",
         "  " + "-" * 70]
    for c in comparisons:
        sig = " *" if c["significant_at_5pct"] else "  "
        L.append(f"  {c['a']:<34}{c['a_median_cagr']*100:>9.2f}%"
                 f"{c['delta_mean_cagr']*100:>+12.2f}pp"
                 f"{c['p_value']:>10.4f}{sig}")
    L.append("  " + "-" * 70)
    L.append("  * = difference from the baseline is significant at 5% (Welch's t-test)")
    return "\n".join(L)


def scenario_table(results: dict[str, dict], baseline_key: str = "base") -> str:
    base = results.get(baseline_key, {}).get("cagr_median", 0.0)
    lo = min(min(r["cagr_p05"] for r in results.values()), -0.05)
    hi = max(max(r["cagr_p95"] for r in results.values()), 0.05)
    L = ["", f"  {'scenario':<26}{'median':>9}{'p05':>9}{'P(loss)':>9}"
             f"{'maxDD':>8}  {'distribution':<28}",
         "  " + "-" * 76]
    for name, r in results.items():
        L.append(f"  {name:<26}{r['cagr_median']*100:>8.2f}%"
                 f"{r['cagr_p05']*100:>8.2f}%{r['prob_loss']:>9.0%}"
                 f"{r['max_drawdown_median']:>8.1%}  "
                 f"{bar(r['cagr_median'], lo, hi)}")
    return "\n".join(L)
