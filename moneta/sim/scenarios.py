"""Named stress scenarios.

Monte Carlo over a well-behaved generator tells you how the system does when
the world keeps working the way it has been. These are the cases where it
does not. Each one is a thing that has actually happened to real people
running exactly these strategies.
"""
from __future__ import annotations

from .market import Scenario

SCENARIOS: dict[str, Scenario] = {
    "base": Scenario(name="base"),

    "crash": Scenario(
        name="crash",
        crash_at_day=180.0, crash_size=-0.40,
        # A 40% gap down in one 8-hour candle. The carry book's short leg is
        # deeply profitable and its spot leg is deeply underwater; what
        # matters is whether the plumbing survives the transfer.
    ),

    "funding_flip": Scenario(
        name="funding_flip",
        funding_flip_at_day=90.0,
        # Funding goes and stays negative: the carry trade's entire income
        # inverts into a cost. This is 2022 for anyone running basis trades.
    ),

    "venue_failure": Scenario(
        name="venue_failure",
        venue_failure_at_day=150.0, failing_venue="ex1",
        # The exchange holding your money stops honouring withdrawals. Not
        # a drawdown -- a total loss of everything sitting there. FTX, Celsius,
        # Mt. Gox. This is the risk retail systematically ignores.
    ),

    "venue_failure_secondary": Scenario(
        name="venue_failure_secondary",
        venue_failure_at_day=150.0, failing_venue="ex2",
    ),

    "fee_shock": Scenario(
        name="fee_shock",
        fee_multiplier_at_day=60.0, fee_multiplier=2.5,
        marketplace_fee_shock=0.05,
        # Every venue raises its take. Thin edges become negative edges.
    ),

    "cointegration_break": Scenario(
        name="cointegration_break",
        cointegration_break_at_day=100.0,
        # The relationship the pairs trade is built on stops existing.
    ),

    "high_vol": Scenario(
        name="high_vol", vol_multiplier=2.0,
        # Everything moves twice as much. Margin calls arrive faster than
        # transfers clear.
    ),

    "everything": Scenario(
        name="everything",
        crash_at_day=120.0, crash_size=-0.35,
        funding_flip_at_day=140.0,
        fee_multiplier_at_day=160.0, fee_multiplier=2.0,
        marketplace_fee_shock=0.04,
        venue_failure_at_day=240.0, failing_venue="ex2",
        cointegration_break_at_day=200.0,
        vol_multiplier=1.6,
        # All of it, in one year. Not a forecast -- a floor.
    ),
}


def get(name: str) -> Scenario:
    try:
        return SCENARIOS[name]
    except KeyError:
        raise SystemExit(f"unknown scenario {name!r}; choose from {sorted(SCENARIOS)}")
