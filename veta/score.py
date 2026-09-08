"""From a list of bounties to one honest number: euros per hour of your time.

Three quantities have to be estimated, and they are estimated separately
because they fail for different reasons and are learned from different data:

  HOURS    from the issue itself -- how much work is written down here
  P(WIN)   from your record, the competition, and whether the repo merges
  PAYOUT   from the source, which posts it

Only the first two are guesses, and both are reported with their range
rather than as point values, because a bounty that is "4 hours or 20
depending on what you find" is a different proposition from one that is
reliably 8, even when the average is the same.
"""
from __future__ import annotations

import math
import random
import re
from dataclasses import dataclass, field

from .health import payout_factor
from .model import Assessment, Bounty, RepoHealth, amount_is_ambiguous, looks_claimed


# --------------------------------------------------------------------------
# Your own win rate, learned rather than assumed
# --------------------------------------------------------------------------

@dataclass
class BetaPosterior:
    """Beta-Binomial posterior over "do I actually land these?".

    The prior is sceptical on purpose: Beta(2, 6) has a mean of 25%, so a
    newcomer is assumed to lose three attempts out of four until their own
    record says otherwise. Starting from an optimistic prior is how people
    talk themselves into a month of unpaid work.
    """
    alpha: float = 2.0
    beta: float = 6.0
    wins: int = 0
    attempts: int = 0

    def update(self, won: bool) -> None:
        self.attempts += 1
        if won:
            self.wins += 1
            self.alpha += 1.0
        else:
            self.beta += 1.0

    @property
    def mean(self) -> float:
        return self.alpha / (self.alpha + self.beta)

    def sample(self, rng: random.Random) -> float:
        # Beta(a,b) via two Gammas -- stdlib has no betavariate with our shape
        x = rng.gammavariate(self.alpha, 1.0)
        y = rng.gammavariate(self.beta, 1.0)
        return x / (x + y) if (x + y) > 0 else self.mean

    def credible_interval(self, level: float = 0.90) -> tuple[float, float]:
        """Normal approximation to the Beta, clipped. Good enough to display."""
        m = self.mean
        n = self.alpha + self.beta
        sd = math.sqrt(max(m * (1 - m) / (n + 1), 1e-12))
        z = 1.645 if level >= 0.89 else 1.0
        return (max(0.0, m - z * sd), min(1.0, m + z * sd))

    def as_dict(self) -> dict:
        lo, hi = self.credible_interval()
        return {"win_rate": self.mean, "attempts": self.attempts,
                "wins": self.wins, "ci90": [lo, hi]}


# --------------------------------------------------------------------------
# Effort
# --------------------------------------------------------------------------

EASY_LABELS = {"good first issue", "good-first-issue", "documentation", "docs",
               "typo", "beginner", "easy", "starter", "help wanted"}
HARD_LABELS = {"epic", "rfc", "design", "architecture", "refactor", "breaking",
               "performance", "security", "research", "discussion", "proposal"}

EASY_WORDS = re.compile(
    r"\b(typo|docs?|readme|comment|rename|log message|error message|"
    r"add a test|missing test|flaky test|lint|format|deprecat)\w*", re.I)
HARD_WORDS = re.compile(
    r"\b(refactor|rewrite|redesign|architect|migrat|concurren|race condition|"
    r"deadlock|memory leak|performance regression|backward.compat|"
    r"cross.platform|investigate|reproduce)\w*", re.I)
REPRO_HINT = re.compile(r"```|steps to reproduce|stack ?trace|traceback|"
                        r"minimal (?:repro|example)", re.I)


def estimate_hours(bounty: Bounty) -> tuple[float, float, float]:
    """(optimistic, likely, pessimistic) hours to a submitted patch.

    Anchored at four hours for a normal bug with a reproduction, then moved
    by what the issue actually contains. The spread widens for anything that
    smells like investigation, because the variance of "find out why" is far
    larger than the variance of "change this line".
    """
    text = f"{bounty.title}\n{bounty.body}"
    labels = {l.lower() for l in bounty.labels}

    hours = 4.0
    spread = 0.55

    if labels & EASY_LABELS:
        hours *= 0.55
    if labels & HARD_LABELS:
        hours *= 2.0
        spread += 0.35

    easy_hits = len(EASY_WORDS.findall(text))
    hard_hits = len(HARD_WORDS.findall(text))
    hours *= 0.85 ** min(easy_hits, 3)
    hours *= 1.35 ** min(hard_hits, 4)
    if hard_hits:
        spread += 0.10 * min(hard_hits, 3)

    if REPRO_HINT.search(text):
        hours *= 0.75            # a reproduction is most of the work
    else:
        hours *= 1.25
        spread += 0.15

    body_len = len(bounty.body or "")
    if body_len < 200:
        hours *= 1.30            # nothing written down means you must ask
        spread += 0.20
    elif body_len > 3000:
        hours *= 1.20            # a wall of text is usually a wall of scope

    if bounty.comments > 25:
        hours *= 1.30            # long threads mean the scope is contested
        spread += 0.15

    hours = max(0.5, min(hours, 80.0))
    spread = min(spread, 1.30)
    return (hours * (1 - spread * 0.55), hours, hours * (1 + spread))


# --------------------------------------------------------------------------
# Probability of getting paid
# --------------------------------------------------------------------------

@dataclass
class WinModel:
    """Everything that stands between doing the work and being paid."""
    skill: BetaPosterior = field(default_factory=BetaPosterior)
    #: strength of one declared rival in the race. P(you are first) is
    #: 1/(1 + strength*n), which is what a race between n+1 roughly equal
    #: attempts looks like. The earlier form here was an exponential decay
    #: with no justification behind it, and it punished contested bounties
    #: about twice as hard as the arithmetic supports -- enough to make the
    #: whole ranking pass on good work.
    race_strength: float = 0.7
    #: an assignee is a far stronger claim than a comment
    assigned_penalty: float = 0.18

    def p_win(self, bounty: Bounty, health: RepoHealth | None,
              rng: random.Random | None = None) -> tuple[float, list[str], list[str]]:
        reasons: list[str] = []
        warnings: list[str] = []

        base = self.skill.sample(rng) if rng else self.skill.mean
        reasons.append(f"your measured landing rate {self.skill.mean:.0%} "
                       f"over {self.skill.attempts} attempts"
                       if self.skill.attempts
                       else f"assumed landing rate {self.skill.mean:.0%} "
                            f"(no record yet -- sceptical prior)")

        pay_f, pay_reasons = payout_factor(health)
        reasons.extend(pay_reasons)
        p = base * pay_f
        if pay_f < 0.35:
            warnings.append("this project rarely merges outside work")

        if bounty.assignee:
            p *= self.assigned_penalty
            warnings.append(f"already assigned to {bounty.assignee}")
        elif bounty.claimants:
            n = len(bounty.claimants)
            p *= 1.0 / (1.0 + self.race_strength * n)
            warnings.append(f"{n} other {'person has' if n == 1 else 'people have'} "
                            f"publicly claimed it")

        # Age is the weakest signal in this model and it is kept deliberately
        # mild. The story that an old bounty is harder than it reads is
        # plausible, but it is a story: there is no measurement behind it
        # here, and an unevidenced penalty on a long tail of perfectly good
        # work costs more than the occasional trap it avoids. It is surfaced
        # as a warning to read rather than as a large multiplier.
        if bounty.age_days > 365:
            p *= 0.85
            warnings.append(f"open for {bounty.age_days/365:.1f} years -- "
                            f"check the thread for why nobody has taken it")
        elif bounty.age_days > 120:
            reasons.append(f"open for {bounty.age_days:.0f} days")

        if bounty.comments > 40:
            p *= 0.85
            warnings.append(f"{bounty.comments} comments: the scope is contested")

        if bounty.state != "open":
            p = 0.0
            warnings.append(f"issue is {bounty.state}")

        return max(0.0, min(1.0, p)), reasons, warnings


# --------------------------------------------------------------------------
# Putting it together
# --------------------------------------------------------------------------

@dataclass
class ScoreConfig:
    usd_eur: float = 0.92
    #: below this, decline. Your time has a floor even when you need money.
    min_ev_per_hour: float = 12.0
    #: never start something you cannot finish in this many hours
    max_hours: float = 25.0
    #: fraction of the pessimistic estimate you actually risk before bailing
    bail_fraction: float = 0.65


def assess(bounty: Bounty, health: RepoHealth | None,
           model: WinModel | None = None, cfg: ScoreConfig | None = None,
           rng: random.Random | None = None) -> Assessment:
    cfg = cfg or ScoreConfig()
    model = model or WinModel()

    lo, mid, hi = estimate_hours(bounty)
    p, reasons, warnings = model.p_win(bounty, health, rng)
    payout = bounty.amount_eur(cfg.usd_eur)

    if amount_is_ambiguous(f"{bounty.title}\n{bounty.body}"):
        warnings.append("several amounts appear in the text -- confirm the "
                        "payout before starting")

    # You pay the hours whether or not you are paid. That is the whole
    # asymmetry of bounty work and the reason the naive "biggest payout
    # first" ranking loses money.
    ev = p * payout
    ev_per_hour = ev / max(mid, 1e-9)
    downside = mid * cfg.bail_fraction

    if bounty.state != "open":
        verdict = "SKIP: closed"
    elif ev_per_hour < cfg.min_ev_per_hour:
        verdict = f"SKIP: {ev_per_hour:.0f} EUR/h expected, below your floor"
    elif mid > cfg.max_hours:
        verdict = f"SKIP: {mid:.0f}h is too big a single bet"
    elif warnings and p < 0.15:
        verdict = "SKIP: you would probably not get paid"
    else:
        verdict = f"ATTEMPT: {ev_per_hour:.0f} EUR/h expected"

    return Assessment(bounty=bounty, health=health, p_win=p,
                      hours_estimate=mid, hours_low=lo, hours_high=hi,
                      ev_eur=ev, ev_per_hour=ev_per_hour,
                      downside_hours=downside, reasons=reasons,
                      warnings=warnings, verdict=verdict)


def rank(assessments: list[Assessment]) -> list[Assessment]:
    return sorted(assessments, key=lambda a: -a.ev_per_hour)
