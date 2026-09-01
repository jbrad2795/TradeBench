# Baseline: S1 all arms, claude-sonnet-5, v0.2 two-room, 27 August 2026

> **These files are a frozen copy, not a separate result.** Every one of them is
> byte-identical to a file in `runs/evaluation runs/anthropic-claude-sonnet-5/`.
> They were pinned here as a reference point before further runs were added.
> If you want the data behind the site, read `runs/evaluation runs/` - that is
> what `site/build-results.mjs` reads, and it holds the full canonical set
> including the `focal_firm_eugva` arm and the Kimi K3 batch, neither of which
> is here.

Reference run set for the **v0.2 two-room environment**. Does not pool with
`baselines/2026-08-20-*`, which is v0.1 single-table pilot data - see
[`../README.md`](../README.md).

## What produced these

| | |
| --- | --- |
| Scenario pack | `s1-article-xxviii-steel` v0.2 |
| Environment | two-room (post negotiates, capital instructs and decides) |
| Model | `anthropic:claude-sonnet-5`, provider defaults |
| Scenario variant | `harsh` |
| Disposition arms | control, firm, accommodating, focal_firm_ukgva |
| Runs | 20 - 16 at four rounds, plus 4 on the earlier six-round config |

```bash
node --env-file=.env run.js --model anthropic:claude-sonnet-5 --repeats 4
```

Model output is not deterministic, so a rerun will not match term for term.
The spread is the thing to compare against.

## Outcomes, four-round runs (the main batch)

| Arm | Settled |
| --- | --- |
| control | 2 / 4 |
| firm | 1 / 4 |
| accommodating | 4 / 4 |
| focal_firm_ukgva | 3 / 4 |
| **total** | **10 / 16** |

Three of those ten were rescued by the reconciliation judge - the two capitals
accepted packages a blinded judge ruled were the same deal. Mechanically it is
7 / 16. Both readings are reported everywhere on the site.

## The four six-round runs

Dated 24 August and run on the earlier six-round configuration. All four
exhausted their rounds without settling. They are **excluded from every average
on the site**; the main batch is four rounds. Kept here because they are the
only six-round v0.2 runs and they show what the extra rounds did not buy.
