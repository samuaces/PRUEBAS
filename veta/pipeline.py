"""fetch -> score -> rank, with the expensive checks done last.

Order matters for a practical reason. Reading a repository's pull request
history costs an API call and counts against a rate limit that is 60 an hour
without a token, so checking every candidate is not possible. Rank cheaply
first on what the listing already tells you, then spend the expensive checks
on the handful at the top -- and re-rank afterwards, because the health check
is exactly the thing that reorders them.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from .health import assess_repo
from .model import Assessment, Bounty
from .score import ScoreConfig, WinModel, assess, rank
from .sources import algora, github, manual
from .sources.http import Http


@dataclass
class ScanConfig:
    sources: tuple[str, ...] = ("github", "algora")
    manual_file: str = ""
    algora_orgs: tuple[str, ...] = ()
    #: how many top candidates get the expensive repo-health check
    deep_check: int = 12
    #: read the comment thread of the top few to spot rivals
    claim_check: int = 8
    min_amount_eur: float = 40.0
    token: str = ""
    rate_limit_s: float = 1.0


def collect(cfg: ScanConfig, http: Http | None = None) -> list[Bounty]:
    http = http or Http(min_interval_s=cfg.rate_limit_s,
                        token=cfg.token or os.environ.get("GITHUB_TOKEN", ""))
    found: list[Bounty] = []
    errors: list[str] = []

    if "github" in cfg.sources:
        try:
            found += github.search(http, errors=errors)
        except Exception as exc:                            # noqa: BLE001
            errors.append(f"github: {exc}")
    if "algora" in cfg.sources:
        try:
            found += algora.search(http, list(cfg.algora_orgs) or None)
        except Exception as exc:                            # noqa: BLE001
            errors.append(f"algora: {exc}")
    if cfg.manual_file:
        found += manual.load(cfg.manual_file)

    seen: set[str] = set()
    out = []
    for b in found:
        # the same issue often appears in two sources; keep it once
        dedup = b.url or b.key()
        if dedup in seen or b.amount_eur() < cfg.min_amount_eur:
            continue
        seen.add(dedup)
        out.append(b)
    collect.errors = errors        # type: ignore[attr-defined]
    return out


def scan(cfg: ScanConfig, model: WinModel | None = None,
         score_cfg: ScoreConfig | None = None,
         http: Http | None = None, progress=None) -> list[Assessment]:
    http = http or Http(min_interval_s=cfg.rate_limit_s,
                        token=cfg.token or os.environ.get("GITHUB_TOKEN", ""))
    model = model or WinModel()
    score_cfg = score_cfg or ScoreConfig()

    bounties = collect(cfg, http)
    scan.errors = getattr(collect, "errors", [])   # type: ignore[attr-defined]
    if progress:
        for err in scan.errors:                    # type: ignore[attr-defined]
            progress(f"AVISO: {err}")
        progress(f"{len(bounties)} bounties con importe encontradas")

    # cheap pass: no network, health unknown
    shallow = [assess(b, None, model, score_cfg) for b in bounties]
    shallow = rank(shallow)

    # expensive pass on the top slice only
    deep: list[Assessment] = []
    health_cache: dict[str, object] = {}
    for i, a in enumerate(shallow[:cfg.deep_check]):
        b = a.bounty
        if not b.repo:
            deep.append(a)
            continue
        if progress:
            progress(f"comprobando si {b.repo} fusiona trabajo de fuera "
                     f"({i+1}/{min(cfg.deep_check, len(shallow))})")
        health = health_cache.get(b.repo)
        if health is None:
            try:
                prs = github.repo_pull_requests(http, b.repo)
                meta = github.repo_meta(http, b.repo)
                health = assess_repo(b.repo, prs,
                                     open_pr_count=int(meta.get("open_issues_count") or 0),
                                     archived=bool(meta.get("archived")))
            except Exception:                               # noqa: BLE001
                health = None
            health_cache[b.repo] = health
        if i < cfg.claim_check and b.source == "github":
            try:
                b = github.enrich_claims(http, b)
            except Exception:                               # noqa: BLE001
                pass
        deep.append(assess(b, health, model, score_cfg))

    return rank(deep) + shallow[cfg.deep_check:]
