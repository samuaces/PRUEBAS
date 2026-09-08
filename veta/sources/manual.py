"""Bounties you found yourself.

Not every market has an API, and the ones that do change them. This source
reads a plain JSON file so that anything you spot by hand -- a forum post
offering money, a Discord bounty, a client who mentioned a budget -- goes
through exactly the same scoring as everything else, instead of being
decided on enthusiasm.

    [{"title": "...", "url": "...", "amount": 300, "currency": "EUR",
      "repo": "owner/name", "body": "...", "created_at": "2026-09-01"}]
"""
from __future__ import annotations

import json
from pathlib import Path

from ..model import Bounty, parse_ts


def load(path: str | Path) -> list[Bounty]:
    p = Path(path)
    if not p.exists():
        return []
    data = json.loads(p.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("bounties", [])
    out = []
    for i, r in enumerate(data):
        amount = float(r.get("amount") or 0)
        if amount <= 0:
            continue
        out.append(Bounty(
            source="manual",
            id=str(r.get("id") or i),
            title=r.get("title") or "",
            url=r.get("url") or "",
            amount=amount,
            currency=(r.get("currency") or "EUR").upper(),
            repo=r.get("repo") or "",
            body=r.get("body") or "",
            labels=tuple(r.get("labels") or ()),
            created_at=parse_ts(r.get("created_at")),
            updated_at=parse_ts(r.get("updated_at")),
            comments=int(r.get("comments") or 0),
            assignee=r.get("assignee"),
            state=r.get("state") or "open",
            raw=r,
        ))
    return out
