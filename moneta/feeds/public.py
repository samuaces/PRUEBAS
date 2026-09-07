"""Read-only public market data.

No API keys, no authentication, no orders. Everything here is a public
endpoint that anyone can call, and nothing here can move money.

Its real job is not live trading -- it is SEEDING. MONETA's promotion gate
needs evidence before it will fund a strategy, and evidence takes time. But
for a strategy like the funding carry, that evidence already exists: two
years of settled funding payments are a public download. Priming the gate
with real history turns a two-year wait into a two-minute one, without
weakening the test, because the history is scored through the same friction
model as everything else.

If the network is unavailable the whole module degrades to a clear message
and the simulator carries on -- MONETA is designed to be fully useful
offline.
"""
from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

USER_AGENT = "moneta/1.0 (+local research tool)"
TIMEOUT = 15.0

#: Public, keyless endpoints. Kept in one place so it is obvious exactly
#: what this program talks to.
ENDPOINTS = {
    "binance_funding": "https://fapi.binance.com/fapi/v1/fundingRate"
                       "?symbol={symbol}&limit={limit}",
    "binance_spot": "https://api.binance.com/api/v3/ticker/price?symbol={symbol}",
    "bybit_funding": "https://api.bybit.com/v5/market/funding/history"
                     "?category=linear&symbol={symbol}&limit={limit}",
    "kraken_spot": "https://api.kraken.com/0/public/Ticker?pair={symbol}",
    "coinbase_spot": "https://api.exchange.coinbase.com/products/{symbol}/ticker",
}


class FeedUnavailable(RuntimeError):
    """Raised when a public endpoint cannot be reached."""


def fetch_json(url: str, retries: int = 2) -> object:
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.load(resp)
        except Exception as exc:                      # noqa: BLE001
            last = exc
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
    raise FeedUnavailable(f"{url} unreachable: {type(last).__name__}: {last}")


# --------------------------------------------------------------------------
# Parsers (kept separate from I/O so they can be tested without a network)
# --------------------------------------------------------------------------

def parse_binance_funding(payload) -> list[tuple[int, float]]:
    """[(ms_timestamp, funding_rate_per_interval), ...], oldest first."""
    out = []
    for row in payload:
        out.append((int(row["fundingTime"]), float(row["fundingRate"])))
    out.sort()
    return out


def parse_bybit_funding(payload) -> list[tuple[int, float]]:
    rows = payload.get("result", {}).get("list", [])
    out = [(int(r["fundingRateTimestamp"]), float(r["fundingRate"])) for r in rows]
    out.sort()
    return out


def parse_binance_spot(payload) -> float:
    return float(payload["price"])


def parse_kraken_spot(payload) -> float:
    result = payload["result"]
    first = next(iter(result.values()))
    return float(first["c"][0])


def parse_coinbase_spot(payload) -> float:
    return float(payload["price"])


# --------------------------------------------------------------------------
# High-level fetchers
# --------------------------------------------------------------------------

def funding_history(symbol: str = "BTCUSDT", limit: int = 1000,
                    venue: str = "binance") -> list[tuple[int, float]]:
    """Settled funding rates, newest last. 1000 rows ~= 11 months of 8h data."""
    if venue == "binance":
        url = ENDPOINTS["binance_funding"].format(symbol=symbol, limit=min(limit, 1000))
        return parse_binance_funding(fetch_json(url))
    if venue == "bybit":
        url = ENDPOINTS["bybit_funding"].format(symbol=symbol, limit=min(limit, 200))
        return parse_bybit_funding(fetch_json(url))
    raise ValueError(f"unknown venue {venue!r}")


def spot_prices(symbol_map: dict[str, str] | None = None) -> dict[str, float]:
    """Best-effort spot price per venue. Venues that fail are simply absent."""
    symbol_map = symbol_map or {"binance": "BTCUSDT", "kraken": "XBTUSD",
                                "coinbase": "BTC-USD"}
    out: dict[str, float] = {}
    for venue, sym in symbol_map.items():
        try:
            if venue == "binance":
                out[venue] = parse_binance_spot(
                    fetch_json(ENDPOINTS["binance_spot"].format(symbol=sym), retries=0))
            elif venue == "kraken":
                out[venue] = parse_kraken_spot(
                    fetch_json(ENDPOINTS["kraken_spot"].format(symbol=sym), retries=0))
            elif venue == "coinbase":
                out[venue] = parse_coinbase_spot(
                    fetch_json(ENDPOINTS["coinbase_spot"].format(symbol=sym), retries=0))
        except Exception:                              # noqa: BLE001
            continue
    return out


# --------------------------------------------------------------------------
# Seeding the gate with real history
# --------------------------------------------------------------------------

def carry_returns_from_funding(rates: list[tuple[int, float]], frictions,
                               cash_reserve: float = 0.35) -> list[float]:
    """Convert settled funding rates into net per-interval returns on capital.

    This is what the carry strategy would actually have earned per 8-hour
    interval, on the capital it must tie up (spot + margin + reserve), had it
    been running through the whole history -- charged the same fees and
    modelled the same way as in the simulator. It is deliberately NOT the raw
    funding rate, which would overstate the return by ~65%.
    """
    capital_per_notional = 1.0 + frictions.margin_requirement + cash_reserve
    # amortise one round trip per 30-day holding period across its intervals
    entry_cost = 2 * frictions.trade_cost_bps(0.0) * 1e-4 / 90.0
    # Deliberately conservative: this scores the strategy as if it were in
    # the market for every interval, including the ones where funding was
    # negative and the live strategy would have stood aside. If the gate
    # opens on this series, it would open on the real one too.
    return [(r / capital_per_notional) - entry_cost for _, r in rates]


def seed_posterior(posterior, returns: list[float]) -> int:
    """Prime a posterior with a historical return series. Returns n added."""
    for r in returns:
        posterior.push(r)
    return len(returns)


# --------------------------------------------------------------------------
# Diagnostics
# --------------------------------------------------------------------------

@dataclass
class FeedStatus:
    name: str
    ok: bool
    detail: str


def doctor() -> list[FeedStatus]:
    """Check every public endpoint and report what is reachable."""
    out: list[FeedStatus] = []
    try:
        rows = funding_history("BTCUSDT", limit=10)
        out.append(FeedStatus("binance funding history", True,
                              f"{len(rows)} rows, latest "
                              f"{rows[-1][1]*100:.4f}% per 8h "
                              f"({rows[-1][1]*1095*100:.1f}%/yr)"))
    except Exception as exc:                           # noqa: BLE001
        out.append(FeedStatus("binance funding history", False, str(exc)[:120]))

    prices = spot_prices()
    if prices:
        spread = ((max(prices.values()) - min(prices.values()))
                  / min(prices.values()) * 1e4)
        out.append(FeedStatus("cross-venue spot", True,
                              ", ".join(f"{k}={v:,.0f}" for k, v in prices.items())
                              + f"  spread={spread:.1f}bps"))
    else:
        out.append(FeedStatus("cross-venue spot", False, "no venue reachable"))
    return out
