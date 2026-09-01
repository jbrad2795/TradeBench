# TradeBench site — answers to your scoping questions

Answers to every question, in order. Where an answer differs from what I said in chat
earlier, this file wins. Sections 4–7 at the bottom cover the data you should
actually use, what's gone stale, ideas I want added, and the order to build in.

---

## 1. Direction / scope

**Which site is this?**
A static results/pitch site mirroring the TaiwanBench structure. It does **not**
replace the observation room in `public/` — that stays exactly as it is for local
work. But the new site does eventually absorb a version of it: put **Observation
room** in the nav, and if there's time build it as a *replay* page (see §6.1). If
there isn't time, leave it as a stub page saying a replay viewer is coming. What we
must not do is point the public at a live harness — every visitor would be spending
my API budget, and it's an open abuse surface.

**Audience & deadline reality.**
Submission-ready with real numbers, today. But build the shell first — structure, nav,
styling, placeholder prose — and show me before any prose goes in.

One change to that: **don't placeholder the numbers.** Wire the scoreboard and charts
to real data from the first build (see §4 and §6.2). The numbers are settled and
they're the slow thing to get right; the prose is the only thing that should be on the
critical path while I'm writing.

**Section list.**
Yes to all seven, adapted:

1. **Hero + central question** — placeholder for now, candidates in §2.
2. **Parameters strip** — 4 seats · 2 capitals · 2 countries · 5 disposition arms ·
   2 scenario variants · 4 rounds (main batch) · 2 models · 36 evaluation runs ·
   ~250k tokens per run. English only.
3. **Initial findings** — 3–4 slots, I write the prose. Structure them and leave the
   copy empty; rough scaffolding in §2.
4. **Results scoreboard** — models × arms × metrics. Yes.
5. **Charts** — yes, two or three. Inline SVG, no chart library, no CDN.
6. **How it works** — two-room architecture, the three phases, blocks, channels.
7. **The pitch** — I'll write it and hand it over. Placeholder.

Add four more sections. These matter more for the judging than any extra chart, and
they're missing from the list:

8. **Methods and validity.** The single most persuasive thing in the project and it
   wasn't on the plan. As a short list of invariants: the leak audit blocks a run if
   theory vocabulary, a schema field named after a scored construct, or an unresolved
   placeholder reaches a model; the control arm omits Block 3 entirely with no neutral
   filler; the channel invariant (nothing from one country's consultation can reach
   the other country) is asserted by test, not by discipline; breaches are detected
   and never blocked — *"defiance has to remain possible in order to remain
   measurable"*, use that line verbatim; judge scoring is blinded with
   `assert_blinded()` raising before every call; inter-judge reliability is reported
   (Krippendorff α = 0.708) and disagreements over one level go to a file for hand
   adjudication, never auto-resolved.
9. **A transcript exhibit.** One annotated excerpt — a Geneva seat tabling below its
   own capital's standing floor and then reporting the deviation as a judgment call
   (`firm/rep3` round 4, or `accommodating/rep4` r3 UK). Three or four exchanges with
   margin annotations. This gets remembered when the bar charts don't, and the contest
   explicitly asks for concrete material.
10. **Limitations**, stated by us before anyone else states them. List in §4.4.
11. **Reproduce it.** Repo link, `npm test` (29 tests), the three commands to run one
    negotiation, the honest cost line (~250k tokens / ~7 minutes per 6-round run), and
    one-click downloads: a full `.md` transcript, its `.jsonl`, and the run index CSV.

Also, cheap and currently missing: author/attribution and a citation line;
`og:image` + meta description (this gets shared on Substack and X — the card is the
first impression); and one plain-English paragraph for a policy reader who doesn't do
ML, since half the judging panel is policy.

**Bilingual?**
English first, and English is what ships. Not a priority. If there's genuine time at
the end, add a **single Mandarin abstract paragraph**, not a full second site — cheap,
and it lands with this audience.

**Naming / branding.**
ChinaTalk attribution as on the example. No TradeBench logo — wordmark only, same
mark as the observation room (`T` tile). Replicate the observation room's styling; see
§2 for the exact tokens. Hold the WTO green/red/blue accent idea for now; I'll say
where those go once I've seen a prototype.

---

## 2. Resources

**Headline question and framing sentence.**
Placeholder for now. Three candidates to build against — overwrite freely:

- **"A government is not one player."** — sub: *Can a model hold an institutional
  position, or does it negotiate as if the state were a single mind?*
- **"Four seats. Two capitals. One deal."** — sub: *A WTO negotiation where the seats
  on your own side aren't co-ordinated with you.*
- **"The other side of the table isn't the only problem."**

Framing sentence, usable as-is:

> TradeBench is a two-room simulation of a WTO Article XXVIII schedule modification.
> Four seats — two per country, one in Geneva and one in the capital — negotiate a
> steel tariff settlement. No seat sees another seat's brief, and seats on the same
> side are not co-ordinated.

**The primary metrics — this replaces what I told you before.**
I'd said three: realness of strategy, unitary-actor adaptation, disposition
recognition. Checked against what's actually on disk, "realness" has no data at all —
the design doc has Likert items for human practitioners and no practitioner ratings
exist. Meanwhile the strongest measurable thing in the harness wasn't in my list.

Use **four**, in this order, with these public names and definitions:

1. **Settlement.** Did the two capital seats accept the same terms in the same round,
   and on what terms? Read from the structured decision object — no judge, no prose
   parsing.
2. **Divergence signature.** How often does a Geneva seat table outside its own
   capital's standing authority, and how often does a capital override its own seat's
   recommendation? Emitted mechanically by the engine, not inferred afterwards.
3. **Co-national recognition.** Does a Geneva seat's own text assert that it and its
   capital want different things? Blinded judge scoring on a 0–4 ladder, three passes
   per unit, median taken, α reported.
4. **Disposition legibility.** Can a blind reader recover a seat's assigned posture
   from its behaviour alone? Three-way forced choice against a 33% chance baseline.

Metric 2 is the one I'd missed and it's the best thing we have for this audience:
mechanical, judge-free, free to compute, fully reproducible, and it's where the two
models differ in *kind* rather than in score. "Realness of strategy" moves to the
what's-next list as practitioner Likert ratings over the same transcripts.

**Findings.**
Placeholder — I write the prose. Structure four slots. The material is there if you
want to size the boxes:

- Kimi K3 settles less than half as often as Claude Sonnet 5, in every arm, under
  identical rules.
- The two models fail differently, not just more or less often.
- Which side gets tagged firm is not interchangeable — mirroring the same one-seat
  manipulation onto the EU drops settlement from 75% to 25%.
- One sentence of assigned posture is legible to a blind reader, but only just.

**Results data.**
Canonical set and exact numbers in §4. Short version: the canonical comparison is the
**matched 16 v 16** (Claude Sonnet 5 and Kimi K3, harsh variant, four rounds, four
arms, four reps), plus the **4 `focal_firm_eugva`** Sonnet runs. Exclude the four
24 Aug six-round pilot runs and the one errored Kimi run.

**No, usable aggregation does not exist as a file.** Both extracted spreadsheets are
stale (§5). Build `results.json` from the JSONL instead — §6.2.

**Experiment-design docx / prompts v0.3.**
Yes, pull public-facing copy from both. Two constraints. Don't paste seat briefs into
the page body as if they were prose — quote them in a bordered exhibit block so it's
obvious what's prompt text and what's ours. And flag it to me before publishing the
*full* prompt set: full publication is great for reproducibility and it's what the
contest wants, but it also puts the manipulation into the training-data commons, which
makes future runs harder to trust. My instinct is publish Blocks 1, 4, 5 and the three
disposition sentences in full, link the rest in the repo, and say why.

**Visual reference.**
Distinct TradeBench look, which means: match the observation room, not TaiwanBench.
Tokens from `public/styles.css`:

```
--ink #17201d   --muted #69736e   --line #dce2de   --paper #f5f6f2
--panel #ffffff --green #163f34   --green-2 #2b6959
--mint #dbe8e1  --sand #efe9dd    --red #9c483e
```

Georgia for headings and body prose, Inter/system sans for UI and labels, uppercase
letterspaced eyebrows, 1px hairline rules, generous white space. No Google Fonts —
Georgia is already there and the page should still render correctly in five years.
Country accents already exist and should carry over: EU `#3a5a8c`, UK `#8c5a3a`.

---

## 3. Permissions

**May you read the docx, prompts v0.3, runs/, baselines/?** Yes, all of it.

**Framework choice.**
Plain static HTML/CSS/JS. No framework. Reasoning:

| Option | Pros | Cons |
|---|---|---|
| **Plain static** (chosen) | No build step, no dependency risk; identical CSS language to the observation room so branding is free; charts as inline SVG like the existing artifact HTMLs; deploys anywhere; archives cleanly | Repeated markup by hand; manual i18n |
| Next.js + Vercel | Matches the example; routing and i18n built in | npm install, build config and an account on deadline day; more that can break at 11pm; overkill for fixed content |
| Astro | Static output with components; best long-term middle ground | New tooling to learn today |

**Where does it live?** New `site/` folder in this repo.

**Deployment today.** Build locally only. Don't push, don't deploy — I'll do both once
I'm happy. Structure it so it works unchanged on either **Vercel** (drag-and-drop the
folder or connect the repo) or **GitHub Pages**: relative asset paths only, no
server-side anything, no build step required to serve it.

Before anything goes public, run a pre-flight and report back: `.env` holds a live API
key — confirm `git ls-files | grep -i env` returns nothing, and tell me if it doesn't
so I can rotate. Also: `evaluation/` is currently gitignored, and it contains the
judge rubric and `conational_recognition.py`, which are among the most impressive
artefacts we have. Flag that to me as a decision — I'm inclined to include them.

**Node / tooling.**
No framework deps to install. The one script we need (`build-results.mjs`) should use
Node stdlib only — no dependencies, so it still runs in a year. If you hit something
that genuinely needs a package, ask first rather than installing.

---

## 4. The data to use

### 4.1 Canonical run set

| Set | Runs | Use |
|---|---|---|
| `runs/evaluation runs/anthropic-claude-sonnet-5/` main batch | 16 (4 arms × 4 reps, harsh, 4-round) | **canonical** |
| same, `focal_firm_eugva` (31 Aug) | 4 | **canonical** — mirror-arm comparison only, no Kimi counterpart |
| same, 24 Aug runs | 4 (6-round pilot config) | **exclude from all averages**; may appear in a run index tagged as pilot |
| `runs/evaluation runs/moonshot-kimi-k3/` | 16 (4 arms × 4 reps) | **canonical** — matched to the Sonnet 16 |
| `runs/evaluation runs/moonshot-kimi-k3/errored/` | 1 (firm rep4, API timeout) | exclude; mention in limitations |
| `runs/evaluation runs/openai/` | **0 — empty** | nothing to show |
| `baselines/2026-08-20-*` (GPT-5.6-luna) | v0.1 single-table | **do not pool** — different environment |

Headline framing: **36 evaluation runs**, of which **32 form the matched two-model
comparison**.

### 4.2 Numbers that are settled

Settlement, matched 16 v 16 (harsh, four rounds):

| Arm | Sonnet 5 | Kimi K3 |
|---|---|---|
| control | 2/4 | 1/4 |
| firm | 1/4 | 0/4 |
| accommodating | 4/4 | 1/4 |
| focal_firm_ukgva | 3/4 | 2/4 |
| **total** | **10/16 (62.5%)** | **4/16 (25%)** |

Of the 10 Sonnet settlements, **3 were judge-rescued** — mechanically it's 7/16.

Mirror-arm (Sonnet, n=4 each): `focal_firm_ukgva` 3/4 (75%) vs `focal_firm_eugva`
1/4 (25%). And `uk-geneva` accounts for 10 of the 11 mandate breaches across both
arms — including all 6 in the arm where it carries no tag at all, so the pattern
doesn't track the disposition manipulation.

Divergence signature, totals across 16 runs per model:

| | Sonnet 5 | Kimi K3 |
|---|---|---|
| `mandate_exceeded` per round | 0.33 | 0.05 |
| capital overrode its own post | 3 | 10 |
| `release_refused` ÷ requested | 0.54 | 0.23 |
| judge fired / rescued | 5 / 3 | 5 / 1 |

Settled pool tonnage: Sonnet min 750k / median 925k / max 2.0m; Kimi min 1.0m /
median 2.75m / max 3.2m — Kimi's median settlement exceeds Sonnet's maximum.

Co-national recognition (Sonnet, 16 runs, Geneva seats only): 128 units, 3 judge
passes, **59% at level ≥ 3**, **16/16 runs reached ≥ 3**, 5 level-4 units, Krippendorff
α (ordinal) **0.708**, 18 units sent to hand adjudication. The `institutional_timetable`
axis was never recognised at level ≥ 3 by any seat — a clean negative result, worth
stating.

### 4.3 A number the site can have that wasn't in my answers

I had the blind disposition results scored:
`evaluation/blind rating for disposition/blind_rate_12runs_nr5_public.json` — 12 runs
× 5 independent raters × 2 delegations = **120 forced-choice judgements**, public-channel
transcripts only, arm labels redacted.

- **Overall recovery: 64/120 = 53%**, against 33% by chance.
- By true arm: control **62%**, firm **57%**, accommodating **40%**.
- Confidence: **1 of 120** judgements was rated high; the rest low (63) / medium (56).
- Error direction: **34 of the 56 errors read a tagged seat as untagged.**

Publish it with the caveat that the rater is a model reading a model, so this is a
legibility check on the manipulation, not an independent capability claim. Note the
set covers control / firm / accommodating only — no focal arms.

### 4.4 Limitations to state, in our own words, before anyone else does

n = 4 per cell; one scenario; the judge is a model; 3 of 10 Sonnet settlements were
judge-rescued; Kimi has no EU-focal mirror (no time — flagged as future work); there
is no v0.2 GPT-5.6 set, and the v0.1 baseline predates the two-room environment so it
doesn't pool; one Kimi run failed at the API and was re-run; the co-national ≥3 rate
came in well above the pre-registered expectation, which we're reporting as a finding
rather than quietly re-tuning the rubric.

---

## 5. What's expired — don't use these

- **`tradebench_sonnet5_runs.xlsx`** — covers 20 runs, predates the four
  `focal_firm_eugva` runs. Stale.
- **`tradebench_moonshot_kimi_k3_runs.xlsx`** — covers 8 of the 16 Kimi runs. Stale.
- **The two run-extraction notes in the Claude project** — describe that same 8-run
  Kimi state. Superseded.
- **The v0.1 GPT baseline** — different environment, does not pool. Not a scoreboard row.
- **Six-round framing anywhere in the copy.** The prompts doc and parts of the README
  still say "six rounds"; the main batch is four. Say four rounds and note the
  six-round pilot separately, or the parameters strip contradicts the data.
- **Raw `n_mandate_exceeded` as a count of "breaches"** — see §6.4. It is the one
  number on this project that has already been got wrong once.

Current sources of truth until `results.json` exists: the three files in
`evaluation/artifacts/` (16v16 comparison, sixteen-run deep dive, focal EU-vs-UK) and
`evaluation/conational-recognition/out/conational_report.md`.

---

## 6. Additional ideas and things to get right

### 6.1 A replay observation room — the best demo in the submission

Not a live harness: a static page that reads a recorded run's `.jsonl` from
`site/data/` and steps through it on a timer, with play/pause and a round scrubber.
No server, no key, no cost, no abuse surface. A judge watches a real negotiation
unfold and *sees* the two consultation panels stay sealed from each other — which is
the entire thesis, demonstrated instead of asserted. `public/app.js` already renders
these events off a stream, so feeding it a static file with a timer is a contained
change rather than a rewrite. Build it after the shell is approved; cut it if the
clock beats us, but it's worth more than any additional chart.

### 6.2 Generate the numbers, don't type them

Write `site/build-results.mjs` — Node stdlib only — that reads
`runs/evaluation runs/**/*.jsonl` and emits `site/data/results.json`: one row per run,
plus per-arm and per-model aggregates and divergence counts. Every figure, table and
chart renders from that file. Three reasons: numbers can't go stale; the page and the
repo can't disagree; and *"every figure on this page is generated from the run logs by
a script in this repo"* is a line worth putting on the site.

### 6.3 Scoreboard shape

Rows: model × arm (8 rows for the matched set, plus the eugva row marked
Sonnet-only). Columns: n · settled · settle rate · mechanical vs judge-rescued ·
avg pool · avg UK tranche · share · out-of-quota % · mandate events per round ·
capital overrides · co-national ≥3 rate · blind recovery.

Cells with no data get an explicit **"not run"** marker with a one-line reason on
hover — never a blank, never a zero. Empty cells read as sloppiness; labelled ones
read as scope control. Put **n = 4** next to every arm-level number in the same visual
unit, not in a footnote at the bottom.

### 6.4 Four traps

1. **Never publish raw `n_mandate_exceeded` as "breaches."** The adjudicated read of
   the 49 flagged deviations in the Sonnet main batch was **40 compliant fallback /
   2 true breach / 7 ambiguous**. Label the raw metric "tabled outside capital's
   stated point figure" and show the adjudicated split beside it.
2. **Define "settled" once, in a footnote, and use it everywhere.** 10/16 includes 3
   judge-rescued; mechanically 7/16. Show both. The existing artifact pages emphasise
   this differently and the site must not.
3. **State model-settings parity.** The Kimi runs were at reasoning effort "high";
   say what Claude ran at, or say explicitly that settings were provider-default. One
   sentence protects the whole comparison.
4. **Lead the model comparison with mechanism, not ranking.** "They fail differently"
   (0.33 vs 0.05 mandate events per round; 3 vs 10 capital overrides) is both more
   interesting and less likely to read as a leaderboard puff piece.

---

## 7. Build order for today

1. **Shell** — nav, all eleven sections, styling, placeholder prose. Show me before
   any copy goes in.
2. **`build-results.mjs` → `results.json`**, wired to the scoreboard and charts, so
   real numbers are in from the start and only prose is on the critical path.
3. **Methods and validity**, **limitations**, **reproduce it** — these three are the
   difference between a pitch page and a submission.
4. **Transcript exhibit.**
5. **Replay observation room.**
6. **Mandarin abstract** — one paragraph, only if the clock allows.

Open decisions I still owe you: whether judge-rescued settlements count in the
headline (my instinct: show both), whether the public repo includes `evaluation/`
(inclined yes), and how much of the prompt set we publish in full.
