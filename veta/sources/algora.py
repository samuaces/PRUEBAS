"""Algora bounties, via the public unauthenticated endpoint.

Algora escrows the money before the issue is posted, which is the property
that makes this market worth scanning: the payout is not a promise from a
stranger, it is already deposited.

A caution about this file. The endpoint (`/api/orgs/{org}/bounties`, no key
required, `limit` 1-100 plus a `cursor`) is documented, but the exact JSON
field names could not be verified from the machine this was written on --
the network there reaches almost nothing. So the parser below is deliberately
tolerant: it looks for each value under every name the field plausibly has,
handles amounts given in cents, and keeps the raw record.

`veta probe algora` prints the real JSON from YOUR machine. If the mapping is
wrong you will see it immediately rather than silently ranking zeroes, and
`_pick` is the one function to correct.
"""
from __future__ import annotations

from ..model import Bounty, looks_claimed, parse_ts
from .http import Http, qs

BASE = "https://api.algora.io"

#: A starting list of organisations known to post bounties. Extend it freely;
#: the endpoint is per-org, so coverage is exactly what you put here.
DEFAULT_ORGS = [
    "algora", "cal", "traefik", "tembo", "zio", "documenso", "twentyhq",
    "highlight", "trigger", "keep", "windmill", "activepieces", "formbricks",
]


def _pick(d: dict, *names, default=None):
    """First present, non-empty value among `names`, searching one level deep."""
    for n in names:
        if n in d and d[n] not in (None, "", []):
            return d[n]
    for value in d.values():
        if isinstance(value, dict):
            for n in names:
                if n in value and value[n] not in (None, "", []):
                    return value[n]
    return default


def _amount(record: dict) -> tuple[float, str]:
    """Amounts may arrive as a number, a string, or an object in cents."""
    raw = _pick(record, "amount", "reward", "value", "price", "bounty",
                "amount_in_cents", "amountInCents", "amount_cents", "cents")
    currency = str(_pick(record, "currency", "currency_code", default="USD")).upper()

    if isinstance(raw, dict):
        currency = str(_pick(raw, "currency", "currency_code",
                             default=currency)).upper()
        raw = _pick(raw, "amount", "value", "in_cents", "cents",
                    "amount_in_cents", "amountInCents", default=0)

    try:
        value = float(str(raw).replace(",", "").replace("$", "").strip())
    except (TypeError, ValueError):
        return 0.0, currency

    # Payment APIs overwhelmingly use minor units. A "bounty" of 50000 is
    # far more likely to be $500.00 than fifty thousand dollars.
    keys = " ".join(record.keys()).lower()
    if "cent" in keys or (value >= 5000 and value % 100 == 0):
        value /= 100.0
    return value, (currency or "USD")


def to_bounty(record: dict) -> Bounty | None:
    amount, currency = _amount(record)
    if amount <= 0:
        return None

    task = record.get("task") if isinstance(record.get("task"), dict) else {}
    src = {**task, **record}

    url = str(_pick(src, "url", "html_url", "link", "permalink", default=""))
    repo = str(_pick(src, "repo_full_name", "repository", "repo", default=""))
    if not repo and "github.com/" in url:
        parts = url.split("github.com/", 1)[-1].split("/")
        if len(parts) >= 2:
            repo = f"{parts[0]}/{parts[1]}"

    status = str(_pick(src, "status", "state", default="open")).lower()
    return Bounty(
        source="algora",
        id=str(_pick(src, "id", "uuid", "number", default=url or "?")),
        title=str(_pick(src, "title", "name", "summary", default="")),
        url=url,
        amount=amount,
        currency=currency,
        repo=repo,
        body=str(_pick(src, "body", "description", default=""))[:8000],
        created_at=parse_ts(_pick(src, "created_at", "createdAt", "inserted_at")),
        updated_at=parse_ts(_pick(src, "updated_at", "updatedAt")),
        state="open" if status in ("open", "active", "available", "") else status,
        raw=record,
    )


def _records(payload) -> list[dict]:
    """Find the list of items whatever the envelope looks like."""
    if isinstance(payload, list):
        return [r for r in payload if isinstance(r, dict)]
    if isinstance(payload, dict):
        for key in ("items", "data", "results", "bounties", "records", "edges"):
            value = payload.get(key)
            if isinstance(value, list):
                return [r.get("node", r) if isinstance(r, dict) else {}
                        for r in value]
    return []


def fetch_org(http: Http, org: str, limit: int = 100) -> list[Bounty]:
    url = f"{BASE}/api/orgs/{org}/bounties?" + qs(limit=min(limit, 100),
                                                  status="open")
    payload = http.get_json(url)
    out = []
    for record in _records(payload):
        b = to_bounty(record)
        if b and b.state == "open":
            out.append(b)
    return out


def search(http: Http, orgs: list[str] | None = None,
           limit: int = 100) -> list[Bounty]:
    out: list[Bounty] = []
    for org in (orgs or DEFAULT_ORGS):
        try:
            out.extend(fetch_org(http, org, limit))
        except Exception:                                   # noqa: BLE001
            continue          # an org that has moved or gone must not stop the scan
    return out


def probe(http: Http, org: str = "algora") -> object:
    """Raw payload, for checking the field mapping against reality."""
    return http.get_json(f"{BASE}/api/orgs/{org}/bounties?" + qs(limit=3))
