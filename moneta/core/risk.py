"""Risk governor.

The allocator's job is to find edge. This module's job is to make sure that
a bad week, a bad model or a bad exchange cannot end the account. It has
absolute veto power over the allocator: no amount of expected return buys a
breach of these limits.

Order of authority:  kill switch > global limits > per-strategy limits.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from .strategy import Book, Phase


@dataclass
class RiskLimits:
    # -- account level ------------------------------------------------------
    max_total_drawdown: float = 0.20      # halt everything beyond this
    max_daily_loss: float = 0.05          # fraction of equity lost in 24h
    min_cash_buffer: float = 0.10         # fraction of equity kept unallocated
    max_deployed: float = 0.85            # fraction of equity that may be at work

    # -- concentration ------------------------------------------------------
    max_per_strategy: float = 0.30        # fraction of equity in one strategy
    #: Counterparty concentration. Note carefully what this number means: an
    #: exchange failure is not a drawdown, it is a TOTAL LOSS of everything
    #: held there, so this cap IS your maximum loss to one venue going down.
    #: The stress suite measures exactly that. Raising it raises returns and
    #: raises the size of the hole in the same proportion.
    max_per_venue: float = 0.25
    max_leverage: float = 2.0             # gross notional / equity

    # -- strategy level -----------------------------------------------------
    strategy_max_drawdown: float = 0.25   # demote to probation beyond this
    strategy_kill_drawdown: float = 0.40  # retire permanently beyond this
    probation_factor: float = 0.35        # capital multiplier while on probation

    # -- operations ---------------------------------------------------------
    kill_switch_file: str = ".moneta_halt"


@dataclass
class RiskState:
    halted: bool = False
    reason: str = ""
    halted_at: float | None = None
    breaches: list[str] = field(default_factory=list)
    peak_equity: float = 0.0
    equity_24h_ago: float = 0.0
    _equity_history: list[tuple[float, float]] = field(default_factory=list)


class RiskGovernor:
    def __init__(self, limits: RiskLimits | None = None, check_kill_file: bool = False):
        self.limits = limits or RiskLimits()
        self.state = RiskState()
        self.check_kill_file = check_kill_file

    # -- account-level checks ----------------------------------------------
    def observe(self, t: float, equity: float) -> None:
        st = self.state
        st.peak_equity = max(st.peak_equity, equity)
        st._equity_history.append((t, equity))
        # keep a 24h rolling window
        cutoff = t - 24.0
        while len(st._equity_history) > 2 and st._equity_history[0][0] < cutoff:
            st._equity_history.pop(0)
        st.equity_24h_ago = st._equity_history[0][1]

    def drawdown(self, equity: float) -> float:
        if self.state.peak_equity <= 0:
            return 0.0
        return max(0.0, (self.state.peak_equity - equity) / self.state.peak_equity)

    def daily_loss(self, equity: float) -> float:
        base = self.state.equity_24h_ago
        if base <= 0:
            return 0.0
        return max(0.0, (base - equity) / base)

    def check_account(self, t: float, equity: float) -> bool:
        """Returns True if trading may continue. Sets halt state otherwise."""
        st, lim = self.state, self.limits
        if st.halted:
            return False

        if self.check_kill_file and os.path.exists(lim.kill_switch_file):
            self._halt(t, "manual kill switch file present")
            return False
        if equity <= 0:
            self._halt(t, "equity wiped out")
            return False

        dd = self.drawdown(equity)
        if dd > lim.max_total_drawdown:
            self._halt(t, f"account drawdown {dd:.1%} > {lim.max_total_drawdown:.0%}")
            return False

        dl = self.daily_loss(equity)
        if dl > lim.max_daily_loss:
            self._halt(t, f"24h loss {dl:.1%} > {lim.max_daily_loss:.0%}")
            return False
        return True

    def _halt(self, t: float, reason: str) -> None:
        self.state.halted = True
        self.state.reason = reason
        self.state.halted_at = t
        self.state.breaches.append(f"[t={t/24:.1f}d] HALT: {reason}")

    def resume(self) -> None:
        self.state.halted = False
        self.state.reason = ""
        self.state.halted_at = None

    # -- strategy-level checks ----------------------------------------------
    def police_strategy(self, t: float, book: Book) -> None:
        """Demote or retire a live strategy whose real book is bleeding."""
        lim = self.limits
        if book.phase is Phase.RETIRED:
            return
        dd = book.live_drawdown
        if book.phase in (Phase.LIVE, Phase.PROBATION):
            if dd > lim.strategy_kill_drawdown:
                book.phase = Phase.RETIRED
                book.retired_at = t
                book.note(t, f"RETIRED: live drawdown {dd:.1%} "
                             f"> {lim.strategy_kill_drawdown:.0%}")
                self.state.breaches.append(f"[t={t/24:.1f}d] retire {book.name} dd={dd:.1%}")
            elif dd > lim.strategy_max_drawdown and book.phase is Phase.LIVE:
                book.phase = Phase.PROBATION
                book.note(t, f"PROBATION: live drawdown {dd:.1%} "
                             f"> {lim.strategy_max_drawdown:.0%}")

    # -- sizing caps ---------------------------------------------------------
    def cap_allocations(self, equity: float, targets: dict[str, float],
                        venue_of: dict[str, tuple[str, ...]]) -> dict[str, float]:
        """Apply concentration and deployment caps to allocator targets."""
        lim = self.limits
        if equity <= 0:
            return {k: 0.0 for k in targets}

        capped = {k: max(0.0, min(v, lim.max_per_strategy * equity))
                  for k, v in targets.items()}

        # venue concentration: a strategy's capital sits on its venues
        venue_load: dict[str, float] = {}
        for name, amount in capped.items():
            vs = venue_of.get(name, ())
            if not vs:
                continue
            per = amount / len(vs)
            for v in vs:
                venue_load[v] = venue_load.get(v, 0.0) + per
        venue_cap = lim.max_per_venue * equity
        for v, load in venue_load.items():
            if load > venue_cap and load > 0:
                scale = venue_cap / load
                for name in capped:
                    if v in venue_of.get(name, ()):
                        capped[name] *= scale

        # total deployment cap + cash buffer
        budget = equity * min(lim.max_deployed, 1.0 - lim.min_cash_buffer)
        total = sum(capped.values())
        if total > budget and total > 0:
            scale = budget / total
            capped = {k: v * scale for k, v in capped.items()}
        return capped

    def report(self) -> dict:
        return {"halted": self.state.halted, "reason": self.state.reason,
                "halted_at_days": (self.state.halted_at / 24.0
                                   if self.state.halted_at is not None else None),
                "breaches": list(self.state.breaches)}
