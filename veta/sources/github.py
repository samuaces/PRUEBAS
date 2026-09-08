"""Bounties posted as GitHub issues.

Several bounty platforms work by labelling an ordinary GitHub issue and
putting the amount in the label or the title, so the issue search API finds
a large part of the market without touching any platform's own service.

Unauthenticated search is limited to 10 requests a minute and will start
returning 403; with a token it is 30. `veta doctor` reports which you have.
"""
from __future__ import annotations

from datetime import datetime

from ..model import Bounty, extract_amount, looks_claimed, parse_ts
from .http import Http, qs

API = "https://api.github.com"

#: Labels actually used by the bounty platforms and by projects paying
#: directly. Amounts frequently live in the label itself ("Bounty: $500").
BOUNTY_LABELS = [
    "💎 Bounty", "bounty", "Bounty", "💰 bounty", "has-bounty",
    "bounty-available", "paid", "reward",
]


def _labels(issue: dict) -> tuple[str, ...]:
    out = []
    for l in issue.get("labels") or []:
        out.append(l.get("name", "") if isinstance(l, dict) else str(l))
    return tuple(x for x in out if x)


def _repo_from_url(url: str) -> str:
    return url.split("/repos/", 1)[-1] if "/repos/" in url else ""


def to_bounty(issue: dict) -> Bounty | None:
    """Normalise a GitHub issue into a Bounty, or None if no amount is found."""
    labels = _labels(issue)
    haystack = " \n".join([issue.get("title") or "", *labels,
                           (issue.get("body") or "")[:4000]])
    found = extract_amount(haystack)
    if not found:
        return None
    amount, currency = found

    assignee = None
    a = issue.get("assignee")
    if isinstance(a, dict):
        assignee = a.get("login")

    return Bounty(
        source="github",
        id=str(issue.get("id") or issue.get("number")),
        title=issue.get("title") or "",
        url=issue.get("html_url") or "",
        amount=amount,
        currency=currency,
        repo=_repo_from_url(issue.get("repository_url") or ""),
        labels=labels,
        body=(issue.get("body") or "")[:8000],
        created_at=parse_ts(issue.get("created_at")),
        updated_at=parse_ts(issue.get("updated_at")),
        comments=int(issue.get("comments") or 0),
        assignee=assignee,
        state=issue.get("state") or "open",
        raw=issue,
    )


def search(http: Http, labels: list[str] | None = None, per_page: int = 50,
           extra_query: str = "", errors: list[str] | None = None) -> list[Bounty]:
    """Open issues carrying a bounty label.

    One failing label must not kill the whole scan, but swallowing the
    failures silently is worse: a blocked token or a proxy that refuses the
    search endpoint then looks exactly like "there is no paid work today",
    and you go away believing the market is empty. Every failure is collected
    and the caller is expected to show them.
    """
    out: list[Bounty] = []
    seen: set[str] = set()
    failures: list[str] = []
    attempted = 0
    for label in (labels or BOUNTY_LABELS):
        attempted += 1
        q = f'label:"{label}" state:open type:issue {extra_query}'.strip()
        url = f"{API}/search/issues?" + qs(q=q, per_page=min(per_page, 100),
                                           sort="created", order="desc")
        try:
            data = http.get_json(url)
        except Exception as exc:                            # noqa: BLE001
            failures.append(f'label "{label}": {exc}')
            continue
        for issue in (data or {}).get("items", []):
            if issue.get("pull_request"):
                continue
            b = to_bounty(issue)
            if b and b.key() not in seen:
                seen.add(b.key())
                out.append(b)

    if errors is not None:
        if failures and len(failures) == attempted:
            errors.append("GitHub search failed for EVERY label -- this is a "
                          "connectivity or permissions problem, not an empty "
                          "market. First failure: " + failures[0][:200])
        elif failures:
            errors.append(f"{len(failures)} of {attempted} GitHub label "
                          f"searches failed: {failures[0][:160]}")
    return out


def enrich_claims(http: Http, bounty: Bounty, max_comments: int = 60) -> Bounty:
    """Read the thread to find people who have said they are on it.

    Costs one request per bounty, so it is only worth doing for the handful
    that survive ranking -- which is the whole point of ranking first.
    """
    raw = bounty.raw or {}
    url = raw.get("comments_url")
    if not url or bounty.comments == 0:
        return bounty
    try:
        comments = http.get_json(f"{url}?per_page={max_comments}")
    except Exception:                                       # noqa: BLE001
        return bounty
    claimants = []
    for c in comments or []:
        body = c.get("body") or ""
        if looks_claimed(body):
            login = (c.get("user") or {}).get("login")
            if login and login not in claimants:
                claimants.append(login)
    bounty.claimants = tuple(claimants)
    bounty.participants = len({(c.get("user") or {}).get("login")
                               for c in comments or []} - {None})
    return bounty


def repo_pull_requests(http: Http, repo: str, per_page: int = 50) -> list[dict]:
    """Recent CLOSED pull requests, for the merge-health check."""
    url = (f"{API}/repos/{repo}/pulls?"
           + qs(state="closed", per_page=min(per_page, 100),
                sort="updated", direction="desc"))
    data = http.get_json(url)
    prs = []
    for pr in data or []:
        prs.append({
            "author_association": pr.get("author_association"),
            "created_at": pr.get("created_at"),
            "merged_at": pr.get("merged_at"),
            "closed_at": pr.get("closed_at"),
            "comments": pr.get("comments") or 0,
            "review_comments": pr.get("review_comments") or 0,
            "user": pr.get("user"),
            "repo": repo,
        })
    return prs


def repo_meta(http: Http, repo: str) -> dict:
    return http.get_json(f"{API}/repos/{repo}")
