# TradeBench Play Room

A local bilateral trade-negotiation simulator. A human-controlled delegation alternates turns with independent AI representatives. Each AI sees the public case, public transcript, and only its own private brief.

## Requirements

- Node.js 20 or newer
- An OpenAI API key for live agents (without one, the app uses demo responses)

## 🌟Set up

1. Put your own API key in `.env` following the steps below. Never share or commit that file. 
   
   First find the following line in your `.env` file:
   ```bash
   OPENAI_API_KEY=your_api_key_here
   ```
   Then replace `your_api_key_here` with the API key you were provided with. Please keep your API key safe, and only use it for the TradeBench project.

2. Open your terminal, then locate to this TradeBench folder (using the `cd` command), and start the server using the following command line:

   ```bash
   node --env-file=.env server.js
   ```

   If `node` is unavailable, install Node.js 20+ from <https://nodejs.org>.

3. Open <http://localhost:4173> in your default browser, and you will see the TradeBench Play Room.


## Generating experiment data (headless)

The play room is for qualitative evaluation. Quantitative data comes from the
batch runner, which plays all four seats with models and needs no human.

```bash
node --env-file=.env run.js --repeats 3
```

That executes the full 2x2 condition matrix - personality tags on/off crossed
with elicitation timing per-round/end - three times each, writing one JSONL log
per run to `runs/`. Single cells can be run directly:

```bash
node --env-file=.env run.js --repeats 1 --personality on --elicitation end
```

With no API key set, the runner uses deterministic stub responses so the whole
pipeline can be exercised offline without spending credits.

### What each run log contains

One JSON object per line, gapless `seq` numbers:

| Event | Feeds |
| --- | --- |
| `run_start` | config, and the scenario manifest including hidden ground-truth objectives |
| `private_declaration` | metric 1 - declared win condition, read of the opponent, intended strategy |
| `public_utterance` | the public transcript |
| `acceptance` | per-agent accept/reject at each round close |
| `elicitation` | metric 2 - disposition reads; metric 3 - co-national priority answers |
| `round_end` / `run_end` | terminal state (`accept_accept`, `rounds_exhausted`, `error`) |

Hidden objectives are recorded in the log for scoring but are never sent to any
model - there is a test asserting this.

## Tests

```bash
npm test
```

Covers the private-information isolation invariant (no agent is ever shown
another's brief), personality-tag gating, both terminal states, log
completeness, and turn ordering.

## Project map

- `run.js` — headless batch runner for experiment data
- `lib/engine.js` — four-agent negotiation loop, rounds, acceptance, elicitation
- `lib/prompts.js` — prompt construction; enforces private-information isolation
- `lib/model.js` — OpenAI client with retries and an offline stub mode
- `lib/log.js` — JSONL run logging
- `public/scenario.js` — shared scenario, personas, briefs, dispositions, ground truth
- `server.js` — static web server and private OpenAI Responses API proxy
- `public/index.html` — play-room structure
- `public/styles.css` — responsive interface design
- `public/app.js` — scenario, roles, rounds, transcript, and client state
- `documents/` — original experiment-design source material

Roles and country rosters are arrays in `public/app.js`, so additional representatives can be added without changing the overall UI architecture.

## Security

The browser never receives the API key. `.env` is excluded by `.gitignore`. Every collaborator should use their own `.env` file.
