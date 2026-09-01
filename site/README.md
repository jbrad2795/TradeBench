# site/

The public results and pitch site. Plain static HTML/CSS/JS — no framework, no
build step, no dependencies. It serves unchanged from Vercel, GitHub Pages, or
a local folder.

## Files

| File | What it is |
| --- | --- |
| `index.html` | **Overview** — hero, parameters, in plain terms, why it matters, key findings, how it works. |
| `evidence.html` | **Evidence** — results, figures, exhibit, methods, limitations, reproduce. |
| `whats-next.html` | **What's next** — roadmap; one placeholder slot, JB to fill. |
| `observation-room.html` | **Observation room** — the replay viewer. |
| `og.html` | Social-card source at exactly 1200×630. Screenshot it, save as `og.png`. |
| `styles.css` | Tokens carried over from `public/styles.css` so the two surfaces match. |
| `app.js` | Renders every number, table and figure from `data/results.js`. Contains no data. Every DOM write is guarded, so the one file runs unchanged on all pages. |
| `nav.js` | Marks the current top-nav link and runs the per-page section scrollspy. Shared, no data. |
| `replay.js` | The observation-room player. Reads `data/replay.js`. Contains no data. |
| `build-results.mjs` | Reads the raw run logs and emits everything in `data/`. Node stdlib only. |
| `serve.mjs` | Local preview server, port 4174. Not needed to deploy. |

## Page structure

Four pages, each a scroll-down with a sticky section sub-nav:

| Page | Sections | Top-nav label |
| --- | --- | --- |
| `index.html` | hero · parameters · in plain terms · why it matters · key findings · how it works | Overview |
| `evidence.html` | results · figures · exhibit · methods · limitations · reproduce | Evidence |
| `whats-next.html` | (placeholder) | What's next |
| `observation-room.html` | the replay | Observation room |

The top nav is the same four links on every page (`.nav a.current` marks the
active one). Each content page carries a `.subnav` — a sticky bar of jump links
to that page's sections, with an IntersectionObserver in `nav.js` highlighting
the one in view. On mobile the sub-nav scrolls with the page rather than
sticking, because the wrapped top bar has no fixed height to offset against.

Header and footer markup is duplicated across the page files (there is no build
step to include them). If you change one, change all four. `build-results.mjs`
does **not** touch the HTML — page structure is hand-edited.

## The observation room

`observation-room.html` replays one recorded run from `data/replay.js` on a
timer — play/pause, step, speed, and a round scrubber. **It calls no API.**
There is no live harness behind it: a public one would put an open spend surface
on the internet, and a recorded run demonstrates the same thing.

The run is `REPLAY` in `build-results.mjs` — `control/rep2`, chosen because it
shows the whole arc: a `uk-geneva` mandate breach at round 2, refusals on both
sides, and a poll that closes only after the reconciliation judge rules the two
capitals accepted the same package.

Jumping to a round re-applies events from zero rather than rewinding, so the
scrubber is exact rather than approximate. `apply()` is a pure function of one
event — keep it that way or the scrubber stops being correct.

## Regenerate the numbers

```bash
node site/build-results.mjs
```

Reads `runs/evaluation runs/**/*.jsonl`, plus the two judged panels in
`evaluation/`. Writes `data/results.json` (for download and citation) and
`data/results.js` (a `window.TB_RESULTS` global).

Both are emitted deliberately: the page reads the `.js` via a `<script>` tag
rather than `fetch`, so `index.html` works opened straight off the filesystem
with no server and no CORS problem.

**Nothing on the page is typed by hand.** If a figure looks wrong, fix the
script, not the markup.

## Preview

```bash
node site/serve.mjs
```

## Conventions that matter

- **Two counts, always together.** An *event* is one seat-round in which
  something happened at least once; an *item* is each occurrence inside it.
  Refusal rates differ by ~2.5× between the two readings. Both are published,
  and neither is presented alone.
- **Two settlement figures, always together.** `settled` includes settlements
  the reconciliation judge rescued; `settledMechanically` does not. Sonnet is
  10/16 and 7/16 respectively.
- **The co-national scorer's median convention is copied exactly.** It drops
  nulls, sorts, and takes `xs[len//2]` — the *upper* median on an even count,
  not the average of the middle two. Any other convention silently disagrees
  with `conational_report.md`. Same for the modal axis.
- **Judged panels are gated to the model they actually read.** Co-national
  recognition and the blind disposition panel both cover Claude Sonnet 5 only.
  Their columns render as *not run* on the Kimi rows rather than carrying
  across.
- **Empty cells are labelled, never blank.** `not run` (with a reason on hover)
  where a condition was never executed; `no settlement` where the arm ran and
  nothing settled.

- **The test count is generated too.** `build-results.mjs` counts `test(`
  declarations in `test/*.test.js`. The repo README said 29 long after the suite
  had grown to 58; a counted number cannot drift like that. Verified equal to
  `npm test`'s runtime pass count.
- **Methods invariants cite the test that enforces them**, by name. If a test is
  renamed, the claim on the page should be renamed with it.

## Downloads

`build-results.mjs` copies these into `data/` on every build:

| File | What |
| --- | --- |
| `results.json` / `results.js` | Every figure on the page |
| `replay.js` | The observation room's run, stripped to renderable fields |
| `sample-run.md` | One full transcript, channel-separated |
| `sample-run.jsonl` | The same run's raw event stream |
| `run-index.csv` | All 36 canonical runs, one row each |

The sample run is `SAMPLE` in `build-results.mjs` — deliberately the run the
transcript exhibit quotes, so a reader can check the excerpt against its source.
Change the exhibit and change `SAMPLE` with it.

## Draft mode — editing prose in the page

Append **`?edit`** to any page URL (`index.html?edit`, `evidence.html?edit`, …).
**Every piece of visible text becomes an editable block** — headings, paragraphs,
list items, table cells, section eyebrows, phase labels, slots. Click and type.
A bar at the bottom shows how many blocks you have changed.

Not editable: the top nav and the section sub-nav (structural), and anything
app.js generates — see the locked-regions note below.

While draft mode is on, every link to another page carries `?edit` forward, so
navigating with the top menu keeps you in draft mode. Plain page loads (no
`?edit`) are the normal, non-editable site.

- **Autosaves to `localStorage`** as you type, and survives a reload.
- **Download drafts** writes a `drafts.json` of only the blocks you changed,
  each with the original HTML and the new HTML. Hand that file to Claude to
  merge into `index.html`.
- **Reset all** restores every block to the committed text.
- **Exit** drops the `?edit` flag and returns the normal page.

`edit.js` **never writes to any file.** That is the whole safety argument: the
page has no way to reach the source, so a bad edit costs you a re-type, never a
corrupted file. The merge back into `index.html` is done by hand.

Two consequences worth knowing:

- Drafts are keyed by block path and stored per page. Editing across several pages is fine; download once per page you touched.
- Drafts live in one browser profile. Clearing site data or moving machines
  loses them — download before you walk away.
- **Generated regions are locked and cannot be edited.** The parameters strip,
  scoreboard, figures, limitations, citation, downloads, the settled footnote
  and the inline figures inside the findings and methods text all come out of
  `build-results.mjs` reading the run logs. Locked values show with a 🔒 and
  stay atomic while you type around them. If a number is wrong, fix the script,
  never the page.

`?edit` is the only trigger, so a normal visitor and the deployed site are
unaffected. Delete `edit.js` and its one `<script>` tag once the prose is final.

## Deploy

The site is static. No build command, no install step, no server-side anything.

`vercel.json` at the repo root pins `outputDirectory: "site"`, so Vercel serves
this folder and **not** the repo root. That matters: it keeps the harness,
`.env` and the raw run logs out of the deployed bundle. Connect the repo and
Vercel needs no further configuration.

GitHub Pages works too — point it at `/site` on the default branch. Every asset
path in the HTML is relative, so the site also runs from a subdirectory or
straight off the filesystem.

### One thing to set after the first deploy

`og:image` in `index.html` is a **relative** path. Facebook, LinkedIn and Slack
crawlers require an absolute URL and will not render the card without one. Once
the domain exists:

```html
<meta property="og:image" content="https://YOUR-DOMAIN/og.png">
<meta property="og:url" content="https://YOUR-DOMAIN/">
<meta name="twitter:image" content="https://YOUR-DOMAIN/og.png">
```

Check it with Facebook's Sharing Debugger or by pasting the link into Slack.

### Before going public

- `git check-ignore .env` must print a match. It does today; confirm it still does.
- `node site/build-results.mjs` so the committed `data/` matches the run logs.
- `npm test` green.

## Still to do

- **Prose slots** - the four finding bodies are still placeholders. Everything
  marked `.slot` is visible on the page in draft mode.
- Absolute `og:image` once the deploy URL exists (see Deploy above).
- `og.png` still carries the old em-dash headline; recapture from `og.html` if
  that matters.

Settled since: the qualitative Comparison section replaced the single-excerpt
exhibit; prompt publication is resolved (Blocks 1/2/2b/4/5 summarised on the
overview, Block 3 printed verbatim, the rest linked to the repo).

## Nice to have, not needed for submission

- A Mandarin abstract — one paragraph, not a second site.
- A second replay run to switch between.
- Practitioner Likert ratings over the same transcripts ("realness of strategy",
  which has no data on disk and is deliberately not a metric on the site).
