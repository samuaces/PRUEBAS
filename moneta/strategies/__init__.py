"""The revenue modules shipped with MONETA."""
from .funding_carry import FundingCarry
from .cross_venue_arb import CrossVenueArb
from .stat_arb_pairs import StatArbPairs
from .retail_arb import RetailArb
from .control_null import ControlNull

#: Everything the engine runs by default. `control_null` is the falsification
#: control and is always included -- removing it would remove the only proof
#: that the promotion gate does anything.
DEFAULT_STRATEGIES = (FundingCarry, CrossVenueArb, StatArbPairs, RetailArb, ControlNull)

REGISTRY = {cls.name: cls for cls in DEFAULT_STRATEGIES}


def build_default() -> list:
    return [cls() for cls in DEFAULT_STRATEGIES]


__all__ = ["FundingCarry", "CrossVenueArb", "StatArbPairs", "RetailArb",
           "ControlNull", "DEFAULT_STRATEGIES", "REGISTRY", "build_default"]
