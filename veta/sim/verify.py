"""Does the ranking earn its keep?

VETA makes one testable claim: that scoring a bounty by payout times the
probability of actually being paid, divided by the hours it will take, beats
the ways people normally choose. This runs that claim against the
alternatives on identical markets and reports the answer, including when the
answer is "barely".
"""
from __future__ import annotations

import statistics as st
import time
from dataclasses import replace

from moneta.core.stats import percentile, welch_t_test

from .hunter import HunterConfig, POLICIES, run_season
from .market import MarketConfig


def compare(seasons: int = 40, weekly_hours: float = 20.0,
            skill_multiplier: float = 1.0, out=print) -> dict:
    hcfg = HunterConfig(weekly_hours=weekly_hours,
                        skill_multiplier=skill_multiplier)
    results: dict[str, list] = {}

    arms = [("veta (EV con salud del repo)", False, "veta"),
            ("pago / horas estimadas", True, "pago / horas estimadas"),
            ("mayor pago primero", True, "mayor pago primero"),
            ("la mas reciente", True, "la mas reciente"),
            ("al azar", True, "al azar")]

    for policy, floor, label in arms:
        rs = [run_season(policy, seed, hunter_cfg=hcfg, use_ev_floor=floor)
              for seed in range(seasons)]
        results[label] = rs

    base = results["veta"]
    rows = []
    for label, rs in results.items():
        rates = [r.eur_per_hour for r in rs]
        earned = [r.earned for r in rs]
        t, df, p = welch_t_test([r.eur_per_hour for r in base], rates)
        rows.append({
            "policy": label,
            "eur_per_hour_median": st.median(rates),
            "eur_per_hour_mean": st.mean(rates),
            "earned_median": st.median(earned),
            "hours_median": st.median([r.hours_spent for r in rs]),
            "win_rate": st.mean([r.win_rate for r in rs]),
            "attempts": st.mean([r.attempts for r in rs]),
            "repo_refused": st.mean([r.repo_refused for r in rs]),
            "sniped": st.mean([r.sniped for r in rs]),
            "bailed": st.mean([r.bailed for r in rs]),
            "wasted_share": st.mean([r.hours_wasted / max(r.hours_spent, 1)
                                     for r in rs]),
            "p_vs_veta": p if label != "veta" else None,
        })
    rows.sort(key=lambda r: -r["eur_per_hour_median"])

    out(f"\n{'politica':26s}{'EUR/h':>8}{'ganado':>9}{'aciertos':>10}"
        f"{'repo no paga':>14}{'h. tiradas':>12}{'p vs veta':>11}")
    out("-" * 90)
    for r in rows:
        p = "" if r["p_vs_veta"] is None else (
            f"{r['p_vs_veta']:.4f}" + (" *" if r["p_vs_veta"] < 0.05 else ""))
        out(f"{r['policy']:26s}{r['eur_per_hour_median']:>8.1f}"
            f"{r['earned_median']:>9.0f}{r['win_rate']:>10.0%}"
            f"{r['repo_refused']:>14.1f}{r['wasted_share']:>12.0%}{p:>11}")
    out("-" * 90)
    out("  * = diferencia significativa al 5% (test de Welch), "
        f"{seasons} temporadas de 26 semanas")
    return {"rows": rows, "seasons": seasons}


def falsification(seasons: int = 24, out=print) -> dict:
    """A market where most projects never merge outside work.

    If the repo-health signal does anything at all, this is where it shows:
    the policies that ignore it should collapse, and the one that reads it
    should degrade far less.
    """
    hostile = MarketConfig(repo_pays_alpha=0.6, repo_pays_beta=2.2)
    normal = MarketConfig()
    out(f"\n{'politica':26s}{'normal':>10}{'hostil':>10}{'caida':>10}")
    out("-" * 56)
    verdict = {}
    for policy, floor, label in [("veta (EV con salud del repo)", False, "veta"),
                                 ("pago / horas estimadas", True, "pago / horas"),
                                 ("mayor pago primero", True, "mayor pago")]:
        a = st.median([run_season(policy, s, market_cfg=normal,
                                  use_ev_floor=floor).eur_per_hour
                       for s in range(seasons)])
        b = st.median([run_season(policy, s, market_cfg=hostile,
                                  use_ev_floor=floor).eur_per_hour
                       for s in range(seasons)])
        drop = (a - b) / a if a > 0 else 0.0
        verdict[label] = {"normal": a, "hostile": b, "drop": drop}
        out(f"{label:26s}{a:>10.1f}{b:>10.1f}{drop:>9.0%}")
    return verdict


def run(seasons: int = 40, out=print) -> dict:
    t0 = time.time()
    out("=" * 90)
    out("VETA -- verificacion de la politica de seleccion")
    out("=" * 90)
    out("""
  Mismo mercado, mismas horas, misma habilidad, misma regla de abandono para
  todas las politicas. Lo unico que cambia es cual eliges. Cada bounty tiene
  una verdad oculta (horas reales, si el repo paga de verdad, cuanta gente va
  a por ella) y el cazador solo ve una sombra ruidosa de esa verdad.""")
    main = compare(seasons=seasons, out=out)

    out("\n" + "=" * 90)
    out("FALSACION -- un mercado donde casi nadie fusiona trabajo de fuera")
    out("=" * 90)
    hostile = falsification(seasons=max(16, seasons // 2), out=out)

    best = main["rows"][0]
    veta = next(r for r in main["rows"] if r["policy"] == "veta")
    naive = next(r for r in main["rows"] if r["policy"] == "pago / horas estimadas")
    payout = next(r for r in main["rows"] if r["policy"] == "mayor pago primero")

    out("\n" + "=" * 90)
    out("VEREDICTO")
    out("=" * 90)
    checks = []
    checks.append(("el ranking por valor esperado es el mejor",
                   best["policy"] == "veta",
                   f"mejor politica: {best['policy']} "
                   f"({best['eur_per_hour_median']:.1f} EUR/h)"))
    checks.append(("bate a 'coge la de mayor pago', que es lo que hace la gente",
                   veta["eur_per_hour_median"] > payout["eur_per_hour_median"] * 1.5,
                   f"{veta['eur_per_hour_median']:.1f} vs "
                   f"{payout['eur_per_hour_median']:.1f} EUR/h "
                   f"(x{veta['eur_per_hour_median']/max(payout['eur_per_hour_median'],0.01):.1f})"))
    checks.append(("bate al ranking ingenuo pago/horas",
                   veta["eur_per_hour_median"] > naive["eur_per_hour_median"],
                   f"{veta['eur_per_hour_median']:.1f} vs "
                   f"{naive['eur_per_hour_median']:.1f} EUR/h; "
                   f"p={naive['p_vs_veta']:.4f}"))
    checks.append(("evita mas repos que no pagan",
                   veta["repo_refused"] < naive["repo_refused"],
                   f"{veta['repo_refused']:.1f} vs {naive['repo_refused']:.1f} "
                   f"parches perdidos por repos que no fusionan"))
    checks.append(("aguanta mejor un mercado hostil",
                   hostile["veta"]["drop"] < hostile["pago / horas"]["drop"],
                   f"cae {hostile['veta']['drop']:.0%} frente a "
                   f"{hostile['pago / horas']['drop']:.0%} del ingenuo"))

    for name, ok, detail in checks:
        out(f"  [{'PASA' if ok else 'FALLA'}]  {name}")
        out(f"           {detail}")
    passed = sum(1 for _, ok, _ in checks if ok)
    out(f"\n  {passed}/{len(checks)} comprobaciones en {time.time()-t0:.0f}s")
    return {"main": main, "hostile": hostile,
            "checks": [{"name": n, "passed": ok, "detail": d}
                       for n, ok, d in checks],
            "all_passed": passed == len(checks)}
