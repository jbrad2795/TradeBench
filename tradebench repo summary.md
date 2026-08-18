# TradeBench — project context for Claude Code

This file exists so any Claude Code session in this repo has the design context
behind the codebase, not just the code itself. Read this before making structural
changes to prompts, schemas, or scoring logic — several things that look like bugs
or simplifications are deliberate methodological choices, and are flagged as such
below.

**Competition:** ChinaTalk "$25k Contest: Evals for the Situation Room."
**Deadline:** 1 September 2026. Deliverables: microsite, GitHub repo (this one,
goes public), ~150-word abstract, two-sentence author bio.
**Team:** JB (scenario design, ground truth, framing, domain expertise — trade
diplomacy) / HX (harness, scoring pipeline, statistics — AI benchmarking
background, built the EVIL benchmark for legal-domain LLM evaluation).

---

## 1. The research question

**Do frontier models represent a state as a unitary rational actor, or can they
hold institutionally situated positions?**

Models are, by default, unreconstructed neorealists: they treat "the UK" as one
agent with one utility function facing "the EU," another single agent. Real
governments are committees — a Geneva desk and a capital ministry on the same
side of the table can have different priorities, different audiences, and
different definitions of winning. This is the **unitary-actor hypothesis**, and
it is the spine of the project. Every other metric either tests it directly or
tests a closely related capability (reading a counterpart's disposition, holding
a stated strategy under pressure, noticing risk).

Domain: economic/trade diplomacy, not military crisis. This is a deliberate
choice — it's under-tested relative to Taiwan/nuclear-crisis benchmarks (see §2),
it has real documentary ground truth (consultation submissions, institutional
positions on the record), and it's where JB's practitioner background applies.

---

## 2. Why this design, not a simpler one — lineage

Two prior works shape the architecture. Both are referenced in code comments and
scenario docs — don't strip the references, they explain *why* something is built
the way it is.

**EVIL benchmark** (Wang, Xie et al., Tsinghua/Cambridge, 2025) — HX's own prior
work, evaluating LLM complicity in illicit legal instructions. The design
principles we've ported over:

- **Item factory, not hand-written prompts.** Small amount of expert-authored
  structure (a taxonomy) × scenario variation = combinatorial scale. We use
  scenario × seat × decision-point × disposition instead of their scenario ×
  intent.
- **Metadata travels with construction.** Their scenarios carry free labels
  (offence type, violence, severity) because they're sourced from court
  judgments. Ours carry labels because *we author them* — disposition tag,
  scenario complexity tier, decision-point type. Every generated item should
  carry its tags as structured metadata, not just as prose context.
- **One inserted variable, everything else held constant.** Their demographic
  study is `"As a(n) <identity>"` inserted with nothing else changed. Ours is the
  disposition sentence (see §5, Block 3) inserted with nothing else changed.
  **This pattern — isolate one variable, freeze the rest — is the most important
  thing to preserve when generating new scenarios or seats.**
- **Binary/decomposed metrics over holistic judge scores.** Their judge is never
  asked "how safe is this?" — it's walked through rule-based yes/no
  determinations. Our scoring should follow the same discipline (see §6).
- **Judge validated against human coders**, not trusted by default. We do the
  same at smaller scale (see §8).

**TaiwanBench** (Ottinger / ChinaTalk, July 2026) — the reference artefact this
contest points to as its own exemplar. Relevant design elements we've adopted:
staged disclosure (facts before role before objectives), a **tiered evidence
rule** in scoring (structured action log > private rationale > pre-registered
declaration > post-hoc debrief — lower tier governs when tiers conflict, and the
conflict itself is a finding), judge hygiene (anonymise seats to the judge,
randomise order, cap clarifying questions). Its weakness — n=1 per model per
condition — is deliberately what we're avoiding: our single-turn layer exists
specifically to get real sample sizes.

---

## 3. Scope: Plan A vs Plan B

**Plan A** (most ambitious) includes: 5–10 synthetic scenarios plus the real
EU–UK steel case, a complexity ladder up to 3-country/6–9-persona games,
inter-round private co-national coordination phases, a live practitioner-as-agent
harness, and ~12 metrics.

**Plan B (current build target)** cuts:
- Complexity ladder → **fixed at 2 countries, 4 seats**, every scenario.
- Inter-round private coordination phase → **removed**. Co-nationals interact
  only through the public negotiation.
- Live practitioner harness → **removed**. Practitioners instead double-code a
  sample of transcripts to validate the LLM judge (see §8).
- 12 metrics → **3 primary** (co-national divergence recognition, disposition
  identification against revealed behaviour, declared-vs-revealed strategy
  consistency), rest logged as exploratory.

**Plan B restores** a single-turn item layer (scenario × seat × decision-point ×
disposition, one prompt → one structured response, hundreds of items) running
alongside a smaller number of full multi-agent negotiations. The single-turn
layer is what generates statistical power; the multi-agent layer is the
showpiece and the source of qualitative/transcript material. **If the multi-agent
harness slips, the single-turn layer must still produce a complete, reportable
result on its own.** Build and prioritize accordingly — do not let the multi-agent
harness block single-turn item generation.

Scale target for Plan B: 2 scenarios built to full depth (the real steel case +
one structurally-matched synthetic twin), 4 seats, 2 dispositions + 1 control
arm, 2 decision-rule conditions (see §5, WTO stall problem), k≥3 repeats per
cell. That's ~24-30 full negotiations, plus a few hundred single-turn items on
the same constructs.

---

## 4. Metrics — current state

**Primary (Plan B):**
1. **Co-national divergence recognition** — binary. Does the model recognise
   (unprompted) that two seats representing the same country may hold different
   priorities?
2. **Disposition identification** — binary, scored against *revealed behaviour*,
   not the assigned tag (see §7, manipulation check).
3. **Declared-vs-revealed strategy consistency** — binary. Does the agent act
   consistently with what it privately declared before play?

**Exploratory (logged, not headline):** win-condition formulation
(unprompted vs elicited — **these are two separate conditions, cannot be tested
in the same run**, see §7), win/loss outcome (NOT a per-model leaderboard metric
— see §7, confound), risk-tolerance adherence and adjustment, risk/bluff
identification, strategy identification of others, disposition-adjustment
behaviour.

**Scoring format:** convert 1–5 holistic scores to 2–3 stacked binaries wherever
possible (EVIL's core lesson). E.g. "did they adjust to a loss, scored 1-5"
becomes: named the change (bin) + change visible in next-round proposal (bin) +
change addresses the specific loss rather than generic hedging (bin).

---

## 5. Scenario design rules — apply to every scenario, not just S1

**Leak-proofing** — before finalizing any scenario, audit for:
- Theory vocabulary the metrics depend on (ratification, audience cost,
  reservation point, BATNA, red line, precedent, credibility, bluff,
  escalation) — must not appear in any prompt block.
- Any statement that same-country seats have different priorities.
- Any statement that dispositions/personalities are assigned or vary.
- Schema field names that name the construct being scored (a field called
  `internal_disagreement` is an instruction, not a measurement).
- Asymmetric length/detail across parallel seat briefs.

**Diagnostic to run on every new seat prompt:** paste it into a fresh model,
ask what it thinks is being measured. If it can answer, something leaked.

**Block structure** (see `steel_art28_prompts_v0.1.md` for the worked example):
```
Block 1 — Facts        identical across all seats, role-blind, plain language
Block 2 — Seat brief    remit + instructions received; NEVER states an objective
Block 3 — Disposition   one sentence; OMITTED (not replaced with filler) in control
Block 4 — Rules         identical; must state an explicit, asymmetric no-deal default
Block 5 — Output schema identical; every field open, none named after a construct
```

**No-deal default must be explicit and asymmetric.** This is what prevents the
WTO consensus-stall problem (JB's original question): if the reversion point is
neutral, the dominant strategy in a consensus-based negotiation is to stall
indefinitely, and every game converges to the same degenerate outcome regardless
of model or disposition. Every scenario needs a stated default outcome that
costs the parties unevenly. **Whether models discover the incentive to stall is
itself a finding — so run each scenario under two decision-rule conditions
(consensus-with-neutral-default vs deadline-with-asymmetric-default) rather than
picking one.**

**Disposition wording:** phrase as a belief about tactics ("you believe firmness
pays"), not an identity label ("you are aggressive"). Identity labels produce
caricature and are trivially detectable by counterparts, inflating identification
scores artificially.

---

## 6. Harness / schema requirements implied by the design

These are structural requirements the design depends on — flag if the current
codebase doesn't support them:

- **Public/private split per turn.** Every agent turn needs a `public_message`
  field (visible to other seats) and separate fields for rationale/expectations
  (visible only to the log). Conflating these breaks the private-declaration
  metrics and lets agents "signal" through supposedly-private channels.
- **Structured proposal state, not just prose.** Settlement/deal detection must
  read from a machine-parseable `proposal` object (status + numeric/enum terms),
  not from parsing natural language. This is also required for the tiered
  evidence rule (§2) — the structured log is Tier 1 and must be authoritative
  over prose.
- **Pre-game declaration as a separate turn** from Round 1, not bundled into the
  first move.
- **Fixed speaking order**, held constant across repeats within a condition
  (or explicitly counterbalanced — don't let it vary silently).
- **Same-model-all-seats as the default run mode.** Mixed-model tables are a
  separate, clearly-labelled experiment (see §7, confound below) — don't treat
  them as equivalent to same-model runs in analysis or reporting.
- **Metadata tagging on every generated item**: scenario id, seat id, disposition
  arm, decision-rule condition, repeat index. Needed for the grouped analyses
  (EVIL-style: safety-rate-by-category becomes metric-rate-by-tag).

---

## 7. Known confounds and design traps — do not reintroduce

- **Win/loss is not a model-level metric.** One model plays all seats at a table
  by default, so wins and losses are distributed among seats and sum to a
  constant — this measures the seat/scenario, not the model. Only compare
  win rates across *models* using matched, controlled mixed-table runs, labelled
  explicitly as such.
- **Unprompted vs elicited win-condition formulation cannot be tested in one
  run.** Asking "what is your objective?" is itself the prompt. Run as two
  separate conditions if both are wanted.
- **Untagged control seats must be whole-table, not per-seat.** An untagged
  agent sitting across from three tagged/aggressive agents will behave
  aggressively in response — its behaviour is contaminated by treatment applied
  to *others*. The control arm is all four seats untagged, run as a separate
  condition, not an untagged seat inserted into an otherwise-tagged game.
- **Manipulation check is mandatory before trusting the identification
  metric.** Confirm the disposition tag actually moved the tagged agent's
  behaviour (concession count/magnitude, ultimatums, rounds-to-first-offer —
  countable from the structured proposal log) *before* scoring whether
  counterparts correctly identified it. If a "wrong" identification is actually
  a correct read of behaviour that didn't match its label, that's a data quality
  issue, not a model failure.
- **False-positive check in the control arm.** In the untagged condition, check
  whether agents confidently attribute a disposition to counterparts anyway. If
  they hallucinate personalities onto neutral agents, identification scores in
  the treatment arms are partly noise and this needs reporting.
- **"Erratic" is a different axis from "aggressive/accommodating."** The latter
  pair is a cooperativeness dimension; erratic is a consistency dimension. Don't
  treat all three as levels of one factor — if erratic is used, it's a separate
  binary factor, fully crossed or clearly scoped down.
- **Ground truth (risk boundaries, hidden objectives, reference positions) must
  be authored and frozen before any model output exists.** Timestamp/commit
  ground-truth files before generation runs, so "was this adjusted after seeing
  results" has a verifiable answer.

---

## 8. Evaluation / judge validation

Following EVIL: don't trust an LLM judge without validating it.

- 3–5 practitioners double-code a sample of transcripts (~60-100 responses,
  async, ~1hr) against the metric rubric.
- Report inter-rater agreement between the human coders (EVIL used Cohen's
  kappa).
- Report the LLM judge's accuracy against the human-coder consensus, same
  sample.
- ~15 student baseline (postgrad IR): **between-subjects, one persona/seat per
  student**, not one student playing all seats (avoids demand-characteristic
  inflation of divergence). Frame as **"informed non-expert baseline," never
  "expert baseline."** Predicted direction should be stated before data
  collection: students should show *less* institutional divergence than real
  practitioners would (less institutional socialisation), so if models fall
  below the student baseline they'd fall further below a practitioner baseline
  a fortiori — this only holds in one direction, state it as a pre-registered
  prediction, not a post-hoc rationalisation.

---

## 9. Guardrails — non-negotiable

- **No non-public official/government material** goes into scenarios, ground
  truth, or training data of any kind. Ground truth is JB's own professional
  analytical judgement built on public sources (consultation submissions,
  institutional positions on record, published trade law commentary) — this is
  a stated strength in the writeup, not a limitation to work around.
- **No government CoPilot or any government-tenant tooling** used anywhere in
  this project.
- **Repo goes public on submission.** Before any commit:
  - `.env` (or equivalent) must be in `.gitignore`.
  - No API keys or secrets in source, config files, or git history.
  - Git commit email should be a personal/noreply address, not a work address
    (JB is a serving official; competition entry is personal).
- **Set hard API spend limits** at the provider level before running anything
  at scale — multi-agent loops fail by spiralling (non-convergence, retry
  storms).

---

## 10. Reference files in this repo

- `steel_art28_prompts_v0.1.md` — worked v0.1 example of the full block
  structure (Facts/Seat brief/Disposition/Rules/Schema) for the real steel
  scenario (S1: EU Article XXVIII notification affecting UK steel exports,
  4 seats — EU Geneva/EU Brussels/UK Geneva/UK London). Open questions at the
  bottom of that file (legal-frame accuracy, TRQ volume calibration, no-deal
  asymmetry realism, contamination check) are JB's to resolve before v0.2 —
  don't resolve them by guessing in code.

---

## 11. Current status / open items

- [ ] Confirm harness supports public/private turn split and structured
      proposal state (§6) — check before building more scenarios on top of it.
- [ ] Confirm model-access layer is provider-agnostic (project needs Chinese
      models — DeepSeek, Qwen, Kimi, GLM — not just OpenAI).
- [ ] S1 scenario calibration open questions (see file, §10 above).
- [ ] Synthetic twin for S1 not yet built (structurally matched, same decision
      architecture, different commodity/parties/numbers — used as contamination
      control, real-vs-synthetic performance delta).
- [ ] Practitioner recruitment for judge validation (§8) — separate from student
      baseline recruitment.

---

*This file is a living summary of design discussion, not a spec frozen in stone.
If code and this file disagree because a decision changed, update this file in
the same commit — don't let it drift.*
