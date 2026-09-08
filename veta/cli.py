"""VETA command line."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .brief import write_brief
from .model import Assessment
from .pipeline import ScanConfig, scan
from .score import ScoreConfig, WinModel
from .sources.http import Http
from .store import Record

BANNER = r"""
  _   _ ___ _____ _
 | | | | __|_   _/_\     encuentra trabajo pagado,
 | |_| | _|  | |/ _ \    calcula si te van a pagar,
  \___/|___| |_/_/ \_\   y te dice cuando no vale la pena
"""


def _money(x: float) -> str:
    return f"{x:,.0f}".replace(",", ".")


def cmd_doctor(args) -> int:
    print(BANNER)
    print("ENTORNO")
    print(f"  python              {sys.version.split()[0]}")
    print(f"  dependencias        ninguna (solo libreria estandar)")
    token = args.token or os.environ.get("GITHUB_TOKEN", "")
    print(f"  GITHUB_TOKEN        {'presente' if token else 'AUSENTE'}"
          f"  ({'30' if token else '10'} busquedas/minuto)")
    rec = Record(args.record)
    print(f"  tu historial        {rec.path}  ({len(rec.attempts)} intentos)")

    print("\nCONECTIVIDAD")
    http = Http(min_interval_s=0.5, token=token)
    checks = [
        ("GitHub API", "https://api.github.com/rate_limit"),
        ("Algora API", "https://api.algora.io/api/orgs/algora/bounties?limit=1"),
    ]
    for name, url in checks:
        try:
            data = http.get_json(url)
            extra = ""
            if "rate_limit" in url:
                core = (data or {}).get("resources", {}).get("search", {})
                extra = f" (busqueda: {core.get('remaining','?')}/{core.get('limit','?')})"
            print(f"  [OK]   {name}{extra}")
        except Exception as exc:                            # noqa: BLE001
            print(f"  [FALLA] {name}")
            print(f"          {str(exc)[:110]}")

    print("\n  Si Algora falla, ejecuta 'veta probe algora' para ver el JSON real")
    print("  y ajustar el mapeo en veta/sources/algora.py::_pick.")
    return 0


def cmd_probe(args) -> int:
    from .sources import algora
    http = Http(min_interval_s=0.5)
    try:
        data = algora.probe(http, args.org)
    except Exception as exc:                                # noqa: BLE001
        print(f"no se pudo leer: {exc}")
        return 1
    print(json.dumps(data, indent=2)[:6000])
    return 0


def _print_table(rows: list[Assessment], limit: int) -> None:
    print(f"\n  {'#':<3}{'EUR/h':>7}{'pago':>9}{'horas':>8}{'P(cobro)':>10}  "
          f"{'repo':<26}{'titulo'}")
    print("  " + "-" * 108)
    for i, a in enumerate(rows[:limit], 1):
        b = a.bounty
        mark = " " if a.verdict.startswith("ATTEMPT") else "x"
        print(f"  {mark}{i:<2}{a.ev_per_hour:>7.0f}{b.amount_eur():>9.0f}"
              f"{a.hours_estimate:>8.1f}{a.p_win:>10.0%}  "
              f"{(b.repo or '-')[:25]:<26}{b.title[:44]}")
    print("  " + "-" * 108)
    print("  'x' = por debajo de tu suelo. Ejecuta 'veta brief <n>' para el encargo.")


def cmd_scan(args) -> int:
    print(BANNER)
    rec = Record(args.record)
    model = WinModel(skill=rec.skill())
    cfg = ScanConfig(
        sources=tuple(args.sources.split(",")),
        manual_file=args.manual or "",
        algora_orgs=tuple(a for a in (args.orgs or "").split(",") if a),
        deep_check=args.deep,
        min_amount_eur=args.min_amount,
        token=args.token or os.environ.get("GITHUB_TOKEN", ""),
    )
    score_cfg = ScoreConfig(min_ev_per_hour=args.floor, max_hours=args.max_hours)

    def progress(msg: str) -> None:
        print(f"  ... {msg}")

    results = scan(cfg, model, score_cfg, progress=progress)
    errors = getattr(scan, "errors", [])
    if not results:
        if errors:
            print("\n  NO es que no haya trabajo: las fuentes fallaron.")
            for e in errors:
                print(f"    - {e}")
            print("\n  Ejecuta 'veta doctor' para diagnosticar.")
        else:
            print("\n  Nada encontrado con estos filtros. Prueba a bajar "
                  "--min-amount o subir --limit.")
        return 1

    s = rec.stats()
    print(f"\n  Tu historial: {s['attempts']} intentos, {s['won']} cobrados "
          f"({s['skill']['win_rate']:.0%} posterior), {s['eur_per_hour']:.1f} EUR/h reales")
    _print_table(results, args.limit)

    Path(args.cache).write_text(json.dumps(
        [a.as_dict() for a in results[:args.limit]], indent=2), encoding="utf-8")
    print(f"  guardado en {args.cache}")
    return 0


def cmd_brief(args) -> int:
    data = json.loads(Path(args.cache).read_text(encoding="utf-8"))
    if not 1 <= args.n <= len(data):
        print(f"elige entre 1 y {len(data)}")
        return 1
    row = data[args.n - 1]

    from .model import Bounty, RepoHealth, parse_ts
    bd = row["bounty"]
    b = Bounty(source=bd["source"], id=bd["id"], title=bd["title"], url=bd["url"],
               amount=bd["amount"], currency=bd["currency"], repo=bd["repo"],
               labels=tuple(bd["labels"]), body=bd["body"],
               created_at=parse_ts(bd["created_at"]),
               updated_at=parse_ts(bd["updated_at"]),
               comments=bd["comments"], assignee=bd["assignee"],
               claimants=tuple(bd["claimants"]), state=bd["state"])
    h = None
    if row.get("health"):
        hd = dict(row["health"])
        hd.pop("outside_merge_rate", None)
        h = RepoHealth(**hd)
    a = Assessment(bounty=b, health=h, p_win=row["p_win"],
                   hours_estimate=row["hours"][1], hours_low=row["hours"][0],
                   hours_high=row["hours"][2], ev_eur=row["ev_eur"],
                   ev_per_hour=row["ev_per_hour"],
                   downside_hours=row["downside_hours"],
                   reasons=row["reasons"], warnings=row["warnings"],
                   verdict=row["verdict"])

    rec = Record(args.record)
    st = rec.stats()
    note = (f"Your record so far: {st['won']} of {st['attempts']} attempts paid, "
            f"{st['eur_per_hour']:.0f} EUR/hour realised."
            if st["attempts"] else
            "You have no recorded attempts yet, so P(win) above is a prior, "
            "not a measurement. Record the outcome of this one either way.")
    text = write_brief(a, note)

    out = Path(args.out or f"brief-{args.n}.md")
    out.write_text(text, encoding="utf-8")
    if args.start:
        rec.start(a)
        print(f"anotado como en curso: {b.key()}")
    print(text if args.stdout else f"escrito {out}\n\n  Pasaselo a Claude Code:\n"
          f"    claude \"lee {out} y haz el trabajo, respetando el limite de horas\"")
    return 0


def cmd_record(args) -> int:
    rec = Record(args.record)
    if args.list:
        for a in rec.attempts:
            print(f"  {a.outcome:12s} {a.key:22s} {a.hours_spent:5.1f}h "
                  f"{a.paid_eur:7.0f} EUR  {a.title[:40]}")
        s = rec.stats()
        print(f"\n  {s['attempts']} cerrados, {s['won']} cobrados "
              f"({s['win_rate']:.0%}), {s['hours_spent']:.0f}h, "
              f"{_money(s['earned_eur'])} EUR -> {s['eur_per_hour']:.1f} EUR/h")
        if s["median_estimate_ratio"]:
            r = s["median_estimate_ratio"]
            verb = "se quedan cortas" if r > 1 else "van sobradas"
            print(f"  tus estimaciones {verb}: gastas x{r:.2f} lo estimado")
        return 0
    if not args.key:
        print("indica --key <source:id> o usa --list")
        return 1
    a = rec.finish(args.key, args.outcome, args.hours, args.paid, args.note)
    if a is None:
        print(f"no encuentro {args.key}; usa --list para ver las claves")
        return 1
    print(f"anotado: {a.key} -> {a.outcome}, {a.hours_spent}h, {a.paid_eur} EUR")
    print(f"  tu tasa de acierto ahora: {rec.skill().mean:.0%}")
    return 0


def cmd_verify(args) -> int:
    from .sim.verify import run
    run(seasons=args.seasons)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="veta",
        description="Encuentra trabajo pagado y calcula si te van a pagar.")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("--record", default=None, help="fichero de tu historial")
        sp.add_argument("--token", default="", help="token de GitHub (o GITHUB_TOKEN)")

    sp = sub.add_parser("doctor", help="comprueba red, token e historial")
    common(sp); sp.set_defaults(func=cmd_doctor)

    sp = sub.add_parser("probe", help="enseña el JSON crudo de una fuente")
    sp.add_argument("source", nargs="?", default="algora")
    sp.add_argument("--org", default="algora")
    sp.set_defaults(func=cmd_probe)

    sp = sub.add_parser("scan", help="busca y ordena por EUR/hora esperados")
    common(sp)
    sp.add_argument("--sources", default="github,algora")
    sp.add_argument("--orgs", default="", help="orgs de Algora, separadas por comas")
    sp.add_argument("--manual", default="", help="fichero JSON con tus propias pistas")
    sp.add_argument("--limit", type=int, default=20)
    sp.add_argument("--deep", type=int, default=12, help="cuantas comprobar a fondo")
    sp.add_argument("--floor", type=float, default=12.0, help="EUR/h minimo")
    sp.add_argument("--max-hours", type=float, default=25.0)
    sp.add_argument("--min-amount", type=float, default=40.0)
    sp.add_argument("--cache", default="veta-scan.json")
    sp.set_defaults(func=cmd_scan)

    sp = sub.add_parser("brief", help="genera el encargo para el agente")
    common(sp)
    sp.add_argument("n", type=int, help="numero de la lista del scan")
    sp.add_argument("--cache", default="veta-scan.json")
    sp.add_argument("--out", default="")
    sp.add_argument("--stdout", action="store_true")
    sp.add_argument("--start", action="store_true", help="anotar como en curso")
    sp.set_defaults(func=cmd_brief)

    sp = sub.add_parser("record", help="anota como acabo un intento")
    common(sp)
    sp.add_argument("--key", default="")
    sp.add_argument("--outcome", default="lost",
                    choices=["won", "lost", "abandoned", "skipped"])
    sp.add_argument("--hours", type=float, default=0.0)
    sp.add_argument("--paid", type=float, default=0.0)
    sp.add_argument("--note", default="")
    sp.add_argument("--list", action="store_true")
    sp.set_defaults(func=cmd_record)

    sp = sub.add_parser("verify", help="demuestra que el ranking sirve")
    sp.add_argument("--seasons", type=int, default=40)
    sp.set_defaults(func=cmd_verify)
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("\ninterrumpido")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
