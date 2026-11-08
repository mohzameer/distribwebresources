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
| **Read** | A Next.js App Router app on Vercel. The home page is a cached render of five topic lanes, so a page load touches Postgres zero times. |

Feed definitions and scoring rules are committed TypeScript imported by *both*, so the app
and the ingester can never disagree about what a lane is.

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
```

`--dry-run` needs no `DATABASE_URL`, which makes it the fast way to confirm all feeds still
parse.

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
2. **Deploy** — import the repo on Vercel. Set `DATABASE_URL`, `REVALIDATE_SECRET`
   (`openssl rand -base64 32`) and `APP_PASSWORD` (the site is behind HTTP Basic; with no
   password set it stays open, which is what you want locally).
3. **Schedule** — add repository **secrets** `DATABASE_URL`, `REVALIDATE_SECRET` and
   `KEEPALIVE_TOKEN`, and a repository **variable** `SITE_URL`. The workflow must be merged
   to the default branch before any scheduled run happens.
4. **First week** — set the repository variable `DROP_DRY_RUN=1`. Hard-drop rules then only
   *log* what they would delete, to the job summary. A dropped item leaves no trace, so
   read a week of those lists before trusting the rules, then remove the variable.

### Two things that will bite you otherwise

- **GitHub disables scheduled workflows after 60 days of repository inactivity.** This job
  writes to Neon, not to git, so the repo looks idle and the cron stops silently. A
  `keepalive.yml` on its own `schedule` does *not* fix it — it is subject to the same rule.
  Only real repository activity resets the clock, so the workflow commits a run summary
  once a week using `KEEPALIVE_TOKEN` (a fine-grained PAT with `contents: write`).
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
