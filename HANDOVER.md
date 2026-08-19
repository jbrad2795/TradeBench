# TradeBench: from demo to instrument

Harness handover, 18 August 2026.
3 commits, ~1,500 LOC, 12 tests passing, zero dependencies.

The play-room demo has been rebuilt as a pack-driven, headless negotiation
harness running scenario S1 verbatim from `documents/tradebench prompts
v0.1.docx`. First live runs are in, and they surfaced three things that need a
decision.

## What changed

| | Inherited | Now |
| --- | --- | --- |
| Scenario | one, inline in `app.js` | packs as data, selectable |
| Seats | 2 of 4 human-driven | all 4 model-played, headless |
| Logging | none | one JSONL file per run, gapless `seq` |
| Conditions | none | disposition arms: firm / accommodating / control |
| Win state | unreachable in code | end-of-round acceptance poll |

The demo was a convincing UI over a single inline scenario, with no logging, no
conditions, and a win state that could not be reached. Everything below replaces
that with something that produces scoreable data.

## Architecture

A scenario is a *pack*: a JS module holding the five prompt blocks plus its own
settlement schema. The engine reads packs and knows nothing about steel,
tariffs, or Article XXVIII.

Turn structure:

1. **Schema A - pre-game declaration.** One turn per seat before Round 1.
   Objectives, success/failure, approach, read of the other parties.
2. **Schema B - negotiation turn.** Fixed speaking order. `public_message` is
   shared; `proposal`, `expectations` and `private_rationale` go only to the log.
3. **Schema C - acceptance poll.** Closes every round. Each seat independently
   accepts or rejects and states what would have to change.

Blocks 1, 4 and 5 are single strings on the pack referenced by every seat, so
they are byte-identical *by construction* - there is no code path that lets them
drift. Block 3 is omitted entirely in the control arm, with no filler.

| Path | Role |
| --- | --- |
| `public/scenarios/` | One pack per scenario; each declares its own `settlementTerms`, so a scenario with different levers needs no engine change. Placeholder packs hold a dropdown slot and refuse to run. |
| `lib/assemble.js` | Block assembly, transcript rendering, settlement detection, generated Schema C |
| `lib/validate.js` | Leak audit; runs before every negotiation and blocks on failure |
| `lib/engine.js` | The loop: declaration turn, rounds, poll, terminal state |
| `lib/model.js` | Responses API client; truncation detection with escalating retry; offline stubs when no key is set |
| `lib/log.js` | JSONL run logging |
| `run.js` | Batch runner across arms with repeats |
| `server.js` | Static server plus an SSE endpoint streaming a live run to the observation room |

```bash
node --env-file=.env run.js --repeats 3        # all arms
node --env-file=.env run.js --arm control      # single arm
node run.js --list                             # available packs
npm test                                       # 12 tests, no key needed
```

With no key present the pipeline runs on schema-correct stubs, so logging,
termination and tests are exercisable without spending anything.

## Constraints enforced in code

`lib/validate.js` implements the leak audit from the prompts doc. Errors block
the run; the length check warns.

- **Banned theory vocabulary** - reservation point, BATNA, red line, audience
  cost, credibility, bluff, escalation and the rest, checked whole-word against
  everything a model can see.
- **Construct-named schema fields** - a field called `internal_disagreement` is
  an instruction, not a measurement.
- **Seat-brief symmetry** - S1 currently warns at **16.6% length spread** against
  the tolerance set in the doc.

Tests pin the invariants: no seat's prompt may contain another seat's brief, the
control arm may contain no disposition sentence or filler, and block order and
identity hold across all four seats.

## Findings from live runs

### Fixed: the first live run returned 0 of 12 parseable turns

Not a prompt failure. Replies were cut off at `max_output_tokens`, and JSON
truncated mid-field is valid right up to where it stops, so it surfaced as a
silent parse failure. Reasoning tokens share that budget - one call spent 193
before emitting text.

The client now reads `status: "incomplete"` with
`incomplete_details.reason === "max_output_tokens"`, doubles the budget and
retries, and records a `truncated` flag on every logged event. After the fix,
12 of 12. **If parse rates drop, check that flag before suspecting the prompt.**

### The settlement rule was unsatisfiable

Block 4 requires all four seats to accept the same terms in the same round. With
a fixed speaking order the seat tabling the winning package speaks first, so it
can only mark its own proposal `counter`. Round 3 of the first run:

| Seat | Status | TRQ | Allocation | Out-of-quota |
| --- | --- | --- | --- | --- |
| eu-geneva | counter | 2,700kt | country_specific | 10% |
| uk-geneva | accept | 2,700kt | country_specific | 10% |
| eu-brussels | accept | 2,700kt | country_specific | 10% |
| uk-london | accept | 2,700kt | country_specific | 10% |

Identical terms, three accepts, proposer stuck on `counter`. Nothing settled.

Fix: Schema C. The mechanic is not invented - it comes from the experiment
design document, which specifies end-of-round acceptance declarations, so it
reconciles both sources. The poll decides settlement; convergence of tabled
proposals is logged as a signal only. **JB has signed this off.**

Re-run after the fix, the same scenario settled in round 2: 0 of 4 accepting in
round 1 with each seat's blocking condition recorded, then 4 of 4.

### The TRQ volume field is ambiguous - schema change needed for v0.2

The private rationale shows seats filling `trq_volume_tonnes` as *UK-specific
allocation plus the global pool combined*, while negotiating in prose over the
UK-specific figure alone. EU/Brussels reasoned about "a 2,400,000-tonne UK
allocation... retaining an additional 800,000-tonne global tranche" - and wrote
`3200000`.

All four adopted the same convention in this run, so settlement detection was
correct. Nothing in Block 5 requires that. One seat using the other reading makes
seats that genuinely agree look like they disagree. Recommend splitting into two
explicit fields.

### Substantive: the EU conceded to the opening maximum

| Round | EU / Geneva | UK / Geneva | EU / Brussels | UK / London |
| --- | --- | --- | --- | --- |
| 1 | 1,000kt global | 2,400kt | 1,600kt | 3,200kt |
| 2 | 2,800kt | 3,200kt | 3,200kt | 3,200kt accept |

The EU moved 1,000 to 3,200 in two rounds while holding the stronger fallback:
under no deal it proceeds at 800kt global, and UK retaliation is self-harming and
six months delayed. This is open question 3 in the prompts doc - whether the
no-deal asymmetry bites. JB's call as domain expert.

## Open

- **The model layer is OpenAI-only.** `lib/model.js` speaks the Responses API
  directly. DeepSeek, Qwen, Kimi and GLM need a provider abstraction. Largest
  remaining piece of harness work.
- **No scoring pipeline.** Logs carry what the metrics need - declarations,
  per-turn rationale, structured proposals, poll answers with stated blocking
  conditions - but nothing scores them. Worth agreeing the binary decomposition
  before writing a judge.
- **Seat-brief lengths breach the tolerance.** Needs an edit to the source
  document, not the pack.
- **The repo summary file is not authoritative.** Generated from earlier
  conversations; JB considers parts over-ambitious and is revising it. Its
  methodology constraints hold, because the prompts doc restates them
  independently. Treat its scope claims as draft.

**Before any batch run, set a hard spend limit at the provider.** One negotiation
is ~50k tokens and ~3 minutes; 24-30 runs is roughly 1.5M tokens and 1.5-2.5
hours, and multi-agent loops fail by spiralling.

---

Prompt text in every pack is transcribed verbatim from its source document - the
wording is the manipulation. Change the document and regenerate; do not edit
prose in the pack.
