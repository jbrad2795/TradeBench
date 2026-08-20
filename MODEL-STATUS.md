# Model-side status, for Claude context

Written 20 August 2026 so a fresh Claude Code session has this without JB
re-explaining. Read this before answering questions about running other models.

## What exists right now

The model layer is provider-agnostic. Three files:

- `lib/models.js` — provider registry + a curated catalogue. A model is
  addressed as `provider:model-id`. Not a whitelist: any `provider:model-id`
  works even if unlisted, as long as the provider is known.
- `lib/model.js` — the actual HTTP call. Three wire-format adapters:
  `openai-responses` (OpenAI's Responses API), `openai-chat` (OpenAI-compatible
  chat-completions — covers DeepSeek, Kimi, GLM, Qwen), `anthropic` (Messages
  API). Also does JSON repair (fences, trailing commas) and retries on
  truncation or unparseable output.
- `lib/lock.js` — one run at a time, enforced by a pid file. Prevents wasting
  tokens on concurrent runs and keeps runs comparable as discrete data points.

All keys live in one `.env` (not split per provider, so one gitignore rule
covers all of them). Current key status:

| Provider | Env var | Key present |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | **yes** — this is what every run so far has used |
| Anthropic | `ANTHROPIC_API_KEY` | slot exists, empty |
| DeepSeek | `DEEPSEEK_API_KEY` | slot exists, empty |
| Moonshot/Kimi | `MOONSHOT_API_KEY` | slot exists, empty |
| Zhipu/GLM | `ZHIPU_API_KEY` | slot exists, empty |
| Alibaba/Qwen | `DASHSCOPE_API_KEY` | slot exists, empty |

Select a model with `--model provider:model-id` on `run.js`, or the Model
dropdown in the observation room. `node run.js --list-models` shows what's
selectable and which have keys.

## What is NOT yet proven

**The Anthropic adapter has never made a real API call.** It was written from
the documented request/response shape, not tested against a live key. Before
running anything real on Claude models: make one throwaway single call first
and confirm it returns text, before committing to a batch.

**The catalogue's Anthropic model IDs are probably stale.** Listed:
`claude-opus-4-5`, `claude-sonnet-4-5`. The current family is Claude 5
(`claude-sonnet-5`, `claude-opus-5`, `claude-fable-5`), so these specific
strings will likely 404. Do not trust the catalogue string — once a key
exists, call `GET https://api.anthropic.com/v1/models` with it and populate
the catalogue from what actually comes back. This is exactly what was done for
OpenAI: `gpt-5.6-luna` looked wrong by pattern-matching alone and turned out to
be real, so the fix each time is "ask the provider," never "trust memory of
the naming convention."

**DeepSeek / Kimi / GLM / Qwen adapters are similarly unverified** — same
`openai-chat` code path, but no key has ever been tested against any of them.

## The methodological trap for a model comparison

There is currently **no clean baseline to compare a new model against.**

- The `baselines/2026-08-20-s1-v0.1-control-gpt-5.6-luna/` set is the
  **single-table (v0.1) environment**, not the current two-room (v0.2) one.
  Explicitly marked as non-poolable pilot data in its own README.
- The only v0.2 run so far (`focal_firm_ukgva`, one repeat) was produced
  **before** the JSON-repair fix, though it happened to complete without
  hitting the bug that run.

So: before running Sonnet (or anything else) for a real comparison, run a
fresh `gpt-5.6-luna` v0.2 baseline under current code first — several repeats,
same arm and scenario a new model will be tested on. Otherwise a difference in
outcomes can't be separated from "the environment changed" or "the JSON fix
changed something."

Rough cost, measured live: ~254k tokens and ~7 minutes per run at 6 rounds,
two-room. A k=3 same-model baseline plus k=3 on a second model is 6 runs,
roughly 25 minutes and 1.5M tokens combined.

## The one comparison this setup is actually built for

All four seats on one model is the default and the intended mode. Mixed-model
tables (e.g. EU seats on one model, UK seats on another) are explicitly a
**separate experiment** per the design spec's confound warnings — do not treat
a mixed-model run as equivalent to same-model runs when reporting.

## Quick recipe, once a key is in `.env`

```bash
node --env-file=.env run.js --list-models
node --env-file=.env run.js --model anthropic:<verified-id> --arm control --repeats 1   # smoke test
node --env-file=.env run.js --model anthropic:<verified-id> --arm control --repeats 3   # real comparison set
```
