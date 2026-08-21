# TradeBench

A negotiation harness for evaluating whether language models can hold
institutionally situated positions, rather than treating a state as a single
rational actor.

Four seats - two per country - negotiate a WTO Article XXVIII schedule
modification. Each seat sees the same public facts and its own brief, and never
sees another seat's material. Seats on the same side are not co-ordinated.

## Requirements

- Node.js 20.6 or newer (`--env-file` support)
- An OpenAI API key for live runs. Without one everything still runs on
  deterministic stub responses.

## Set up

1. Put your key in `.env`:

   ```bash
   OPENAI_API_KEY=sk-...
   ```

   Never commit that file. `.gitignore` excludes `.env` and `.env.*`.

2. Start the observation room:

   ```bash
   node --env-file=.env server.js
   ```

3. Open <http://localhost:4173>.

## The observation room

Pick a scenario and a disposition arm, then press Run. A real negotiation
streams in as it happens. The centre panel is the public record - the only
thing seats can see of each other. The right-hand panel is for evaluation:
tabled terms per seat, and the end-of-round acceptance poll.

## Generating experiment data (headless)

```bash
node --env-file=.env run.js --repeats 3
```

Runs every disposition arm - firm, accommodating, control, focal_firm_ukgva - three times each,
writing a JSONL log plus a readable `.md` transcript per run to `runs/`. Single arms,
models and scenario variants:

```bash
node --env-file=.env run.js --arm control --repeats 1
node --env-file=.env run.js --model anthropic:claude-sonnet-5 --arm control
node --env-file=.env run.js --variant lenient --arm control --repeats 1
```

List what's available: `node run.js --list` (scenarios), `--list-models`,
`--list-arms`, `--list-variants`.

A two-room run costs roughly 250k tokens and takes about seven minutes at 6
rounds. **Set a hard spend limit at the provider before running a batch.**

## The two-room environment

Seats differ by **function**, not just label. Two structural attributes on each
seat drive everything; no engine logic references a seat id.

| Seat | `country` | `level` |
| --- | --- | --- |
| `eu-geneva` | eu | post |
| `eu-brussels` | eu | capital |
| `uk-geneva` | uk | post |
| `uk-london` | uk | capital |

Post seats negotiate. Capital seats instruct and decide. A round is three phases:

```
Round N
  Phase 1  TABLE         post seats only, fixed order        channel: table
  Phase 2  CONSULTATION  per country, isolated               channel: consult:{country}
             2a  post reports and recommends
             2b  capital instructs and sets authority
  Phase 3  POLL          capital seats decide                channel: private
```

Every message belongs to exactly one channel, and the channel alone decides who
sees it. **No content from one country's consultation can ever reach the other
country's seats** - computed in `lib/channels.js` and asserted by test.

Capital seats read the table transcript but cannot speak into it. Flip
`capitalSeesTable` on the pack to make them rely solely on what their post seat
reports.

### The authority envelope

Phase 2b returns a structured `authority` carrying the pack's own
`settlementTerms`, each nullable. The next round's tabled proposal is checked
against it mechanically, yielding `mandate_exceeded` with no judge involved.

**Detection only - breaches are never blocked.** Defiance has to remain possible
in order to remain measurable.

### Divergence events

Emitted by the engine, not inferred later, and requiring no judge:

| Event | Fires when |
| --- | --- |
| `capital_rejected_recommendation` | post recommended accept, capital declined |
| `capital_accepted_against_recommendation` | the inverse |
| `mandate_exceeded` | a tabled proposal breaches a populated authority field |
| `mandate_absent` | a capital returns an all-null authority |
| `release_requested` | a post seat asked capital for something |
| `release_refused` | capital refused a request |

## How a turn is built

Each seat's prompt is assembled from blocks, per `documents/tradebench prompts
v0.2.md`:

```
Block 1   Facts          identical across seats within a variant, role-blind
Block 2   Seat brief     remit and instructions received - never an objective
Block 2b  Private info   seat-specific; grounds, not instructions
Block 3   Disposition    one sentence; OMITTED ENTIRELY in the control arm
Block 4   Rules          identical within a variant; explicit asymmetric no-deal default
Block 5   Output schema  per phase; no field named after a scored construct
```

Schemas: **A** pre-game declaration, **B** table turn, **C** the decision
(capital seats only: `decision: accept | continue`, `terms_decided`,
`reasoning`), **D** post report, **E** capital instruction. C, D and E are
generated from the pack's `settlementTerms`, so a scenario with different
levers needs no engine change.

Blocks 1, 4 and 5 are single strings on the pack referenced by every seat, so
they are identical by construction rather than by discipline.

Turn structure: a pre-game declaration turn, then N rounds (6 for S1) in fixed
speaking order, each round closing with an independent decision from every
capital seat. Settlement is read from the structured `terms_decided` object and
decided by that decision - never by parsing prose or by post seats, who never
settle (`status: accept` on a table turn is not a settlement).

## Scenario variants

Independent of the disposition arm: a pack may declare `variants` (S1 has
`harsh` and `lenient`) that parameterise figures in Blocks 1 and 4 via
`{{PLACEHOLDER}}` tokens, resolved from the *same* values object for both
blocks so they cannot structurally diverge. `harsh` is the real opening
position; `lenient` exists to check the environment can produce a settlement at
all, so a deadlock under `harsh` is a finding about the negotiation rather than
an artefact of an unwinnable scenario.

## Scenario packs

`public/scenarios/` holds one pack per scenario. A pack declares its own
`settlementTerms`, so a scenario with different levers needs no engine change.
Packs marked `placeholder: true` appear in the dropdown but refuse to run.

Prompt text in a pack is transcribed verbatim from its source document. The
wording is the experimental manipulation - change the document and regenerate;
do not edit the prose in the pack.

## Leak audit

`lib/validate.js` runs before every negotiation and blocks the run on:

- banned theory vocabulary in anything a model can see, including per-variant
  resolved text
- schema fields named after a scored construct
- unresolved `{{PLACEHOLDER}}` tokens in any resolved variant
- Block 1 and Block 4 figures resolving to different values within a variant
- the engine flag name `capitalSeesTable` appearing literally in prompt text
- a pack missing the structure the engine depends on

It warns, without blocking, when paired seat briefs or private-info blocks
(post-vs-post, capital-vs-capital) differ in length by more than 10%.

## What a run log contains

One JSON object per line, gapless `seq`:

| Event | Carries |
| --- | --- |
| `run_start` | config (including `variant`) and scenario manifest |
| `pregame_declaration` | objectives, success/failure, approach, read of the other parties |
| `table_turn` | `public_message` plus the private `proposal`, `expectations`, `private_rationale` |
| `post_report` | report, recommendation, requests to capital |
| `capital_instruction` | instruction, `authority` envelope, responses to requests |
| `acceptance` | `decision`, `terms_decided`, `reasoning` per capital seat |
| `mandate_exceeded` / `mandate_absent` | authority breaches and empty mandates - detection only, never blocked |
| `capital_rejected_recommendation` / `capital_accepted_against_recommendation` | post/capital divergence |
| `release_requested` / `release_refused` | requests up the chain and their answers |
| `round_end` | decision outcome and agreed terms |
| `run_end` | terminal state: `settled`, `rounds_exhausted`, or `error` |

## Baselines

`runs/` is scratch and is not tracked. Run sets worth keeping as reference
points are copied into `baselines/`, each with a manifest recording the pack
version, model, disposition arm, variant, round count and the code commit that
produced them. Compare against a baseline rather than against memory when
judging whether a prompt or harness change moved anything.

**The `baselines/2026-08-20-*` set is v0.1 (single-table) and does not pool
with v0.2 (two-room) runs** - the environment changed underneath it. Treat it
as pilot data.

## Tests

```bash
npm test
```

29 tests. Covers the leak audit, block identity and ordering, control-arm
omission, seat/consultation isolation across countries (the hard channel
invariant), variant resolution and the Block 1/Block 4 consistency check,
the Schema C decision shape, settlement detection, the authority envelope
(detected, never blocked), the run lock, and round-phase ordering.

## Project map

- `run.js` - headless batch runner (`--arm`, `--model`, `--variant`, `--rounds`, `--list*`)
- `server.js` - static server plus a streaming run endpoint
- `lib/assemble.js` - block assembly, variant resolution, transcript, settlement detection, schemas C/D/E
- `lib/engine.js` - the three-phase negotiation loop
- `lib/channels.js` - message visibility; the single source of truth for what a seat can see
- `lib/arms.js` - disposition arms, including the focal condition
- `lib/validate.js` - leak audit
- `lib/model.js` - API client with truncation/JSON-repair retries and an offline mode
- `lib/models.js` - provider registry (OpenAI, Anthropic, DeepSeek, Kimi, GLM, Qwen)
- `lib/lock.js` - one run at a time
- `lib/report.js` - readable `.md` transcript per run, channel-separated
- `lib/log.js` - JSONL run logging
- `public/scenarios/` - scenario packs
- `documents/` - source design and prompt documents
