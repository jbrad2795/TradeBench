# evaluation/

Working area for evaluation documents and data - findings write-ups, saved
artifact snapshots, anything that supports the analysis but isn't part of
the harness itself. Not tracked in git (see .gitignore) - this is local
working material, not the run data (that's runs/ and baselines/) or the code.

## artifacts/

Static HTML snapshots of published Claude Artifacts dashboards, saved so
they survive independent of the live claude.ai link.

- `2026-08-29-claude-vs-kimi-k3.html` - matched 16-run-per-model comparison
  (settlement rate, divergence patterns, settled terms) between Claude
  Sonnet 5 and Kimi K3, harsh variant, 4 rounds, all four arms.
  Live version: https://claude.ai/code/artifact/2755a7d1-ebc6-4a59-9be9-f80e958575ac

- `2026-08-29-sixteen-claude-runs.html` - deep dive on the 16-run Claude
  Sonnet 5 set alone: settlement-rate staircase by disposition, all
  settlements landing on the round-4 deadline, judge-reconciliation detail.
  Live version: https://claude.ai/code/artifact/d6815055-0bac-4664-b5f2-fcaf51669493

- `2026-08-31-focal-seat-eu-vs-uk.html` - focal_firm_ukgva vs the new
  focal_firm_eugva arm (EU Geneva tagged firm instead of UK's) - settlement
  rate, settled terms, and the uk-geneva mandate-breach pattern that doesn't
  track the disposition tag.
  Live version: https://claude.ai/code/artifact/a3669d16-54e3-4a15-9a15-7b05a948b4de
