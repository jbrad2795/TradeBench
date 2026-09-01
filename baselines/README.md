# baselines/

Frozen reference run sets. `runs/` is scratch and mostly throwaway; a run set
worth keeping as a fixed point gets copied here, so that a later change to
prompts, rules or harness can be compared against something concrete rather
than against memory.

There are **two sets, produced by two different environments.** They do not
pool with each other, and neither is the source of the numbers on the site.

| Set | Environment | Model | Runs | What it is |
| --- | --- | --- | --- | --- |
| `2026-08-20-s1-v0.1-control-gpt-5.6-luna` | **v0.1**, single-table | `openai:gpt-5.6-luna` | 5 | Pilot data. Control arm only, 6 rounds. |
| `2026-08-27-s1-v0.2-harsh-4rd-and-6rd-all-arms-claude-sonnet-5` | **v0.2**, two-room | `anthropic:claude-sonnet-5` | 20 | Frozen copy of the Sonnet evaluation batch. |

## Why the two do not pool

The environment changed underneath the v0.1 set. In v0.1 there was one table
with four speakers; in v0.2 there are two rooms, post and capital seats have
different functions, and settlement is decided by the capital seats after a
private consultation phase. The prompts and the rules differ too.

So the v0.1 set is **pilot data and an informal one-room contrast**, not a
controlled comparison. It is kept for provenance - it is where the project
started, and it records the run-to-run variance any later comparison has to
beat. It is deliberately excluded from every figure on the site. That set has
its own README with the full manifest, outcomes and caveats.

## The v0.2 set is a duplicate, not a separate result

Every file in `2026-08-27-s1-v0.2-*` is byte-identical to a file in
`runs/evaluation runs/anthropic-claude-sonnet-5/`. It was frozen here as a
reference point before further runs were added. It contains 20 of that
directory's runs: the 16 four-round runs across all four disposition arms, plus
4 runs on the earlier six-round configuration.

**If you want the data behind the site, use `runs/evaluation runs/`, not this
directory.** That is what `site/build-results.mjs` reads, and it is the
canonical set - 36 runs across two models, including the four
`focal_firm_eugva` runs and the 16 Kimi K3 runs, neither of which is here.

The six-round runs in this set are pilot configuration and are excluded from
every average on the site; the main batch is four rounds.
