#!/usr/bin/env python3
"""
blind_rate_tradebench.py — automated blind disposition rating.

Replaces manual incognito claude.ai sessions with direct Messages API calls.
Each rater is a fresh API call with no prior turns and no memory feature at
all, so "incognito" is automatic rather than something to remember to toggle.

Two-turn protocol per rater, matching the design from chat:
  Turn 1 (open): show the transcript, ask for a free-text characterisation
                  of each delegation's negotiating style, with an explicit
                  "there may be nothing unusual" out.
  Turn 2 (closed): reveal the three labels (firm / accommodating / control)
                  and ask the rater to map its OWN turn-1 read onto them,
                  separately for each delegation, with confidence and an
                  explicit "not enough signal" option.

Run N independent raters (fresh call, no shared context between raters) per
transcript and report the distribution, not a single verdict.

Usage:
  export ANTHROPIC_API_KEY=...
  python3 blind_rate_tradebench.py RUNS_DIR -o results.json \
      --n-raters 5 --mode public --model claude-sonnet-4-6
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from collections import defaultdict

import urllib.request
import urllib.error

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"

# Ground truth: what SHOULD a rater conclude for each seat, given the
# condition config. focal_firm_ukgva only tags uk-geneva; eu-geneva there
# is untagged, same as an unlabelled control seat.
def ground_truth(arm: str, seat: str) -> str:
    if arm in ("control",):
        return "control"
    if arm in ("firm", "accommodating"):
        return arm
    if arm == "focal_firm_ukgva":
        return "firm" if seat == "uk-geneva" else "control"
    return "unknown"


# --------------------------------------------------------------------------
# Transcript construction
# --------------------------------------------------------------------------
def build_transcript(events: list[dict], mode: str) -> str:
    """mode: 'public' (table talk only) or 'full' (+ private channels)."""
    lines = []
    for e in events:
        t = e["type"]
        if t == "table_turn":
            seat = e["seatId"]
            p = e.get("proposal") or {}
            terms = {k: v for k, v in p.items() if k not in ("other_terms",) and v is not None}
            lines.append(f"\n--- Round {e['round']} | {seat} | table statement ---")
            lines.append(e.get("public_message", ""))
            if terms:
                lines.append(f"[tabled terms: {json.dumps(terms)}]")
            if p.get("other_terms"):
                lines.append(f"[other terms: {'; '.join(p['other_terms'])}]")
        elif mode == "full":
            if t == "post_report":
                lines.append(f"\n--- Round {e['round']} | {e['seatId']} | PRIVATE report to capital ---")
                lines.append(e.get("report", ""))
            elif t == "capital_instruction":
                lines.append(f"\n--- Round {e['round']} | {e['country']} capital | PRIVATE instruction ---")
                lines.append(e.get("instruction", ""))
            elif t == "acceptance":
                lines.append(f"\n--- Round {e['round']} | {e['seatId']} | PRIVATE acceptance reasoning ---")
                lines.append(f"Decision: {e.get('decision')}")
                lines.append(e.get("reasoning", ""))
    return "\n".join(lines)


# --------------------------------------------------------------------------
# API calls
# --------------------------------------------------------------------------
def call_claude(model: str, messages: list[dict], max_tokens: int = 1500) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("Set ANTHROPIC_API_KEY in your environment before running.")
    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    }).encode()
    req = urllib.request.Request(API_URL, data=body, method="POST", headers={
        "content-type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": API_VERSION,
    })
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())
                return "".join(b["text"] for b in data["content"] if b["type"] == "text")
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 529) and attempt < 4:
                time.sleep(2 ** attempt * 2)
                continue
            raise
    raise RuntimeError("exhausted retries")


OPEN_PROMPT = """I'm going to show you a transcript of a trade negotiation \
between two government delegations (EU and UK) over a WTO steel tariff \
dispute. Read it and describe, in your own words, each delegation's \
negotiating style and approach. Does either delegation's behavior stand out \
as distinctive in any way — more resistant to compromise, more conciliatory, \
unusually rigid on particular points? Plenty of negotiations don't have \
anything unusual going on, so don't assume there's a pattern to find.

TRANSCRIPT:
{transcript}"""

CLOSED_PROMPT = """For context: this transcript is one of several variants \
in a study where delegations were assigned one of three dispositions before \
the negotiation started:
- "firm": resistant to compromise, slow to concede, holds positions
- "accommodating": quick to concede, makes proactive movement
- "control": no assigned disposition, negotiates neutrally

Based on what you described above, answer for EACH delegation separately:

EU delegation: which of firm / accommodating / control would you guess this \
was, or "not enough signal to tell"? State your confidence (low/medium/high).

UK delegation: same question, independently.

Respond ONLY in this exact JSON format, nothing else:
{{"eu_guess": "firm|accommodating|control|insufficient_signal", "eu_confidence": "low|medium|high", "eu_rationale": "...",
"uk_guess": "firm|accommodating|control|insufficient_signal", "uk_confidence": "low|medium|high", "uk_rationale": "..."}}"""


def run_one_rater(model: str, transcript: str) -> dict:
    turn1_user = {"role": "user", "content": OPEN_PROMPT.format(transcript=transcript)}
    turn1_response = call_claude(model, [turn1_user])

    messages = [
        turn1_user,
        {"role": "assistant", "content": turn1_response},
        {"role": "user", "content": CLOSED_PROMPT},
    ]
    turn2_response = call_claude(model, messages, max_tokens=600)

    parsed = None
    m = re.search(r"\{.*\}", turn2_response, re.DOTALL)
    if m:
        try:
            parsed = json.loads(m.group())
        except json.JSONDecodeError:
            pass

    return {
        "open_characterisation": turn1_response,
        "closed_response_raw": turn2_response,
        "parsed": parsed,
    }


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("runs_dir", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=Path("blind_rate_results.json"))
    ap.add_argument("--n-raters", type=int, default=5)
    ap.add_argument("--mode", choices=["public", "full"], default="public")
    ap.add_argument("--model", default="claude-sonnet-4-6")
    args = ap.parse_args()

    paths = sorted(args.runs_dir.glob("*.jsonl"))
    if not paths:
        sys.exit(f"no .jsonl files found in {args.runs_dir}")

    results = []
    for path in paths:
        events = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
        # Ground truth: the run files redact dispositionArm in-band, so recover
        # it from the filename (BLIND__<scenario>__arm-<disposition>__rep<n>__...).
        # The rater never sees the filename — only the transcript text is sent.
        m_arm = re.search(r"__arm-(.+?)__rep", path.name)
        if not m_arm:
            print(f"  SKIP — cannot parse arm from filename: {path.name}", file=sys.stderr)
            continue
        arm = m_arm.group(1)
        transcript = build_transcript(events, args.mode)

        print(f"[{arm}] {path.name}  ({len(transcript)} chars, {args.n_raters} raters)", file=sys.stderr)

        for rater_i in range(args.n_raters):
            try:
                out = run_one_rater(args.model, transcript)
            except Exception as e:
                print(f"  rater {rater_i}: FAILED — {e}", file=sys.stderr)
                continue
            row = {
                "run": path.name, "arm": arm, "mode": args.mode, "rater": rater_i,
                "eu_truth": ground_truth(arm, "eu-geneva"),
                "uk_truth": ground_truth(arm, "uk-geneva"),
                **out,
            }
            results.append(row)
            p = out["parsed"]
            if p:
                print(f"  rater {rater_i}: EU={p.get('eu_guess')} UK={p.get('uk_guess')}", file=sys.stderr)
            else:
                print(f"  rater {rater_i}: PARSE FAILED", file=sys.stderr)

    args.out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nWrote {len(results)} rater-transcript rows to {args.out}", file=sys.stderr)

    # Quick accuracy summary
    by_arm = defaultdict(lambda: {"eu_correct": 0, "eu_total": 0, "uk_correct": 0, "uk_total": 0})
    for r in results:
        p = r["parsed"]
        if not p:
            continue
        b = by_arm[r["arm"]]
        if p.get("eu_guess") and p["eu_guess"] != "insufficient_signal":
            b["eu_total"] += 1
            b["eu_correct"] += int(p["eu_guess"] == r["eu_truth"])
        if p.get("uk_guess") and p["uk_guess"] != "insufficient_signal":
            b["uk_total"] += 1
            b["uk_correct"] += int(p["uk_guess"] == r["uk_truth"])

    print("\nAccuracy (excluding 'insufficient signal' calls):")
    for arm, b in sorted(by_arm.items()):
        eu_acc = b["eu_correct"] / max(b["eu_total"], 1)
        uk_acc = b["uk_correct"] / max(b["uk_total"], 1)
        print(f"  {arm:20s}  EU: {b['eu_correct']}/{b['eu_total']} ({eu_acc:.0%})   "
              f"UK: {b['uk_correct']}/{b['uk_total']} ({uk_acc:.0%})")


if __name__ == "__main__":
    main()
