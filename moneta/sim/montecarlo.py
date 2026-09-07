"""Monte Carlo, stress testing and ablation.

A single backtest is an anecdote. These functions run the whole engine over
hundreds of independently generated histories and report the distribution of
outcomes, including the bad tail -- which is the only part that matters when
deciding whether to put real money in.

Paths are independent, so they run across all cores via the standard library.
"""
from __future__ import annotations

import math
import os
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field, asdict, replace

from ..core.allocator import Allocator, AllocatorConfig, UniformAllocator
from ..core.engine import EngineConfig, EngineResult, run_path
from ..core.frictions import FrictionModel, get_preset
from ..core.risk import RiskLimits
from ..core.stats import (bootstrap_ci, cvar, percentile, welch_t_test)
from ..strategies import build_default
from .market import Scenario, SimWorld, WorldConfig


@dataclass
class SweepConfig:
    paths: int = 200
    live_days: int = 365
    warmup_days: float = 365.0
    capital: float = 10_000.0
    friction_preset: str = "adversarial"
    labor_hours_per_week: float = 10.0
    seed0: int = 1000
    allocator: str = "moneta"          # "moneta" | "uniform"
    gate: bool = True                  # False disables the promotion gate
    kelly: bool = True                 # False sizes every live strategy equally
    scenario: Scenario = field(default_factory=Scenario)
    workers: int | None = None


def _run_one(args) -> dict:
    cfg, seed = args
    frictions = get_preset(cfg.friction_preset)
    scenario = replace(cfg.scenario, offset_days=cfg.warmup_days)
    world = SimWorld(
        WorldConfig(days=int(cfg.warmup_days + cfg.live_days),
                    labor_hours_per_week=cfg.labor_hours_per_week),
        frictions, scenario, seed=seed)

    acfg = AllocatorConfig()
    if not cfg.gate:
        # No gate: everything is funded from day one, which is what a
        # backtest-and-deploy workflow actually does.
        acfg.bypass_gate = True
        acfg.min_observations = 0
    if not cfg.kelly:
        acfg.kelly_fraction = 0.0
        acfg.min_live_fraction = 0.20

    allocator = (UniformAllocator(acfg, seed=seed) if cfg.allocator == "uniform"
                 else Allocator(acfg, seed=seed))

    result = run_path(
        world, build_default(), frictions,
        EngineConfig(starting_capital=cfg.capital, paper_notional=cfg.capital,
                     warmup_days=cfg.warmup_days, seed=seed),
        allocator, RiskLimits())

    return {
        "seed": seed,
        "start": result.start, "end": result.end,
        "cagr": result.cagr, "sharpe": result.sharpe, "sortino": result.sortino,
        "max_drawdown": result.max_drawdown,
        "halted": result.halted, "halt_reason": result.halt_reason,
        "labor_hours": result.labor_hours,
        "labor_pnl_per_hour": result.labor_pnl_per_hour,
        "tax_paid": result.tax_paid, "fees_paid": result.fees_paid,
        "pnl_by_strategy": result.pnl_by_strategy,
        "allocation_share": result.allocation_share,
        "final_phases": result.final_phases,
        "promoted_at_days": result.promoted_at_days,
        "dead_venues": sorted(world.dead_venues),
    }


def sweep(cfg: SweepConfig, progress=None) -> list[dict]:
    """Run `cfg.paths` independent histories, in parallel."""
    jobs = [(cfg, cfg.seed0 + i) for i in range(cfg.paths)]
    workers = cfg.workers or min(os.cpu_count() or 1, 16)
    out: list[dict] = []
    if workers <= 1 or cfg.paths < 4:
        for j in jobs:
            out.append(_run_one(j))
            if progress:
                progress(len(out), cfg.paths)
        return out
    with ProcessPoolExecutor(max_workers=workers) as pool:
        for row in pool.map(_run_one, jobs, chunksize=max(1, len(jobs) // (workers * 4))):
            out.append(row)
            if progress:
                progress(len(out), cfg.paths)
    return out


# --------------------------------------------------------------------------
# Aggregation
# --------------------------------------------------------------------------

def summarise(rows: list[dict], label: str = "") -> dict:
    cagrs = [r["cagr"] for r in rows]
    ends = [r["end"] for r in rows]
    dds = [r["max_drawdown"] for r in rows]
    profits = [r["end"] - r["start"] for r in rows]
    lo, hi = bootstrap_ci(cagrs)

    names = sorted({k for r in rows for k in r["allocation_share"]})
    per_strategy = {}
    for n in names:
        shares = [r["allocation_share"].get(n, 0.0) for r in rows]
        pnls = [r["pnl_by_strategy"].get(n, 0.0) for r in rows]
        funded = [1.0 if s > 0.01 else 0.0 for s in shares]
        promos = [r["promoted_at_days"].get(n) for r in rows]
        promos = [p for p in promos if p]
        per_strategy[n] = {
            "funded_fraction": sum(funded) / len(rows),
            "mean_capital_share": sum(shares) / len(rows),
            "mean_pnl": sum(pnls) / len(rows),
            "median_promotion_day": (sorted(promos)[len(promos) // 2]
                                     if promos else None),
        }

    return {
        "label": label,
        "paths": len(rows),
        "cagr_mean": sum(cagrs) / len(cagrs),
        "cagr_median": percentile(cagrs, 0.5),
        "cagr_p05": percentile(cagrs, 0.05),
        "cagr_p25": percentile(cagrs, 0.25),
        "cagr_p75": percentile(cagrs, 0.75),
        "cagr_p95": percentile(cagrs, 0.95),
        "cagr_ci95": [lo, hi],
        "prob_loss": sum(1 for c in cagrs if c < 0) / len(cagrs),
        "prob_ruin_20pct": sum(1 for d in dds if d >= 0.20) / len(dds),
        "cvar05_cagr": cvar(cagrs, 0.05),
        "median_end": percentile(ends, 0.5),
        "median_profit": percentile(profits, 0.5),
        "max_drawdown_median": percentile(dds, 0.5),
        "max_drawdown_p95": percentile(dds, 0.95),
        "sharpe_median": percentile([r["sharpe"] for r in rows], 0.5),
        "halted_fraction": sum(1 for r in rows if r["halted"]) / len(rows),
        "labor_hours_median": percentile([r["labor_hours"] for r in rows], 0.5),
        "eur_per_labor_hour_median": percentile(
            [(r["end"] - r["start"]) / max(r["labor_hours"], 1.0) for r in rows], 0.5),
        "tax_paid_median": percentile([r["tax_paid"] for r in rows], 0.5),
        "fees_paid_median": percentile([r["fees_paid"] for r in rows], 0.5),
        "per_strategy": per_strategy,
        "_cagrs": cagrs,
    }


def compare(a: dict, b: dict) -> dict:
    """Welch's t-test between two arms of the ablation study."""
    t, df, p = welch_t_test(a["_cagrs"], b["_cagrs"])
    return {"a": a["label"], "b": b["label"],
            "a_median_cagr": a["cagr_median"], "b_median_cagr": b["cagr_median"],
            "delta_mean_cagr": a["cagr_mean"] - b["cagr_mean"],
            "t": t, "df": df, "p_value": p,
            "significant_at_5pct": p < 0.05}
