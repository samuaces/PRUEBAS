"""Will these people actually merge your work?

This is the module that justifies VETA existing.

The failure mode that costs bounty hunters the most is not picking a hard
problem. It is picking a problem in a repository that does not merge outside
contributions. You can write a correct, tested, well-scoped patch and earn
exactly nothing, because the maintainer has not merged a pull request from a
stranger since March. The bounty stays posted, your hours are gone, and
nothing about the issue itself warned you.

All of it is visible in public data before you start:

  * what fraction of outside pull requests ever get merged
  * how long merging takes when it happens
  * whether anything from an outsider has been merged recently at all
  * how big the unreviewed backlog is

A repo with a 5% outside merge rate and nothing merged in six months is not
a bounty, it is a raffle. This module says so before you spend the weekend.

Everything takes plain dicts so it can be tested offline against fixtures,
with no network and no API keys.
"""
from __future__ import annotations

import statistics
from datetime import datetime, timezone

from .model import RepoHealth, parse_ts

#: association values GitHub uses for people who are NOT part of the project
OUTSIDE_ASSOCIATIONS = {"CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR",
                        "FIRST_TIMER", "NONE", "MANNEQUIN"}
INSIDE_ASSOCIATIONS = {"OWNER", "MEMBER", "COLLABORATOR"}


def is_outside(pr: dict) -> bool:
    """Was this pull request opened by someone outside the project?

    A maintainer merging their own work tells you nothing about whether they
    will merge yours, so those are excluded from every statistic here.
    """
    assoc = (pr.get("author_association") or "").upper()
    if assoc in INSIDE_ASSOCIATIONS:
        return False
    if assoc in OUTSIDE_ASSOCIATIONS:
        return True
    # Unknown association: fall back to whether the author owns the repo
    repo = (pr.get("repo") or "")
    owner = repo.split("/")[0].lower() if "/" in repo else ""
    user = pr.get("user")
    login = (user.get("login") if isinstance(user, dict) else user) or ""
    return login.lower() != owner


def _days(a, b) -> float | None:
    ta, tb = parse_ts(a), parse_ts(b)
    if not ta or not tb:
        return None
    return max(0.0, (tb - ta).total_seconds() / 86400.0)


def assess_repo(repo: str, pull_requests: list[dict],
                open_pr_count: int = 0, archived: bool = False,
                now: datetime | None = None) -> RepoHealth:
    """Compute merge health from a sample of recent CLOSED pull requests.

    `pull_requests` should be closed PRs, newest first. Open ones carry no
    information about whether things get merged, only about the backlog.
    """
    now = now or datetime.now(timezone.utc)
    health = RepoHealth(repo=repo, open_pr_backlog=open_pr_count,
                        archived=archived)

    outside = [pr for pr in pull_requests if is_outside(pr)]
    health.sampled_prs = len(pull_requests)
    health.outside_prs = len(outside)

    if not outside:
        health.error = "no outside pull requests in the sample"
        return health

    merge_times: list[float] = []
    last_merge: datetime | None = None
    merged = 0
    for pr in outside:
        merged_at = pr.get("merged_at")
        if not merged_at:
            continue
        merged += 1
        d = _days(pr.get("created_at"), merged_at)
        if d is not None:
            merge_times.append(d)
        ts = parse_ts(merged_at)
        if ts and (last_merge is None or ts > last_merge):
            last_merge = ts

    health.outside_merged = merged
    if merge_times:
        merge_times.sort()
        health.median_days_to_merge = statistics.median(merge_times)
        idx = min(len(merge_times) - 1, int(0.9 * (len(merge_times) - 1)))
        health.p90_days_to_merge = merge_times[idx]
    if last_merge:
        health.days_since_last_outside_merge = \
            max(0.0, (now - last_merge).total_seconds() / 86400.0)

    # Did anyone from the project even react? A closed-without-merge PR that
    # never got a comment is a different signal from one that got a review.
    reviewed = [pr for pr in outside if (pr.get("comments") or 0) > 0
                or (pr.get("review_comments") or 0) > 0]
    health.maintainer_response_rate = len(reviewed) / len(outside)
    return health


# --------------------------------------------------------------------------
# Turning health into a multiplier on your chance of getting paid
# --------------------------------------------------------------------------

def payout_factor(health: RepoHealth | None) -> tuple[float, list[str]]:
    """Multiplier in [0, 1] on P(win), plus the reasons for it.

    Deliberately harsh. The asymmetry is not symmetric: being too optimistic
    costs you a weekend of unpaid work, being too pessimistic costs you one
    bounty out of many available. So when the evidence is thin or bad, this
    pushes hard toward "walk away".
    """
    if health is None:
        return 0.65, ["repo health unknown, assuming mediocre"]
    if health.error and health.outside_prs == 0:
        return 0.45, [f"cannot judge this repo: {health.error}"]

    reasons: list[str] = []
    factor = 1.0

    if health.archived:
        return 0.0, ["repository is archived: nothing will ever be merged"]

    rate = health.outside_merge_rate
    factor *= max(0.05, min(1.0, rate / 0.55))
    reasons.append(f"outside PR merge rate {rate:.0%} "
                   f"({health.outside_merged}/{health.outside_prs})")

    since = health.days_since_last_outside_merge
    if since is None:
        factor *= 0.25
        reasons.append("no outside PR has EVER been merged in the sample")
    elif since > 180:
        factor *= 0.30
        reasons.append(f"last outside merge was {since:.0f} days ago")
    elif since > 90:
        factor *= 0.60
        reasons.append(f"last outside merge {since:.0f} days ago")
    elif since > 45:
        factor *= 0.85
        reasons.append(f"last outside merge {since:.0f} days ago")
    else:
        reasons.append(f"last outside merge {since:.0f} days ago -- active")

    med = health.median_days_to_merge
    if med is not None:
        if med > 60:
            factor *= 0.70
            reasons.append(f"merges take {med:.0f} days at the median")
        elif med > 21:
            factor *= 0.90
            reasons.append(f"merges take {med:.0f} days at the median")
        else:
            reasons.append(f"merges take {med:.0f} days at the median")

    if health.open_pr_backlog > 150:
        factor *= 0.75
        reasons.append(f"{health.open_pr_backlog} pull requests already waiting")

    if health.maintainer_response_rate is not None \
            and health.maintainer_response_rate < 0.35:
        factor *= 0.80
        reasons.append(f"maintainers reply to only "
                       f"{health.maintainer_response_rate:.0%} of outside PRs")

    return max(0.0, min(1.0, factor)), reasons
