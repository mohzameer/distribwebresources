# Daily engineering news

A personal, single-user news page: **DevOps**, **distributed systems**, **AWS**, and
**big-company engineering blogs**, gathered twice a day from ~89 free RSS/Atom feeds and
free no-key APIs. No paid services anywhere — GitHub Actions, Neon's free tier and Vercel
Hobby.

Articles carry a **30-day TTL** and are deleted automatically. Anything you save is kept
forever.

## How it works

Two processes, one database, no server to run.

| | |
|---|---|
| **Ingest** | A TypeScript script run by GitHub Actions at **05:55 and 17:55 Asia/Colombo**. Fetches every feed, normalizes, scores, dedupes, stores, prunes. |
| **Read** | A Next.js App Router app on Vercel. Every page is a cached render, so a page load touches Postgres zero times. |

Feed definitions and scoring rules are committed TypeScript imported by *both*, so the app
and the ingester can never disagree about what a lane is.

## Pages

| | |
|---|---|
| `/` | **The recommended edition.** Ranked for you, with every row stating why it is there. |
| `/front` | The broadsheet front page: a lead story then a band per topic, the same for any reader. |
| `/unread` | The front page with everything you have read removed. |
| `/t/<topic>`, `/s/<source>` | Topic and per-source archives. |
| `/saved`, `/sources`, `/health` | Keepsakes, the feed index, and the ingest dashboard. |
| `/v/<layout>` | Four alternative layouts of the same window: digest, cards, compact, timeline. |
| `/noteorg` | Your highlights and notes, per article, with search. Written from the Chrome extension below. |

## Recommendations, with no AI in them

`/` is a recommender built entirely out of 1960s information retrieval, running in
TypeScript over the ~1000 rows the page already loaded. Everything is in
[`config/recommend.ts`](config/recommend.ts) and [`src/recommend.ts`](src/recommend.ts).

```
vector      = L2-normalized TF-IDF over title (x2) + summary, IDF taken from the window
profile     = weighted centroid of what you saved (x3) and opened (x1)   [Rocchio]
affinity    = cosine(profile, item)
score       = renderScore x (1 + affinityBoost x affinity x confidence)
confidence  = min(1, seeds / 25)
selection   = maximal marginal relevance, lambda 0.72, capped per source and per topic
novelty     = 1 - (share of the item's vector weight on terms the profile knows)
reserved    = 2 news seats + 2 explore seats of 12, rotating every 12h
```

Four deliberate choices are worth knowing about:

- **The personal signal multiplies the editorial score, it does not replace it.** A
  mediocre post about your favourite subject still cannot outrank a genuinely excellent
  one. `base_score` and the per-topic half-lives remain the backbone.
- **Cold start is scaled, not hidden.** `confidence` is literally "how much feedback
  exists", so a profile built from three clicks tilts the page by about 10% instead of
  taking it over. The strip at the top of the page shows the profile's terms and its
  current weight, so you can always see what the engine thinks it knows.
- **Maximal marginal relevance, not just a sort.** Five write-ups of the same outage have
  near-identical vectors, so picking the first suppresses the rest without any rule
  naming the event.
- **Every row explains itself.** `Matches kubernetes · ebpf` means the profile matched;
  `Top of DevOps` means it did not and the row is there on editorial merit. The chip is
  never a guess.

### Reserved seats: four of the twelve are not ranked at all

Merit ranking is where a feedback loop starts. The profile is built only from what you
clicked, and you can only click what the page showed you, so left alone it closes: the
ranking narrows, the narrower page produces narrower clicks, and the engine ends up very
confident about a shrinking slice of the world. Nothing in the arithmetic above can
notice that happening, because from the inside it looks like relevance improving.

Two things keep it open, and both bypass the ranking entirely:

| | |
|---|---|
| **News seats** (ranks 4 and 9) | The aggregator lane, with Hacker News, Lobsters and Slashdot taking turns. |
| **Explore seats** (ranks 6 and 12) | The strongest articles whose vocabulary the profile has *never seen*. |

Both rotate every 12 hours, and every reserved row says so on its chip — `News seat`,
`New ground · 91%` — because a row that is not there on merit is a different claim, and
the reader deciding whether to click deserves to know which claim is being made.

The news quota is not a nicety. Measured over the live window, the best Hacker News item
scores 3.6, the best Lobsters item 3.0 and the best Slashdot item 1.5, against 6.9 for the
best item on the page: Slashdot carries a −1 source weight, the community half-life is
24h, and consumer-tech news matches none of the topic keywords. News does not rank badly
here, it cannot rank at all, so a quota is the only thing that will ever surface it. The
*sources* rotate rather than the items, because taking the two best community items would
mean Hacker News and Lobsters every single time — Slashdot's ceiling sits below their
floor. Over eight epochs the seats came out hn-top 5, lobsters 5, slashdot 6.

Exploration is gated on **novelty**, not on low affinity — the share of an article's
vector weight sitting on terms the profile has no weight for at all. Cosine affinity
cannot do that job: over the live window it runs 0.00 to 0.13 with a median of 0.02, so
"low affinity" is true of almost everything and selects nothing in particular. Novelty
runs 0.42 to 1.00. It is a *gate* rather than the sort key, though, because with a young
profile it saturates — the median item scores 0.93 — and ranking by it surfaces whatever
has the most obscure wording, which is how `v1.33.0-167.2` and *The Utah Teapot* took
seats in testing. The pool is ranked by editorial score and novelty decides who gets in.

Two smaller rules fall out of the same concern. Every topic is guaranteed one seat
(`minPerTopic`), because the caps stop a lane dominating but do nothing to stop one
vanishing. And reserved seats are checked against each other for near-duplicates, because
skipping the ranking means skipping MMR with it — on the first run Slashdot and Hacker
News both spent a seat on the same Jensen Huang story, at ranks 4 and 9 of twelve.

Clicking a reserved row feeds it straight back in: it becomes an ordinary seed, the
centroid moves, and the subject is in the fold from the next render. That is the whole
mechanism — the seats exist to manufacture the evidence the profile would otherwise never
be given.

There are **no implicit negatives** yet, and that is the one real gap. The obvious one --
"shown on the front page and never clicked" -- needs an impression log, and the homepage
is served from the ISR cache and touches Postgres zero times, so it has no way to write
one. The honest fix is for the *ingest* job to snapshot what each edition would have shown
when it runs; it is connected anyway, and that preserves the zero-query homepage.

Collaborative filtering ("readers like you also read...") is not an option and never will
be: there is one reader.

## Commands

```bash
npm run dev                  # the site, http://localhost:3000
npm run ingest -- --dry-run  # fetch + parse + score, print, touch NO database
npm run ingest               # a real run (fetch, store, prune)
npm run sample -- <feed-id>  # show the scoring decision for every item in one feed
npm run rescore              # preview what edited weights would do to stored items
npm run rescore -- --apply   # write those new scores
npm run report -- --summary  # the markdown run report
npm run migrate              # apply pending migrations
npm run ext:build            # build the notes Chrome extension into extension/dist
npm run ext:zip              # ...and package it for the Chrome Web Store
```

`--dry-run` needs no `DATABASE_URL`, which makes it the fast way to confirm all feeds still
parse.

## Notes: the Chrome extension and `/noteorg`

A personal knowledge manager on top of the reader. Open an article **from the site**, then:

- **Right-click a selected passage → Add to page notes** to save it as a highlight.
- **Click the toolbar icon** to open the side panel: the article's highlights and notes,
  and **+ Add note** for a Substack-style editor (select text for formatting, `##`, `>`,
  `-` and `**bold**` markdown shortcuts, ⌘↵ to save). Drafts survive closing the panel.
- **`/noteorg`** lists every article you have notes on, with search; each page lets you
  edit, delete and add notes from the web too.

Only tabs opened from the site count (the extension watches `webNavigation`, since the
site's links are `noopener noreferrer`), plus pages that already have notes. Each note
page is tied to its `items` row with source and topic denormalized onto it, and every
entry stores plain text beside the rich document, so the notes can feed analytics later.
Taking a note **stars the article**, so it outlives the 30-day prune.

Setup, once:

1. Set `NOTES_API_TOKEN` (`openssl rand -base64 32`) in `.env.local` and on Vercel. The
   extension calls `/api/notes/*` with it as a bearer token; those routes sit outside the
   cookie gate.
2. `npm run migrate` (adds `note_pages` and `note_entries`, granted to the `web` role).
3. `npm run ext:build`, then in Chrome: `chrome://extensions` → **Developer mode** →
   **Load unpacked** → `extension/dist`. It is never published.
4. The extension's options page opens on first use: enter the site URL
   (`http://localhost:3000` or your domain) and the token, then **Save** (Chrome asks for
   access to that one site).

To install it without Developer mode, publish it **unlisted** on the Chrome Web Store:
`npm run ext:zip` packages it, and [`extension/STORE.md`](extension/STORE.md) has the
listing text, permission justifications and privacy answers. The policy it links to is
`/privacy`, which is public.

`npm run ext:watch` rebuilds on change; press reload on the extension card afterwards. The
editor is shared: `components/notes/` is bundled by Next for `/noteorg` and by esbuild
for the side panel.

## Retention

| What | Lives | Why |
|---|---|---|
| Articles | **30 days** | Deleted by the prune step at the end of every ingest run, so nothing exceeds 30 days + ~12h. |
| Saved / pinned articles | forever | `saved_at is not null` is excluded from the prune predicate. |
| Dedupe keys | 90 days | Bare sha256 hashes — no title, URL or text. |

Dedupe memory deliberately outlives the articles. If a post is deleted at 30 days and
someone submits it to Hacker News in week six, the surviving hash stops it coming back as
"new" — and its `disposition` column remembers you already read it.

`pg_cron` is available on Neon but is **not** used: free-tier compute auto-suspends when
idle and pg_cron only fires while it is awake, so articles could outlive the TTL
unpredictably. The ingest job is connected at prune time, so it always runs.

## Setup

1. **Database** — create a Neon project, then `cp .env.example .env.local`, fill in
   `DATABASE_URL`, and run `npm run migrate`.
2. **Deploy** — import the repo on Vercel. Set `DATABASE_URL` (use a restricted `web`
   role, see below), `REVALIDATE_SECRET` and `APP_PASSWORD` (the site is behind HTTP Basic;
   with no password set it stays open, which is what you want locally).

   Vercel enables SSO Deployment Protection by default, which redirects every request to a
   Vercel login — so a `.vercel.app` URL only opens in a browser signed into your Vercel
   account, and the cache-refresh webhook below silently stops reaching it.

   That default is scoped `all_except_custom_domains`, so **attaching a custom domain is
   the cleanest fix** — the custom domain is exempt from SSO while the preview URLs stay
   protected, and `APP_PASSWORD` guards it from any device:

   ```bash
   vercel domains add news.example.com <project>
   ```

   Vercel then prints the DNS record to add at your provider (an `A` record to
   `76.76.21.21` when the domain uses third-party nameservers). If you would rather use the
   `.vercel.app` URL directly, turn the wall off instead with
   `vercel project protection disable --sso`.
3. **Schedule** — add repository **secrets** `DATABASE_URL` (the *owner* role; ingest
   writes) and `REVALIDATE_SECRET`, plus a repository **variable** `SITE_URL`. The workflow
   must be merged to the default branch before any scheduled run happens.
4. **First week** — set the repository variable `DROP_DRY_RUN=1`. Hard-drop rules then only
   *log* what they would delete, to the job summary. A dropped item leaves no trace, so
   read a week of those lists before trusting the rules, then remove the variable.

### Two things that will bite you otherwise

- **GitHub disables scheduled workflows after 60 days of repository inactivity.** This job
  writes to Neon, not to git, so the repo can look idle and the cron stops silently. Note a
  `keepalive.yml` on its own `schedule` would *not* fix it — it is subject to the same rule;
  only real repository activity resets the clock. There is deliberately no automated
  keepalive here: push any commit every couple of months instead. GitHub emails you before
  it disables anything, `gh workflow enable ingest.yml` re-enables it, and `/health` shows a
  stale `last run` within a day.
- **Use two different database credentials.** Give Vercel a `web` role with `select` plus
  column-level `update (read_at, saved_at, pinned, note)`, and keep full DML for the
  `ingest` role in Actions. Then a bug in the web app cannot delete your saved articles.

## Tuning what you see

Everything lives in [`config/scoring.ts`](config/scoring.ts):

```
base_score  = baseline + keywords + sourceWeight + signals - penalties   [stored]
renderScore = base_score x 2^(-ageHours / halfLife[topic])               [at render]
```

`base_score` is stored and time-independent, so lane order is correct at any hour without a
rescore job. Per-topic half-lives (AWS 18h, engineering blogs 144h) are what let one
mechanism show "today's AWS" and "the best engineering posts of the past fortnight" from
the same window.

`renderScore` is also what the recommender multiplies its personal affinity into, so
tuning the weights below moves both pages at once.

Lanes rank over the **whole 30-day window**, never a fixed time box — AWS publishes ~9
items/day while Netflix publishes 1–3 posts a week, so a "last 24 hours" lane would leave
Engineering Blogs empty and make AWS a wall.

The loop: `npm run sample -- <feed>` to see decisions, edit weights, `npm run rescore` to
preview, `-- --apply` to write. Lane order is one line (`TOPICS` in `config/scoring.ts`).

## Adding and removing feeds

Edit `config/feeds/*.ts`; they are zod-validated at load and ids must be unique. Removing a
feed also drops its health row and its *unsaved* items on the next run. `/health`
distinguishes two different problems: **failing** (no response or no parse) and **stale**
(returns 200 forever but stopped publishing — High Scalability last posted in March 2024).

Feeds deliberately excluded: Uber (406s non-browser clients — we do not spoof a browser UA
to defeat a bot check), Figma, ClickHouse, CockroachDB and TigerBeetle (no working feed),
and Reddit (429s from cloud IPs; add it with `bestEffort: true` if you want it).
