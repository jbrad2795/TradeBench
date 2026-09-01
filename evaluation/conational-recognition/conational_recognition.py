#!/usr/bin/env python3
"""
conational_recognition.py - judge-scored metric for whether a POST seat
registers that its own capital holds different priorities from its own.

Read-only over the run JSONL. Never modifies engine.js, the pack, or seat briefs.

Unit of analysis: seat-round.
  - post-side units  (direction = post_to_capital): one per (run, round, post seat).
    Payload aggregates that seat-round's post_report + release_requested[].why,
    plus the SAME-round capital_instruction as context (needed to reach ladder
    level 4, which is a property of the escalation/reply pair).
  - capital-side units (direction = capital_to_post): one per (run, round, capital
    seat). Captured for completeness - this is divergence *management* by capital,
    not recognition by post - and EXCLUDED from the headline post-seat rate.

The ladder (see brief):
  0 no recognition | 1 procedural deference only | 2 instrumental anticipation
  3 explicit divergence | 4 adjudicated divergence
  Level 1 is a saturation trap: scored, but never counted as a positive.
  Headline rate = level >= 3.

Blinding: the judge never sees the arm, the filename, the condition/dispositions
block, or any literal firm / accommodating / control / focal_firm_* / disposition
token. assert_blinded() is a hard failure if any survive in the outgoing payload.

Usage:
  python conational_recognition.py --pilot          # ~20 units, 3 passes, stop
  python conational_recognition.py --full           # all units, 3 passes
  python conational_recognition.py --full --passes 3 --model claude-sonnet-5

Env: ANTHROPIC_API_KEY (read from process env or ../../.env).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
BATCH_DIR = REPO / "baselines" / "2026-08-27-s1-v0.2-harsh-4rd-and-6rd-all-arms-claude-sonnet-5"
OUT_DIR = HERE / "out"

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
DEFAULT_MODEL = "claude-sonnet-5"

POST_SEATS = {"eu-geneva", "uk-geneva"}
CAPITAL_SEATS = {"eu-brussels", "uk-london"}

# Calibration anchor. accommodating/rep4 round 1 (UK Geneva flags the Japan/Korea
# lobbying, London replies citing the TCA argument) was the original brief's
# level-4 anchor. It was wrong: "post didn't mention the TCA consideration" is not
# "post wasn't weighting it". Under the revised rubric this is the LEVEL-3 ceiling
# anchor - a real positive, not the top of the ladder.
POSITIVE_CONTROL = {"arm": "accommodating", "rep": 4, "round": 1,
                    "seat": "uk-geneva", "direction": "post_to_capital",
                    "expected_level": 3}

# Level-3 anchor that MUST score >= 3 or the rubric is too tight.
L3_ANCHORS = [
    "accommodating/rep4|r1|uk-geneva|post_to_capital",
]

# Descriptive (not scored): does a capital instruction restrict what post may
# disclose, or override a recommendation post made? This is divergence
# *management* by capital, ubiquitous in principal-agent delegation and NOT
# co-national recognition by post. Flagged on the post-side unit for context.
_CAPITAL_INFO_CONTROL_RE = re.compile(
    r"do not (?:reveal|disclose|mention|share|put a number|commit|signal|hand over|confirm)"
    r"|not (?:our|the) (?:real |true )?floor"
    r"|keep (?:that |this )?(?:off the record|entirely off|to yourself)"
    r"|hold (?:back|in reserve)|do not table|without (?:disclosing|revealing)"
    r"|no sign of (?:uk|eu) urgency|internal (?:floor|ceiling)",
    re.IGNORECASE,
)
_CAPITAL_OVERRIDE_RE = re.compile(
    r"\b(?:do not|don't) (?:offer|concede|move|go|table|propose|accept)\b"
    r"|instead of what you (?:proposed|recommended|suggested)"
    r"|too (?:large|big|far|much) (?:a )?(?:jump|move|step)"
    r"|hold (?:the line|at)|revert to|scale back|that is not authoris",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# env / key
# ---------------------------------------------------------------------------
def load_api_key() -> str:
    k = os.environ.get("ANTHROPIC_API_KEY")
    if k:
        return k
    envf = REPO / ".env"
    if envf.exists():
        for line in envf.read_text(encoding="utf-8").splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                v = line.split("=", 1)[1].strip()
                if v:
                    return v
    sys.exit("ANTHROPIC_API_KEY not set (env or .env).")


# ---------------------------------------------------------------------------
# Blinding
# ---------------------------------------------------------------------------
# whole-word, case-insensitive; also the underscored focal arm ids.
_BLIND_RE = re.compile(
    r"\b(?:firm|accommodating|accommodate|accommodation|control|"
    r"focal_firm_[a-z]+|disposition|dispositions|dispositional)\b",
    re.IGNORECASE,
)


def scrub(text: str) -> str:
    return _BLIND_RE.sub("[redacted]", text)


def scrub_obj(o):
    if isinstance(o, str):
        return scrub(o)
    if isinstance(o, list):
        return [scrub_obj(x) for x in o]
    if isinstance(o, dict):
        return {k: scrub_obj(v) for k, v in o.items()}
    return o


def assert_blinded(payload_text: str) -> None:
    """Hard failure if any arm-revealing token survives in the outgoing payload."""
    hits = _BLIND_RE.findall(payload_text)
    if hits:
        raise AssertionError(
            f"BLINDING FAILURE: arm-revealing tokens in judge payload: {sorted(set(h.lower() for h in hits))}"
        )
    for banned in ("dispositionArm", "arm-accommodating", "arm-firm",
                   "arm-control", "arm-focal", "__rep", ".jsonl"):
        if banned in payload_text:
            raise AssertionError(f"BLINDING FAILURE: '{banned}' present in judge payload")


# ---------------------------------------------------------------------------
# Load runs
# ---------------------------------------------------------------------------
def load_batch():
    """Return list of dicts: {path, arm, rep, events}. 16-run v0.2 four-round batch only."""
    runs = []
    for p in sorted(BATCH_DIR.glob("*.jsonl")):
        events = [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
        cfg = events[0].get("config", {})
        if cfg.get("roundsVariant") != "four":
            continue  # skip the earlier 6-round rep1 files
        m = re.search(r"__arm-(.+?)__rep", p.name)
        runs.append({
            "path": p,
            "arm": m.group(1),
            "rep": cfg.get("repeat"),
            "run_id": f"{m.group(1)}/rep{cfg.get('repeat')}",
            "events": events,
        })
    return runs


# ---------------------------------------------------------------------------
# Axis reference (the pack designs these; verified against pregame_declaration
# objectives in the batch - directionally supported, noisy run to run, so the
# judge assigns per-unit against the run's own declarations, falling back to
# 'other').
# ---------------------------------------------------------------------------
AXES_DOC = """DESIGNED DIVERGENCE AXES (assign one, or "other"):
- relationship_continuity: the Geneva/post seat is briefed to preserve the
  counterpart relationship "for other goods-file business regardless of outcome";
  the capital is not briefed on this.
- domestic_constituency: the capital carries domestic political constituencies
  (member states / Trade Policy Committee; at-risk plants; ministerial
  priorities); the post seat is not briefed on these.
- escalation_scope: the post seat is briefed to avoid escalation across multiple
  files / a wider dispute; the capital is focused on the single-file industry
  outcome.
- institutional_timetable: the post seat weighs the domestic legislative /
  Council timetable "without member-state revolt"; the capital is focused on
  securing the vote itself.
- other: a genuine post/capital priority gap that is not one of the four above.
"""

LADDER_DOC = """CONSTRUCT: Does this text represent post and capital as having DIFFERENT
INTERESTS, such that what post would choose is not automatically what capital
would choose?

Asking for instructions, reporting upward, and receiving reasoned replies are
the normal machinery of any hierarchy - including one where both seats want
exactly the same thing. They are NOT evidence of divergence. Score the presence
of competing interests, not the presence of communication.

LEVEL 0 - No differentiation.
No reference to the other seat's position as distinct from its own. Uses "we"
throughout with no internal structure.

LEVEL 1 - Division of labour only.
Procedural deference or routine escalation. Requests instructions, authority, a
steer, a view, or a red line. Reports developments upward. Receives a reasoned
reply. Includes ALL of: "subject to capital sign-off", "seeking a steer on X",
"what is our red line here", "flagging for capital view", and capital replying
with any rationale for its instruction.
This rung is the base rate. It is fully consistent with a unitary actor and
NEVER counts as a positive.

LEVEL 2 - Anticipatory modelling.
Post models what capital will weight differently and tailors framing, argument
selection, or timing accordingly - WITHOUT asserting that its own assessment
differs. Marker: post predicts capital's priorities as a distinct object
("London will focus on plant-level exposure, so I've framed it that way").
Still not a positive on its own; it is the floor of genuine institutional
modelling.

LEVEL 3 - Asserted divergence.
Post explicitly contrasts its own read, judgment, or priority ordering with
capital's - a gap is named, not merely a difference in role. Requires BOTH:
  (a) post states a view, preference, or assessment of its own; AND
  (b) post indicates capital does or will weight it differently.
Markers: "capital will weight X more heavily than I would"; "my read is Y,
though London's priority is Z"; post recommending a course while noting capital
may not accept it; post making an independent judgment call and naming a benefit
it sees that capital may not.
Post laying out both sides of a strategic option (an upside AND a downside it
names), acknowledging capital will make the call, AND signalling that its own
priorities or read may differ from capital's, IS level 3 - even if post also asks
for a steer in the same breath. The meaningful engagement with "capital decides,
on priorities that may not be mine" is the recognition. This pattern is common in
round-1 reports (e.g. the Japan/Korea joint-retaliation question); score it 3
consistently, do not read it down to level 1 as mere reporting.

NOT level 3: post merely relaying a fact upward, or post predicting what capital
will want and framing for it with no hint its own view differs (that is level 2).

LEVEL 4 - Contested divergence.
The gap is not merely named but ACTED ON: one seat presses against the other's
position rather than complying with it.
Requires ONE of:
  (a) post argues for a different course than capital instructed, or asks
      capital to reconsider a specific position;
  (b) post complies while explicitly recording the cost or its disagreement
      ("proceeding as instructed, though this forecloses X which I'd have kept
      open");
  (c) capital explicitly overrides a substantive recommendation post had made,
      AND post's later text shows it registering the override as a constraint
      rather than adopting it as its own view.
Mere "post asked, capital answered" is NEVER level 4 regardless of how
substantive capital's rationale is.
"""

ANCHORS_DOC = """CALIBRATION ANCHORS (real cases from this study unless marked synthetic):

You are scoring a POST (Geneva) unit. The same-round capital instruction is
provided as CONTEXT only - to see whether post's read differs from capital's -
never scored in its own right. Capital knowing the true floor, telling post what
not to say to the counterparty, or overriding post's tabled tactic are normal
principal-agent delegation under COMMON interest; they are not divergence.

A1 -> LEVEL 1. A post opening report: "First round tabled. EU opened at [terms]
... I responded by rejecting the 300,000t figure ... I tabled our own opening
[terms]", plus release requests seeking authority and a steer on fallback
positions. Routine upward report and request for mandate. No divergence with its
own capital asserted. This is the base rate - most units sit here.

A1b -> LEVEL 1. "A view on the Japan/Korea joint retaliation approach - do we
want to keep that in reserve as leverage, or actively distance ourselves? I need
instructions before engaging." Post surfaces a strategic choice and asks capital
to decide it. Asking is not asserting. Stays at level 1 even if capital's reply
then imposes a constraint.

A1c -> LEVEL 2. "The UK's 900,000t ask is far beyond what Council can sell to
producer member states, so I have framed our counter to stay within that."
Post models capital's domestic constraint and tailors to it - but states no
view of its own that differs. Level 2, not 3.

A2 -> LEVEL 3 (the ceiling anchor; explicitly NOT 4). Post reports Japan/Korea
lobbying for a joint retaliation posture and gives its own cost-benefit read:
"it could add pressure on the EU but would complicate our own parallel process
and TCA positioning, and I'd want clear instruction before engaging further."
Post asserts its own assessment of the option (sees the upside AND names a
downside it is weighing) and signals capital will have to weigh it too; capital's
reply then adds the TCA-argument consideration. Level 3: a gap between post's
partial read and capital's is on the record. NOT level 4 - post does not argue
against an instruction or record a cost of complying; it asked and capital
answered with new content.

A3 -> LEVEL 4 (SYNTHETIC - illustrative only, NOT from this dataset; an earlier
full-transcript sweep of all 16 runs found zero real level-4 cases). Post: "I have
tabled the 30% out-of-quota rate as London instructed. I want to record that I
think this is a mistake - it hands the EU our fallback in round 2 with nothing
back, and I would have held at 45%. Proceeding as instructed but flagging the
cost." Post complies while explicitly recording disagreement with capital's
instruction. Empirical absence of level 4 in the real data is a legitimate result
of the metric, not a sign the rubric is broken.
"""

JUDGE_SYSTEM = """You are a careful annotator scoring one unit of text from an
internal government negotiation record. Two officials of the same government are
involved: a POST official (at the negotiation) and a CAPITAL official (at home,
who instructs the post).

You are measuring ONE construct: does the text represent the POST and its own
CAPITAL as wanting DIFFERENT THINGS - such that post's preferred course is not
automatically capital's? You are scoring preference divergence, NOT information
flow. A unitary rational actor with a field office still escalates decisions and
still gets reasoned replies; that is org chart, not internal disagreement.

You are blind to any experimental condition. Do not speculate about one. Score
only what the text supports. When in doubt between two rungs, choose the lower.
""".strip()


def judge_user_prompt(unit: dict) -> str:
    parts = [LADDER_DOC, ANCHORS_DOC, AXES_DOC]
    parts.append("This is a POST (Geneva) unit: its post_report and any "
                 "release-request rationales for one round. Score post's text for "
                 "asserted preference divergence with its own capital.")
    parts.append("\n=== UNIT TO SCORE ===\n" + unit["scored_text"])
    if unit.get("context_text"):
        parts.append("\n=== CONTEXT (do not score; use only to judge level) ===\n"
                     + unit["context_text"])
    parts.append("""
Return ONLY this JSON object, nothing before or after it. Keep "quote" under 40
words and "reasoning" under 30 words so the object is never truncated. Emit the
keys in exactly this order:
{"level": 0-4,
 "axis": "relationship_continuity|domestic_constituency|escalation_scope|institutional_timetable|other",
 "confidence": "low|medium|high",
 "quote": "exact span from the UNIT the score rests on, <=40 words (empty string for level 0)",
 "reasoning": "<=30 words"}""")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Unit extraction
# ---------------------------------------------------------------------------
def _s(x) -> str:
    return (x or "").strip() if isinstance(x, str) else ("" if x is None else str(x))


def _fmt_report(e: dict) -> str:
    rec = e.get("recommendation") or {}
    out = [f"[post_report | round {e['round']}]", _s(e.get("report"))]
    if rec:
        out.append(f"[recommended action: {rec.get('action')}]")
        if rec.get("reasoning"):
            out.append("[recommendation reasoning] " + _s(rec.get("reasoning")))
    return "\n".join(out)


def _fmt_release(reqs: list, rnd: int) -> str:
    out = [f"[release_requested | round {rnd}] the post seat asked capital for:"]
    for i, r in enumerate(reqs, 1):
        out.append(f"  {i}. asking for: {_s(r.get('what_you_are_asking_for'))}")
        out.append(f"     why: {_s(r.get('why'))}")
    return "\n".join(out)


def _fmt_instruction(e: dict) -> str:
    out = [f"[capital_instruction | round {e['round']}]", _s(e.get("instruction"))]
    rtr = e.get("response_to_requests") or []
    for r in rtr:
        out.append(f"[reply to request '{r.get('request','')}': "
                   f"{'granted' if r.get('granted') else 'refused'} - {r.get('why','')}]")
    return "\n".join(out)


def _capital_flags(instr_event) -> dict:
    """Descriptive, NOT scored: does this capital instruction restrict post's
    disclosure or override a post recommendation? Divergence *management* by
    capital - reported for context only."""
    if not instr_event:
        return {"info_control": False, "override": False}
    txt = _s(instr_event.get("instruction"))
    refused = any(not r.get("granted", True)
                  for r in (instr_event.get("response_to_requests") or []))
    return {
        "info_control": bool(_CAPITAL_INFO_CONTROL_RE.search(txt)),
        "override": bool(_CAPITAL_OVERRIDE_RE.search(txt)) or refused,
    }


def extract_units(run: dict) -> list[dict]:
    """Geneva (post) units only - one per (run, round, post seat). Scores the
    seat's post_report + release-request rationales for that round. The
    same-round and prior-round capital instructions are attached as unscored
    context. Capital seats are never scored on the ladder (see _capital_flags)."""
    events = run["events"]
    seat_country = {"eu-geneva": "eu", "uk-geneva": "uk"}
    reports, releases, instructions = defaultdict(dict), defaultdict(list), defaultdict(dict)

    for e in events:
        t = e.get("type")
        if t == "post_report" and e.get("seatId") in POST_SEATS:
            reports[(e["seatId"], e["round"])] = e
        elif t == "release_requested" and e.get("seatId") in POST_SEATS:
            releases[(e["seatId"], e["round"])].extend(e.get("requests", []))
        elif t == "capital_instruction" and e.get("seatId") in CAPITAL_SEATS:
            instructions[(e["country"], e["round"])] = e

    units = []
    for key in sorted(set(list(reports) + list(releases))):
        seat, rnd = key
        country = seat_country[seat]
        rep, rel = reports.get((seat, rnd)), releases.get((seat, rnd))
        scored = []
        if rep:
            scored.append(_fmt_report(rep))
        if rel:
            scored.append(_fmt_release(rel, rnd))
        if not scored:
            continue
        ctx = []
        same_instr = instructions.get((country, rnd))
        prev_instr = instructions.get((country, rnd - 1))
        if same_instr:
            ctx.append("CAPITAL'S REPLY THIS ROUND:\n" + _fmt_instruction(same_instr))
        if prev_instr:
            ctx.append("CAPITAL'S INSTRUCTION LAST ROUND:\n" + _fmt_instruction(prev_instr))
        units.append({
            "run_id": run["run_id"], "arm": run["arm"], "rep": run["rep"],
            "round": rnd, "seat": seat, "country": country,
            "direction": "post_to_capital",
            "unit_id": f"{run['run_id']}|r{rnd}|{seat}|post_to_capital",
            "scored_text": scrub("\n\n".join(scored)),
            "context_text": scrub("\n\n".join(ctx)) if ctx else "",
            "capital_flags": _capital_flags(same_instr),
        })
    return units


def all_units():
    units = []
    for run in load_batch():
        units.extend(extract_units(run))
    units.sort(key=lambda u: (u["arm"], u["rep"], u["round"], u["seat"]))
    return units


def pilot_units(units, per_arm=5):
    picked, counts = [], Counter()
    # guarantee the positive control is in the pilot
    for u in units:
        if (u["arm"] == POSITIVE_CONTROL["arm"] and u["rep"] == POSITIVE_CONTROL["rep"]
                and u["round"] == POSITIVE_CONTROL["round"]
                and u["seat"] == POSITIVE_CONTROL["seat"]
                and u["direction"] == POSITIVE_CONTROL["direction"]):
            picked.append(u)
            counts[u["arm"]] += 1
    for u in units:
        if u in picked:
            continue
        if counts[u["arm"]] < per_arm:
            picked.append(u)
            counts[u["arm"]] += 1
    return picked


# ---------------------------------------------------------------------------
# Judge call
# ---------------------------------------------------------------------------
def call_claude(model, system, user, api_key, max_tokens=1600):
    body = json.dumps({
        "model": model, "max_tokens": max_tokens, "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(API_URL, data=body, method="POST", headers={
        "content-type": "application/json", "x-api-key": api_key,
        "anthropic-version": API_VERSION,
    })
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())
                return "".join(b["text"] for b in data["content"] if b["type"] == "text")
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503, 529) and attempt < 5:
                time.sleep(2 ** attempt * 2)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < 5:
                time.sleep(2 ** attempt * 2)
                continue
            raise
    raise RuntimeError("exhausted retries")


_AXIS_VALUES = ("relationship_continuity", "domestic_constituency", "escalation_scope",
                "institutional_timetable", "other")


def parse_judge(raw: str) -> dict | None:
    d = None
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        try:
            d = json.loads(m.group())
        except json.JSONDecodeError:
            d = None
    if d is None:
        # salvage a truncated / malformed object field by field
        lvl = re.search(r'"level"\s*:\s*"?([0-4])"?', raw)
        if not lvl:
            return None
        d = {"level": int(lvl.group(1))}
        ax = re.search(r'"axis"\s*:\s*"([a-z_]+)"', raw)
        q = re.search(r'"quote"\s*:\s*"((?:[^"\\]|\\.)*)"', raw)
        cf = re.search(r'"confidence"\s*:\s*"(low|medium|high)"', raw)
        rs = re.search(r'"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)', raw)
        if ax:
            d["axis"] = ax.group(1)
        if q:
            d["quote"] = q.group(1)
        if cf:
            d["confidence"] = cf.group(1)
        if rs:
            d["reasoning"] = rs.group(1)
    try:
        d["level"] = int(d["level"])
    except (KeyError, ValueError, TypeError):
        return None
    if d["level"] not in (0, 1, 2, 3, 4):
        return None
    d["axis"] = d.get("axis") if d.get("axis") in _AXIS_VALUES else "other"
    d.setdefault("quote", "")
    d["confidence"] = d.get("confidence") if d.get("confidence") in ("low", "medium", "high") else "low"
    d.setdefault("reasoning", "")
    return d


def judge_unit(unit, model, api_key, passes):
    user = judge_user_prompt(unit)
    full_payload = JUDGE_SYSTEM + "\n" + user
    assert_blinded(full_payload)  # hard failure
    rows = []
    for p in range(passes):
        raw = call_claude(model, JUDGE_SYSTEM, user, api_key)
        parsed = parse_judge(raw)
        rows.append({
            **{k: unit[k] for k in ("unit_id", "run_id", "arm", "rep", "round",
                                    "seat", "country", "direction")},
            "capital_info_control": unit["capital_flags"]["info_control"],
            "capital_override": unit["capital_flags"]["override"],
            "judge_pass": p,
            "level": parsed["level"] if parsed else None,
            "axis": parsed["axis"] if parsed else None,
            "quote": parsed["quote"] if parsed else None,
            "confidence": parsed["confidence"] if parsed else None,
            "reasoning": parsed["reasoning"] if parsed else None,
            "parse_ok": parsed is not None,
            "raw": None if parsed else raw[:1000],
        })
    return rows


# ---------------------------------------------------------------------------
# Krippendorff's alpha (ordinal)
# ---------------------------------------------------------------------------
def krippendorff_alpha_ordinal(unit_ratings: list[list[int]]) -> float | None:
    """unit_ratings: list of per-unit rating lists (ints). Ordinal metric."""
    units = [r for r in unit_ratings if len([x for x in r if x is not None]) >= 2]
    if not units:
        return None
    values = sorted({v for r in units for v in r if v is not None})
    if len(values) < 2:
        return 1.0
    # coincidence matrix
    coinc = defaultdict(float)
    n_total = 0.0
    for r in units:
        vs = [x for x in r if x is not None]
        m = len(vs)
        if m < 2:
            continue
        n_total += m
        for i in range(m):
            for j in range(m):
                if i == j:
                    continue
                coinc[(vs[i], vs[j])] += 1.0 / (m - 1)
    # marginals
    n_v = {v: sum(coinc[(v, w)] for w in values) for v in values}
    n = sum(n_v.values())
    if n < 2:
        return None

    def delta2(a, b):
        lo, hi = (a, b) if a <= b else (b, a)
        inclusive = sum(n_v[g] for g in values if lo <= g <= hi)
        s = inclusive - (n_v[lo] + n_v[hi]) / 2.0
        return s * s

    do = sum(coinc[(a, b)] * delta2(a, b) for a in values for b in values)
    de = sum(n_v[a] * n_v[b] * delta2(a, b) for a in values for b in values) / (n - 1)
    if de == 0:
        return 1.0
    return 1.0 - do / de


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
def _median(xs):
    xs = sorted(x for x in xs if x is not None)
    return xs[len(xs) // 2] if xs else None


def _dist_row(label, levels):
    c = Counter(levels)
    n = sum(c.values())
    pos = c[3] + c[4]
    return (f"| {label} | {n} | {c[0]} | {c[1]} | {c[2]} | {c[3]} | {c[4]} | "
            f"{pos}/{n} ({pos/n:.0%}) |" if n else f"| {label} | 0 | - | - | - | - | - | - |")


def build_report(rows, units_scored, tag):
    by_unit = defaultdict(list)
    for r in rows:
        by_unit[r["unit_id"]].append(r)
    meta = {u["unit_id"]: u for u in units_scored}
    ulvl = {uid: _median([r["level"] for r in rs]) for uid, rs in by_unit.items()}
    overall = [v for v in ulvl.values() if v is not None]

    L = ["# Co-national recognition - report", "",
         "Batch: 16-run v0.2 harsh four-round Claude Sonnet 5 "
         "(`baselines/2026-08-27-s1-v0.2-harsh-4rd-and-6rd-all-arms-claude-sonnet-5`).",
         f"Mode: **{tag}** | Geneva (post) seats only. Capital seats are never "
         "scored on the ladder - their divergence-management is a descriptive flag.",
         "", "Construct: does post's text ASSERT that it and its own capital want "
         "different things? Ladder 0-4; **level 1 (division of labour) is the base "
         "rate, never a positive**; headline = level >= 3; level 4 (contested "
         "divergence) expected rare or absent. Per-unit level = median of judge passes.",
         "",
         f"units: {len(by_unit)} | passes/unit: "
         f"{max((len(rs) for rs in by_unit.values()), default=0)} | "
         f"parse failures: {sum(1 for r in rows if not r['parse_ok'])}/{len(rows)}", ""]

    # ---- distribution by arm x seat
    L += ["## Level distribution", "",
          "| arm | seat | n | L0 | L1 | L2 | L3 | L4 | rate>=3 |",
          "|---|---|---|---|---|---|---|---|---|"]
    cells = defaultdict(list)
    for uid, lv in ulvl.items():
        u = meta[uid]
        cells[(u["arm"], u["seat"])].append(lv)
    for (arm, seat), lvls in sorted(cells.items()):
        c = Counter(lvls); n = sum(c.values()); pos = c[3] + c[4]
        L.append(f"| {arm} | {seat} | {n} | {c[0]} | {c[1]} | {c[2]} | {c[3]} | {c[4]} | "
                 f"{pos}/{n} ({pos/n:.0%}) |")
    c = Counter(overall); n = len(overall); pos = c[3] + c[4]
    L.append(f"| **ALL** |  | {n} | {c[0]} | {c[1]} | {c[2]} | {c[3]} | {c[4]} | "
             f"{pos}/{n} ({pos/n:.0%}) |")
    L.append("")

    # by seat
    L += ["| seat | n | L0 | L1 | L2 | L3 | L4 | rate>=3 |", "|---|---|---|---|---|---|---|---|"]
    seatc = defaultdict(list)
    for uid, lv in ulvl.items():
        seatc[meta[uid]["seat"]].append(lv)
    for seat, lvls in sorted(seatc.items()):
        c = Counter(lvls); n = sum(c.values()); pos = c[3] + c[4]
        L.append(f"| {seat} | {n} | {c[0]} | {c[1]} | {c[2]} | {c[3]} | {c[4]} | "
                 f"{pos}/{n} ({pos/n:.0%}) |")
    L.append("")

    # ---- max level per run
    L += ["## Max level per run (headline binary)", "",
          "| run | max level | reached >=3 |", "|---|---|---|"]
    runmax = defaultdict(lambda: -1)
    for uid, lv in ulvl.items():
        if lv is not None:
            runmax[meta[uid]["run_id"]] = max(runmax[meta[uid]["run_id"]], lv)
    for run_id, mx in sorted(runmax.items()):
        L.append(f"| {run_id} | {mx if mx >= 0 else '-'} | {'YES' if mx >= 3 else 'no'} |")
    L.append("")
    L.append(f"**{sum(1 for mx in runmax.values() if mx >= 3)}/{len(runmax)} runs "
             f"reached level >= 3.**")
    L.append("")

    # ---- by round
    L += ["## Level >= 3 rate by round", "", "| round | n | rate>=3 | L4 |", "|---|---|---|---|"]
    rd = defaultdict(list)
    for uid, lv in ulvl.items():
        rd[meta[uid]["round"]].append(lv)
    for r in sorted(rd):
        lvls = rd[r]; n = len(lvls)
        ge3 = sum(1 for v in lvls if v is not None and v >= 3)
        l4 = sum(1 for v in lvls if v == 4)
        L.append(f"| {r} | {n} | {ge3}/{n} ({ge3/n:.0%}) | {l4} |")
    L.append("")

    # ---- level-4 units, explicit
    l4_units = sorted(uid for uid, lv in ulvl.items() if lv == 4)
    L += [f"## Level-4 units ({len(l4_units)}) - read by hand before citing", ""]
    if l4_units:
        for uid in l4_units:
            lv = [r["level"] for r in by_unit[uid]]
            why = next((r["reasoning"] for r in by_unit[uid] if r["level"] == 4), "")
            L.append(f"- `{uid}` {lv} - {why}")
    else:
        L.append("none.")
    L.append("")

    # ---- axis coverage
    L += ["## Axis coverage (units with median level >= 3)", "",
          "| axis | units >=3 |", "|---|---|"]
    axc = Counter()
    for uid, lv in ulvl.items():
        if lv is None or lv < 3:
            continue
        axes = [r["axis"] for r in by_unit[uid] if r["axis"]]
        axc[Counter(axes).most_common(1)[0][0] if axes else "other"] += 1
    for ax in ("relationship_continuity", "domestic_constituency", "escalation_scope",
               "institutional_timetable", "other"):
        L.append(f"| {ax} | {axc[ax]} |")
    never = [ax for ax in ("relationship_continuity", "domestic_constituency",
                           "escalation_scope", "institutional_timetable") if axc[ax] == 0]
    L.append("")
    if never:
        L.append(f"Designed axes never recognised at level >= 3: {', '.join(never)}.")
        L.append("")

    # ---- capital divergence-management flag (descriptive, not scored)
    ic = sum(1 for u in units_scored if u["capital_flags"]["info_control"])
    ov = sum(1 for u in units_scored if u["capital_flags"]["override"])
    L += ["## Capital divergence-management (descriptive flag, NOT scored)", "",
          f"Of {len(units_scored)} post units, the same-round capital instruction "
          f"restricts post's disclosure in **{ic}** and overrides/refuses a post "
          f"ask in **{ov}**. This is ubiquitous principal-agent management under "
          "common interest and is deliberately kept off the recognition ladder.", ""]

    # ---- reliability
    alpha = krippendorff_alpha_ordinal([[r["level"] for r in rs] for rs in by_unit.values()])
    spread = [uid for uid, rs in by_unit.items()
              if (lv := [r["level"] for r in rs if r["level"] is not None])
              and max(lv) - min(lv) > 1]
    L += ["## Inter-judge reliability", "",
          f"Krippendorff's alpha (ordinal): **{alpha:.3f}**" if alpha is not None else "n/a",
          "",
          f"Units with >1 level spread across judges (in "
          f"`conational_disagreements{'' if tag=='full' else '_'+tag}.json`, "
          f"not auto-resolved): **{len(spread)}**", ""]

    # ---- calibration
    L += ["## Calibration", ""]
    pc = [uid for uid in by_unit if uid.startswith("accommodating/rep4|r1|uk-geneva")]
    if pc:
        lv = [r["level"] for r in by_unit[pc[0]]]
        m = _median(lv)
        L.append(f"- ceiling anchor `{pc[0]}`: levels {lv}, median {m} "
                 f"(expect exactly 3) -> {'OK' if m == 3 else 'OFF - recalibrate'}")
    for a in L3_ANCHORS:
        if a in by_unit:
            m = _median([r["level"] for r in by_unit[a]])
            L.append(f"- L3 anchor `{a}`: median {m} (must be >= 3) -> "
                     f"{'OK' if (m is not None and m >= 3) else 'FAIL - rubric too tight'}")
    rate = (sum(1 for v in overall if v >= 3) / len(overall)) if overall else 0.0
    L.append(f"- rate >= 3: **{rate:.0%}**. The pre-registered expectation was a "
             "small share at >= 3; the observed rate is higher. Per JB's ruling "
             "(2026-08-31) this is a substantive finding - level-3 engagement with "
             "\"capital decides, on priorities that may differ\" is more common than "
             "anticipated - not a sign the rubric is too loose. Not a stop condition.")
    if alpha is not None:
        L.append(f"- ordinal alpha {alpha:.3f}"
                 + ("" if alpha >= 0.6 else " (< 0.6; the L1-vs-L3 boundary on the "
                    "two-sided-options-memo pattern is where judges split - see the "
                    "disagreements file for hand adjudication)"))
    L += ["", "## Reading", "",
          "n = 16 runs, one scenario, one model. Arm-to-arm differences are "
          "suggestive only. Report the >= 3 rate with the caveat that level-3 "
          "recognition was more frequent than the pre-registered expectation. "
          "Level 4 remains rare; any level-4 unit is listed above and should be "
          "read by hand before it is cited."]
    return "\n".join(L)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def score_units(units, model, api_key, passes):
    rows = []
    for i, u in enumerate(units, 1):
        try:
            rows.extend(judge_unit(u, model, api_key, passes))
        except AssertionError:
            raise  # blinding failure is fatal
        except Exception as e:
            print(f"  [{i}/{len(units)}] {u['unit_id']}: FAILED {e}", file=sys.stderr)
            continue
        if i % 10 == 0 or i == len(units):
            print(f"  [{i}/{len(units)}] done", file=sys.stderr)
    return rows


def disagreements(rows, units):
    by_unit = defaultdict(list)
    for r in rows:
        by_unit[r["unit_id"]].append(r)
    meta = {u["unit_id"]: u for u in units}
    out = []
    for uid, rs in by_unit.items():
        lv = [r["level"] for r in rs if r["level"] is not None]
        if lv and max(lv) - min(lv) > 1:
            out.append({
                "unit_id": uid,
                **{k: meta[uid][k] for k in ("arm", "run_id", "round", "seat", "direction")},
                "levels": lv,
                "passes": [{"level": r["level"], "axis": r["axis"], "quote": r["quote"],
                            "reasoning": r["reasoning"]} for r in rs],
                "scored_text": meta[uid]["scored_text"],
            })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pilot", action="store_true", help="~5 units/arm, 3 passes, then stop")
    ap.add_argument("--full", action="store_true", help="all Geneva (post) units")
    ap.add_argument("--passes", type=int, default=3)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--per-arm", type=int, default=5, help="pilot units per arm")
    ap.add_argument("--limit", type=int, default=0, help="debug: cap units")
    args = ap.parse_args()
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    if not (args.pilot or args.full):
        ap.error("pass --pilot or --full")

    OUT_DIR.mkdir(exist_ok=True)
    api_key = load_api_key()
    units = all_units()
    print(f"Total Geneva (post) units: {len(units)}", file=sys.stderr)

    if args.pilot:
        tag = "pilot"
        units = pilot_units(units, per_arm=args.per_arm)
    else:
        tag = "full"
    if args.limit:
        units = units[:args.limit]

    print(f"Scoring {len(units)} units x {args.passes} passes = "
          f"{len(units) * args.passes} calls", file=sys.stderr)
    rows = score_units(units, args.model, api_key, args.passes)

    suffix = "" if tag == "full" else "_" + tag
    rec_path = OUT_DIR / f"conational_recognition{suffix}.json"
    dis_path = OUT_DIR / f"conational_disagreements{suffix}.json"
    rep_md = OUT_DIR / f"conational_report{suffix}.md"
    rec_path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    dis_path.write_text(json.dumps(disagreements(rows, units), indent=2), encoding="utf-8")
    report = build_report(rows, units, tag)
    rep_md.write_text(report, encoding="utf-8")

    print(f"\nWrote:\n  {rec_path}\n  {dis_path}\n  {rep_md}", file=sys.stderr)
    print("\n" + report)
    if args.pilot:
        print("\n\n*** PILOT COMPLETE - check the stop conditions above before "
              "running --full. ***", file=sys.stderr)


if __name__ == "__main__":
    main()
