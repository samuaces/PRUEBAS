"""Money handling.

The simulator runs on floats for speed (a Monte Carlo sweep is tens of
millions of arithmetic ops). Anything that is *reported* -- or that runs in
live mode, where a cent is a cent -- goes through the Decimal helpers here,
and `assert_conserved` lets the tests check the ledger's invariants exactly.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_EVEN

CENT = Decimal("0.01")


def to_cents(x: float | Decimal) -> Decimal:
    return Decimal(str(x)).quantize(CENT, rounding=ROUND_HALF_EVEN)


def fmt(x: float, currency: str = "EUR") -> str:
    sym = {"EUR": "€", "USD": "$", "GBP": "£"}.get(currency, currency + " ")
    return f"{sym}{to_cents(x):,}"


def pct(x: float, places: int = 2) -> str:
    return f"{x * 100:.{places}f}%"


def bps(x: float) -> str:
    return f"{x * 1e4:.1f}bps"


def assert_conserved(before: float, after: float, delta: float,
                     tol: float = 1e-6, what: str = "cash") -> None:
    """Exact-ish conservation check used by the test-suite."""
    if abs((before + delta) - after) > tol:
        raise AssertionError(
            f"{what} not conserved: {before} + {delta} != {after} "
            f"(drift {abs((before + delta) - after):.10f})")
