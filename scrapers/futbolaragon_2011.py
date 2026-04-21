"""
Scrape rosters from 10 groups on futbolaragon.com (PNFG portal),
filter to players born in 2011, and write JSON/CSV summaries.

Install once:
    pip install requests beautifulsoup4 lxml curl_cffi

Run:
    python futbolaragon_2011.py
"""

from __future__ import annotations

import csv
import json
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass, asdict
from pathlib import Path

from bs4 import BeautifulSoup
from curl_cffi import requests as cr

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE = "https://www.futbolaragon.com/pnfg/NPcd/"
COD_PRIMARIA_JORNADA = "1000120"
COD_PRIMARIA_EQUIPO  = "1000119"
COD_COMPETICION      = "22320220"
COD_TEMPORADA        = "21"
COD_JORNADA          = "14"

GROUPS = [{"name": f"Grupo {i+1}", "grupo": str(22621506 + i)} for i in range(10)]

OUT_DIR     = Path(__file__).resolve().parent / "data"
OUT_JSON    = OUT_DIR / "futbolaragon_2011.json"
OUT_CSV     = OUT_DIR / "futbolaragon_2011.csv"
OUT_2011_J  = OUT_DIR / "players_born_2011.json"
OUT_2011_C  = OUT_DIR / "players_born_2011.csv"
OUT_SUMMARY = OUT_DIR / "team_summary_2011.csv"

REQUEST_DELAY = 0.6
MAX_RETRIES   = 5
BACKOFF       = 2.0
IMPERSONATE   = "chrome120"

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Player:
    grupo_name: str
    grupo_code: str
    team_name: str
    team_code: str
    dorsal: str
    name: str
    position: str
    cod_participante: str
    extra: str

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def make_session() -> cr.Session:
    s = cr.Session(impersonate=IMPERSONATE)
    s.headers.update({
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    })
    for _ in range(3):
        try:
            r = s.get("https://www.futbolaragon.com/", timeout=20)
            if r.text:
                break
        except Exception as exc:
            print(f"[warn] homepage warmup failed: {exc}", file=sys.stderr)
        time.sleep(1.0)
    return s

def fetch_html(session: cr.Session, url: str, referer: str | None = None) -> str:
    headers = {"Referer": referer} if referer else {}
    delay = BACKOFF
    last_status: int | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = session.get(url, headers=headers, timeout=30)
            last_status = r.status_code
            r.encoding = "ISO-8859-15"
            if r.status_code == 200 and r.text:
                return r.text
            if r.status_code != 200:
                print(f"  [retry {attempt}] HTTP {r.status_code}", file=sys.stderr)
        except Exception as exc:
            print(f"  [retry {attempt}] {exc}", file=sys.stderr)
        time.sleep(delay)
        delay *= 1.7
    raise RuntimeError(
        f"Empty response from {url} after {MAX_RETRIES} retries (last status {last_status})."
    )

# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

TEAM_LINK_RE   = re.compile(r"NFG_VisEquipos[^\"']*Codigo_Equipo=(\d+)", re.IGNORECASE)
PARTICIPANTE_RE = re.compile(r"NFG_EQ_VisSanciones_jugador\(\s*(\d+)", re.IGNORECASE)
YEAR_2011_RE   = re.compile(
    r"(?:\b\d{1,2}[/-]\d{1,2}[/-]2011\b)|(?:\b2011[/-]\d{1,2}[/-]\d{1,2}\b)"
)

def extract_teams(html: str) -> list[tuple[str, str]]:
    soup = BeautifulSoup(html, "lxml")
    teams: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        m = TEAM_LINK_RE.search(a["href"])
        if not m:
            continue
        code = m.group(1)
        name = a.get_text(" ", strip=True)
        if not name or name.isdigit():
            continue
        teams.setdefault(code, name)
    return [(name, code) for code, name in teams.items()]

def extract_players(html: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "lxml")
    players: list[dict[str, str]] = []
    for tr in soup.find_all("tr"):
        m = PARTICIPANTE_RE.search(str(tr))
        if not m:
            continue
        cod_part = m.group(1)
        cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
        cells = [c for c in cells if c]
        if not cells:
            continue

        dorsal = next((c for c in cells if re.fullmatch(r"\d{1,2}", c)), "")
        name_candidates = [c for c in cells if c != dorsal and len(c) >= 3]
        name = max(name_candidates, key=len) if name_candidates else ""

        position = ""
        for c in cells:
            if c in {dorsal, name}:
                continue
            if 3 <= len(c) <= 20 and re.match(r"^[A-Za-zÁÉÍÓÚÑáéíóúñ\.\-/ ]+$", c):
                position = c
                break

        extras = [c for c in cells if c not in {dorsal, name, position}]
        players.append({
            "dorsal": dorsal,
            "name": name,
            "position": position,
            "cod_participante": cod_part,
            "extra": " | ".join(extras),
        })
    return players

# ---------------------------------------------------------------------------
# URLs
# ---------------------------------------------------------------------------

def jornada_url(grupo: str) -> str:
    return (f"{BASE}NFG_CmpJornada"
            f"?cod_primaria={COD_PRIMARIA_JORNADA}"
            f"&CodCompeticion={COD_COMPETICION}"
            f"&CodGrupo={grupo}"
            f"&CodTemporada={COD_TEMPORADA}"
            f"&CodJornada={COD_JORNADA}")

def team_url(team_code: str) -> str:
    return (f"{BASE}NFG_VisEquipos"
            f"?cod_primaria={COD_PRIMARIA_EQUIPO}"
            f"&Codigo_Equipo={team_code}")

# ---------------------------------------------------------------------------
# Scrape + save
# ---------------------------------------------------------------------------

def scrape() -> list[Player]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    session = make_session()
    all_players: list[Player] = []

    for g in GROUPS:
        gname, gcode = g["name"], g["grupo"]
        print(f"\n=== {gname} (CodGrupo={gcode}) ===")
        try:
            html = fetch_html(session, jornada_url(gcode))
        except Exception as exc:
            print(f"  [skip] could not fetch group page: {exc}", file=sys.stderr)
            continue

        teams = extract_teams(html)
        print(f"  found {len(teams)} teams")

        for team_name, team_code in teams:
            time.sleep(REQUEST_DELAY)
            try:
                team_html = fetch_html(session, team_url(team_code), referer=jornada_url(gcode))
            except Exception as exc:
                print(f"  [skip] team {team_name}: {exc}", file=sys.stderr)
                continue
            players = extract_players(team_html)
            print(f"    {team_name}: {len(players)} players")
            for p in players:
                all_players.append(Player(
                    grupo_name=gname, grupo_code=gcode,
                    team_name=team_name, team_code=team_code,
                    dorsal=p["dorsal"], name=p["name"], position=p["position"],
                    cod_participante=p["cod_participante"], extra=p["extra"],
                ))
    return all_players

def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

def is_born_2011(row: dict) -> bool:
    return any(YEAR_2011_RE.search(str(v)) for v in row.values() if v)

def save_all(players: list[Player]) -> None:
    rows = [asdict(p) for p in players]
    OUT_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(OUT_CSV, rows)
    print(f"\nWrote {len(rows)} players → {OUT_JSON.name}, {OUT_CSV.name}")

    matched = [r for r in rows if is_born_2011(r)]
    OUT_2011_J.write_text(json.dumps(matched, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(OUT_2011_C, matched)
    print(f"Born in 2011: {len(matched)} → {OUT_2011_J.name}, {OUT_2011_C.name}")

    if matched:
        counts = Counter((r["grupo_name"], r["team_name"]) for r in matched)
        with OUT_SUMMARY.open("w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["grupo", "team_name", "players_born_2011"])
            for (grupo, team), n in sorted(counts.items(), key=lambda x: (-x[1], x[0])):
                w.writerow([grupo, team, n])
        print(f"Per-team summary ({len(counts)} teams) → {OUT_SUMMARY.name}")

def main() -> int:
    players = scrape()
    save_all(players)
    return 0 if players else 1

if __name__ == "__main__":
    sys.exit(main())
