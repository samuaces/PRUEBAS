"""A single-file local dashboard.

No build step, no CDN, no framework, no network. `build()` renders one
self-contained HTML file you can open with a double click; `serve()` hosts it
on localhost if you would rather have a URL.
"""
from __future__ import annotations

import html
import http.server
import json
import os
import socketserver
import webbrowser
from pathlib import Path

from ..core.stats import percentile


# --------------------------------------------------------------------------
# Tiny inline SVG charting (no dependencies, theme-aware via currentColor)
# --------------------------------------------------------------------------

def _sparkline(values: list[float], width: int = 720, height: int = 200,
               marker_index: int | None = None) -> str:
    if len(values) < 2:
        return "<svg></svg>"
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        hi = lo + 1.0
    pad = 28
    w, h = width - 2 * pad, height - 2 * pad

    def xy(i, v):
        x = pad + w * i / (len(values) - 1)
        y = pad + h * (1 - (v - lo) / (hi - lo))
        return x, y

    pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in
                   (xy(i, v) for i, v in enumerate(values)))
    area = (f"{pad},{pad+h} " + pts + f" {pad+w},{pad+h}")
    marker = ""
    if marker_index is not None and 0 <= marker_index < len(values):
        mx, _ = xy(marker_index, values[marker_index])
        marker = (f'<line x1="{mx:.1f}" y1="{pad}" x2="{mx:.1f}" y2="{pad+h}" '
                  f'class="marker"/>'
                  f'<text x="{mx+6:.1f}" y="{pad+14}" class="markerlab">'
                  f'real money starts here</text>')
    return f'''<svg viewBox="0 0 {width} {height}" class="chart" role="img"
     aria-label="equity over time">
  <polygon points="{area}" class="area"/>
  <polyline points="{pts}" class="line"/>
  {marker}
  <text x="{pad}" y="{pad-10}" class="axis">{hi:,.0f}</text>
  <text x="{pad}" y="{height-6}" class="axis">{lo:,.0f}</text>
</svg>'''


def _histogram(values: list[float], bins: int = 26, width: int = 720,
               height: int = 200) -> str:
    if not values:
        return "<svg></svg>"
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        hi = lo + 0.01
    counts = [0] * bins
    for v in values:
        idx = min(bins - 1, int((v - lo) / (hi - lo) * bins))
        counts[idx] += 1
    top = max(counts) or 1
    pad = 28
    w, h = width - 2 * pad, height - 2 * pad
    bw = w / bins
    bars = []
    for i, c in enumerate(counts):
        bh = h * c / top
        x = pad + i * bw
        y = pad + h - bh
        centre = lo + (i + 0.5) * (hi - lo) / bins
        cls = "bar neg" if centre < 0 else "bar pos"
        bars.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw*0.86:.1f}" '
                    f'height="{bh:.1f}" class="{cls}"/>')
    zero = ""
    if lo < 0 < hi:
        zx = pad + w * (0 - lo) / (hi - lo)
        zero = (f'<line x1="{zx:.1f}" y1="{pad}" x2="{zx:.1f}" y2="{pad+h}" '
                f'class="marker"/>')
    return f'''<svg viewBox="0 0 {width} {height}" class="chart" role="img"
     aria-label="distribution of annual returns">
  {''.join(bars)}
  {zero}
  <text x="{pad}" y="{height-6}" class="axis">{lo*100:.1f}%</text>
  <text x="{width-pad-40}" y="{height-6}" class="axis">{hi*100:.1f}%</text>
</svg>'''


# --------------------------------------------------------------------------

CSS = """
:root{--bg:#faf9f7;--fg:#1c1b19;--muted:#6b6862;--card:#ffffff;--line:#e4e1db;
  --pos:#2f7d55;--neg:#b3402f;--accent:#3c5a99;--warn:#8a6a1f}
:root:not([data-theme="light"]){}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#16150f;--fg:#eae7df;--muted:#9c968a;--card:#1f1e17;--line:#33312a;
  --pos:#63b98a;--neg:#e07a63;--accent:#8fa8de;--warn:#d0aa54}}
:root[data-theme="dark"]{--bg:#16150f;--fg:#eae7df;--muted:#9c968a;--card:#1f1e17;
  --line:#33312a;--pos:#63b98a;--neg:#e07a63;--accent:#8fa8de;--warn:#d0aa54}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);margin:0;padding:0 20px 64px;
  font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1040px;margin:0 auto}
header{padding:44px 0 20px;border-bottom:1px solid var(--line);margin-bottom:26px}
h1{font-size:30px;margin:0 0 6px;letter-spacing:-.02em}
h2{font-size:17px;margin:34px 0 12px;letter-spacing:-.01em}
.sub{color:var(--muted);margin:0;font-size:14px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(168px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;
  padding:14px 16px}
.k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.v{font-size:25px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums}
.v.pos{color:var(--pos)} .v.neg{color:var(--neg)}
.note{color:var(--muted);font-size:12px;margin-top:3px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{text-align:right;font-size:12px;color:var(--muted);font-weight:600;
  padding:8px 10px;border-bottom:1px solid var(--line);text-transform:uppercase;
  letter-spacing:.05em}
th:first-child,td:first-child{text-align:left}
td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:right}
tbody tr:last-child td{border-bottom:none}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;
  font-weight:600;letter-spacing:.03em}
.tag.live{background:color-mix(in srgb,var(--pos) 18%,transparent);color:var(--pos)}
.tag.paper{background:color-mix(in srgb,var(--muted) 18%,transparent);color:var(--muted)}
.tag.retired{background:color-mix(in srgb,var(--neg) 18%,transparent);color:var(--neg)}
.tag.probation{background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--warn)}
.scroll{overflow-x:auto}
.chart{width:100%;height:auto;display:block}
.chart .line{fill:none;stroke:var(--accent);stroke-width:2}
.chart .area{fill:color-mix(in srgb,var(--accent) 12%,transparent);stroke:none}
.chart .bar.pos{fill:var(--pos);opacity:.8}
.chart .bar.neg{fill:var(--neg);opacity:.8}
.chart .marker{stroke:var(--muted);stroke-width:1;stroke-dasharray:3 3}
.chart .axis,.chart .markerlab{fill:var(--muted);font-size:11px}
.warn{background:color-mix(in srgb,var(--warn) 12%,transparent);
  border:1px solid color-mix(in srgb,var(--warn) 35%,transparent);
  border-radius:10px;padding:14px 16px;margin:26px 0;font-size:14px}
.warn strong{color:var(--warn)}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);
  color:var(--muted);font-size:12px}
code{background:color-mix(in srgb,var(--muted) 14%,transparent);
  padding:1px 5px;border-radius:4px;font-size:12.5px}
"""


def _fmt_pct(x, places=2):
    return f"{x*100:+.{places}f}%"


def build(summary: dict, detail, cfg, output: str = "moneta_dashboard.html") -> str:
    cagrs = summary.get("_cagrs", [])
    curve = detail.equity_curve
    marker = None
    for i, t in enumerate(detail.times):
        if t / 24.0 >= cfg.warmup_days:
            marker = i
            break

    cagr = summary["cagr_median"]
    cls = "pos" if cagr > 0 else "neg"
    cards = [
        ("median annual return", _fmt_pct(cagr), cls,
         f"5th pct {_fmt_pct(summary['cagr_p05'])} · 95th {_fmt_pct(summary['cagr_p95'])}"),
        ("median profit", f"€{summary['median_profit']:,.0f}",
         "pos" if summary['median_profit'] > 0 else "neg",
         f"on €{cfg.capital:,.0f} of capital"),
        ("probability of a loss", f"{summary['prob_loss']:.0%}", "",
         f"P(drawdown ≥20%) = {summary['prob_ruin_20pct']:.1%}"),
        ("worst 5% of years", _fmt_pct(summary['cvar05_cagr']),
         "neg" if summary['cvar05_cagr'] < 0 else "pos", "average of the bad tail"),
        ("€ per hour of your time", f"€{summary['eur_per_labor_hour_median']:,.0f}", "",
         f"{summary['labor_hours_median']:.0f} hours a year"),
        ("max drawdown", f"{summary['max_drawdown_median']:.1%}", "",
         f"95th percentile {summary['max_drawdown_p95']:.1%}"),
    ]
    card_html = "".join(
        f'<div class="card"><div class="k">{html.escape(k)}</div>'
        f'<div class="v {c}">{html.escape(v)}</div>'
        f'<div class="note">{html.escape(n)}</div></div>'
        for k, v, c, n in cards)

    rows = []
    for r in detail.strategy_rows:
        phase = r["phase"]
        promo = (f"day {r['promoted_at_days']:.0f}"
                 if r["promoted_at_days"] else "—")
        pnl = detail.pnl_by_strategy.get(r["strategy"], 0.0)
        rows.append(
            f"<tr><td>{html.escape(r['strategy'])}</td>"
            f'<td><span class="tag {phase}">{phase}</span></td>'
            f"<td>{r['n']:,}</td>"
            f"<td>{r['mu_per_tick']*1095*100:+.2f}%</td>"
            f"<td>{r['lb_total']*1095*100:+.2f}%</td>"
            f"<td>{r['lb_cash']*1095*100:+.2f}%</td>"
            f"<td>{promo}</td>"
            f"<td>&euro;{pnl:,.0f}</td></tr>")

    def _promo(v):
        d = v["median_promotion_day"]
        return f"day {d:.0f}" if d else "never"

    per_strategy_rows = "".join(
        f"<tr><td>{html.escape(n)}</td>"
        f"<td>{v['funded_fraction']:.0%}</td>"
        f"<td>{v['mean_capital_share']:.1%}</td>"
        f"<td>&euro;{v['mean_pnl']:,.0f}</td>"
        f"<td>{_promo(v)}</td></tr>"
        for n, v in sorted(summary["per_strategy"].items(),
                           key=lambda kv: -kv[1]["mean_pnl"]))

    doc = f"""<title>MONETA Dashboard</title>
<style>{CSS}</style>
<div class="wrap">
<header>
  <h1>MONETA</h1>
  <p class="sub">{cfg.paths} simulated histories · €{cfg.capital:,.0f} ·
     {cfg.friction_preset} friction preset · {cfg.live_days} live days after
     {cfg.warmup_days:.0f} days of paper validation ·
     {cfg.labor_hours_per_week:.0f} h/week of your time</p>
</header>

<div class="grid">{card_html}</div>

<h2>One representative account, day by day</h2>
{_sparkline(curve, marker_index=marker)}
<p class="note">Flat until the promotion gate is satisfied. That flat stretch is
the product working, not failing — it is the period in which nothing is risked
because nothing has been proven.</p>

<h2>Distribution of annual returns across {len(cagrs)} histories</h2>
{_histogram(cagrs)}

<h2>Strategies in this representative run</h2>
<div class="scroll"><table>
<thead><tr><th>strategy</th><th>phase</th><th>obs</th><th>measured edge</th>
<th>LB (total)</th><th>LB (cash)</th><th>promoted</th><th>P&amp;L</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></div>
<p class="note">“LB” is the anytime-valid lower confidence bound on the true edge,
annualised. A strategy is funded only when one of them clears zero — a threshold
that a zero-edge strategy crosses at most 10% of the time no matter how often
it is checked.</p>

<h2>Across all {cfg.paths} histories</h2>
<div class="scroll"><table>
<thead><tr><th>strategy</th><th>funded in</th><th>capital share</th>
<th>mean P&amp;L</th><th>median promotion</th></tr></thead>
<tbody>{per_strategy_rows}</tbody></table></div>

<div class="warn">
<strong>What this is not.</strong> These are outcomes under a model, not a
forecast and not a promise. The model's assumptions live in
<code>moneta/sim/market.py</code> and are written to be argued with. Real
markets contain risks this model does not: regulatory change, your own
mistakes, a counterparty that fails in a way nobody priced. Nothing here is
financial advice.
</div>

<footer>Generated by MONETA · pure Python standard library · no data left this machine.</footer>
</div>"""
    Path(output).write_text(doc, encoding="utf-8")
    return os.path.abspath(output)


def serve(path: str, port: int = 8765) -> None:
    directory = os.path.dirname(path) or "."
    name = os.path.basename(path)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=directory, **kw)

        def log_message(self, *a):
            pass

    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        url = f"http://127.0.0.1:{port}/{name}"
        print(f"  serving {url}  (ctrl-c to stop)")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  stopped")
