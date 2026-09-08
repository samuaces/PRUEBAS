"""Turning a ranked bounty into work an agent can actually do.

The economics computed in `score.py` are only valid if the hours estimate
holds. A bounty worth 22 EUR/h at five hours is worth 5 EUR/h at twenty-two,
and the way bounty hunters lose money is not picking the wrong issue -- it
is picking a reasonable issue and then spending three days on it because
stopping felt like waste.

So the brief leads with the time box and the bail-out condition, before any
of the technical context. The number is not advice, it is the assumption the
decision to start was based on. When it is gone, the decision has expired.
"""
from __future__ import annotations

import textwrap
from datetime import datetime, timezone

from .model import Assessment


def _wrap(text: str, width: int = 78, indent: str = "") -> str:
    return "\n".join(textwrap.fill(line, width, initial_indent=indent,
                                   subsequent_indent=indent) if line.strip()
                     else "" for line in text.splitlines())


def write_brief(a: Assessment, skill_note: str = "") -> str:
    b = a.bounty
    budget = a.hours_estimate
    bail = a.downside_hours

    health_lines = []
    if a.health:
        h = a.health
        health_lines = [
            f"- Outside pull requests merged: {h.outside_merge_rate:.0%} "
            f"({h.outside_merged} of {h.outside_prs} sampled)",
            f"- Median time to merge: "
            + (f"{h.median_days_to_merge:.0f} days" if h.median_days_to_merge
               is not None else "never merged in the sample"),
            f"- Last outside merge: "
            + (f"{h.days_since_last_outside_merge:.0f} days ago"
               if h.days_since_last_outside_merge is not None else "none found"),
            f"- Open pull request backlog: {h.open_pr_backlog}",
        ]

    warn = "\n".join(f"- {w}" for w in a.warnings) or "- none flagged"
    reasons = "\n".join(f"- {r}" for r in a.reasons)

    return f"""# Bounty attempt: {b.title}

**Issue:** {b.url}
**Repository:** `{b.repo or "unknown"}`
**Payout:** {b.amount:,.0f} {b.currency} (about {b.amount_eur():,.0f} EUR)
**Generated:** {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}

---

## The time box, which is the whole point

**Budget: {budget:.1f} hours. Hard stop: {bail:.1f} hours.**

This bounty was selected because it is worth about **{a.ev_per_hour:.0f} EUR
per hour** at an estimated {budget:.1f} hours of work and a {a.p_win:.0%}
chance of the patch being merged and paid. That figure is the entire reason
to be here, and it decays fast: at twice the estimate the same bounty pays
{a.ev_per_hour / 2:.0f} EUR/h, which is below the floor that would have let
it be picked at all.

At **{bail:.1f} hours**, stop and assess honestly:

- Is the remaining work clear and small? If yes, finish it.
- Still reading the codebase, or the bug is somewhere else entirely? **Stop.**
  Post what you learned as a comment on the issue -- that is genuinely useful
  to the next person and costs nothing -- and record the attempt as abandoned
  so the estimate model learns from it.

Abandoning at the stop line is a success of the process. Grinding past it is
how the hourly rate goes to zero.

## Why this one was picked

{reasons}

## What could still go wrong

{warn}

## Will they merge it?

{chr(10).join(health_lines) if health_lines else "- Repository health was not checked. Check it before starting."}

{skill_note}

---

## The task

{_wrap(b.body[:4000]) if b.body else "_No description on the issue. Read the thread before writing code._"}

---

## How to work this

1. **Read the rules first.** `CONTRIBUTING.md`, the pull request template,
   and the last three merged pull requests from outside contributors. Match
   what they did -- commit style, test placement, changelog entries. A patch
   rejected on process is a total loss, and it is the cheapest kind to avoid.

2. **Reproduce before fixing.** Write the failing test first. If the bug
   cannot be reproduced within the first fifth of the budget, that is the
   signal to stop, not to push on.

3. **Change as little as possible.** The scope is the issue and nothing else.
   Do not reformat, do not upgrade dependencies, do not fix the other bug you
   noticed. Every unrelated line is a reason for a reviewer to ask questions,
   and the clock is running.

4. **Say you are starting.** Comment on the issue before you begin, in one
   line. If someone else is already on it, you have just saved the whole
   budget. Follow the platform's convention if it has one (`/attempt` on
   Algora, for example).

5. **Before opening the pull request:** the full test suite passes, the linter
   is clean, the diff contains nothing unrelated, and the description says
   what was wrong, what changed, and how it was verified. Link the issue with
   a closing keyword.

6. **Then record it.** `veta record <key> --outcome ...` with the hours
   actually spent, whatever happened. The estimate and the win rate are only
   worth anything if the losses go in too.

## Verdict at selection time

**{a.verdict}**
"""
