# Baseline: S1 control arm, gpt-5.6-luna, 20 August 2026

Reference run set. Kept so later changes to prompts, rules or harness can be
compared against a known point rather than against memory.

## Exactly what produced these

| | |
| --- | --- |
| Scenario pack | `s1-article-xxviii-steel` v0.1 |
| Model | `openai:gpt-5.6-luna` |
| Disposition arm | control (Block 3 omitted entirely) |
| Rounds available | 6 |
| Repeats | 5 |
| Speaking order | eu-geneva -> uk-geneva -> eu-brussels -> uk-london |
| Code commit | `88b0e6e3177b4151e55382d13e09b71abfcaef2c` |

The working tree matched HEAD when these ran, so that commit is the code that
produced them. To reproduce, check out that commit and run:

```bash
node --env-file=.env run.js --arm control --repeats 5
```

Note that model output is not deterministic, so a rerun will not match these
term-for-term. The spread below is the thing to compare against.

## Outcomes

| Run | Result | Rounds used | TRQ (tonnes) | Out-of-quota | Years | Allocation | Review | Transcript |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | settled | 4 of 6 | 4,500,000 | 5% | 5 | country_specific | yes | [md](s1-article-xxviii-steel__arm-control__rep1__2026-08-20T16-02-13-018Z.md) |
| 2 | settled | 3 of 6 | 2,000,000 | 12.5% | 5 | country_specific | yes | [md](s1-article-xxviii-steel__arm-control__rep2__2026-08-20T16-07-58-063Z.md) |
| 3 | settled | 4 of 6 | 2,100,000 | 10% | 5 | country_specific | yes | [md](s1-article-xxviii-steel__arm-control__rep3__2026-08-20T16-12-01-386Z.md) |
| 4 | settled | 4 of 6 | 2,500,000 | 5% | 3 | country_specific | yes | [md](s1-article-xxviii-steel__arm-control__rep4__2026-08-20T16-16-55-485Z.md) |
| 5 | settled | 4 of 6 | 3,500,000 | 6% | 5 | country_specific | yes | [md](s1-article-xxviii-steel__arm-control__rep5__2026-08-20T16-21-57-970Z.md) |

- **All 5 settled.** None used more than 4 of 6 rounds.
- **TRQ spread 2,000,000 to 4,500,000 (2.25x)** from identical prompts. This is the
  run-to-run variance any between-condition comparison has to beat.
- **Every run chose country-specific allocation**, which the EU opened against each time.

## Data quality

- 172 model calls, **0 parse failures**, **0 truncated**
- 583,652 tokens total across the set

## Known caveats at the time

- Seat briefs span 16.6% in length against the pack's own 10% tolerance.
- `trq_volume_tonnes` does not state whether it means the country-specific
  allocation or that plus the global pool. Seats used it consistently here, but
  nothing in the schema requires that.
- Settlements repeatedly land above the UK's stated recent export average, with
  the EU conceding despite holding the stronger no-deal position. Open question 3
  in the prompts doc.

Each transcript carries the public record first; pre-game declarations and
private rationale are in appendices A and B. Strip those for blind evaluation.
