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
writing one JSONL log per run to `runs/`. Single arms:

```bash
node --env-file=.env run.js --arm control --repeats 1
```

List scenarios with `node run.js --list`, models with `--list-models`, arms with `--list-arms`.

A run costs roughly 50k tokens and takes about three minutes. **Set a hard spend
limit at the provider before running a batch.**

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
v0.1.docx`:

```
Block 1   Facts          identical across seats, role-blind
Block 2   Seat brief     remit and instructions received - never an objective
Block 2b  Private info   seat-specific, optional
Block 3   Disposition    one sentence; OMITTED ENTIRELY in the control arm
Block 4   Rules          identical; states an explicit asymmetric no-deal default
Block 5   Output schema  per phase; no field named after a scored construct
```

Schemas: **A** pre-game declaration, **B** table turn, **C** acceptance poll
(capital seats only), **D** post report, **E** capital instruction. C, D and E
are generated from the pack's `settlementTerms`, so a scenario with different
levers needs no engine change.

Blocks 1, 4 and 5 are single strings on the pack referenced by every seat, so
they are identical by construction rather than by discipline.

Turn structure: a pre-game declaration turn, then three rounds in fixed speaking
order, each round closing with an independent acceptance poll of every seat.
Settlement is read from the structured `proposal` object and decided by the
poll - never by parsing prose.

## Scenario packs

`public/scenarios/` holds one pack per scenario. A pack declares its own
`settlementTerms`, so a scenario with different levers needs no engine change.
Packs marked `placeholder: true` appear in the dropdown but refuse to run.

Prompt text in a pack is transcribed verbatim from its source document. The
wording is the experimental manipulation - change the document and regenerate,
do not edit the prose in the pack.

## Leak audit

`lib/validate.js` runs before every negotiation and blocks the run on:

- banned theory vocabulary in anything a model can see
- schema fields named after a scored construct
- a pack missing the structure the engine depends on

It warns, without blocking, when seat briefs differ in length by more than 10%.

## What a run log contains

One JSON object per line, gapless `seq`:

| Event | Carries |
| --- | --- |
| `run_start` | config and scenario manifest |
| `pregame_declaration` | objectives, success/failure, approach, read of the other parties |
| `turn` | `public_message` plus the private `proposal`, `expectations`, `private_rationale` |
| `acceptance` | per-seat accept/reject and what would have to change |
| `round_end` | poll outcome and agreed terms |
| `run_end` | terminal state: `settled`, `rounds_exhausted`, or `error` |

## Baselines

`runs/` is scratch and is not tracked. Run sets worth keeping as reference
points are copied into `baselines/`, which is, each with a manifest recording
the pack version, model, disposition arm, round count and the code commit that
produced them. Compare against a baseline rather than against memory when
judging whether a prompt or harness change moved anything.

## Tests

```bash
npm test
```

Covers the leak audit, block identity and ordering, control-arm omission,
seat-brief isolation, settlement detection, and the acceptance poll.

## Project map

- `run.js` - headless batch runner
- `server.js` - static server plus a streaming run endpoint
- `lib/assemble.js` - block assembly, transcript, settlement detection
- `lib/engine.js` - the negotiation loop
- `lib/validate.js` - leak audit
- `lib/model.js` - API client with truncation detection and an offline mode
- `lib/log.js` - JSONL run logging
- `public/scenarios/` - scenario packs
- `documents/` - source design and prompt documents
