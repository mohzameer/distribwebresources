-- Personal engineering-news reader: initial schema.
--
-- Retention model:
--   items      -> 30-day TTL, deleted by the prune step at the end of every ingest run.
--                 Rows with saved_at IS NOT NULL or pinned = true are exempt forever.
--   item_keys  -> 90-day dedupe memory. Hash-only (32-byte sha256, no title/url/text).
--                 When an item is pruned the FK sets item_id to NULL, turning the row into
--                 a tombstone so a re-syndicated article is not re-shown as "new".

create table if not exists items (
  id            bigint generated always as identity primary key,

  -- provenance. source_id matches a stable id in config/feeds/*.ts; deliberately no FK,
  -- so removing a feed from config can never fail on a constraint.
  source_id     text not null,
  -- denormalized on purpose: a saved item must still render its source label years later,
  -- even if that feed has since been deleted from config.
  source_name   text not null,
  topic         text not null,

  url           text not null,
  url_key       text not null,
  title         text not null,
  summary       text,
  author        text,

  published_at  timestamptz not null,
  published_estimated boolean not null default false,
  first_seen_at timestamptz not null default now(),

  -- time-INDEPENDENT score. Recency decay is applied at render time, so lane order is
  -- correct at any hour without a rescore job ever running.
  base_score    real not null,
  score_version smallint not null,
  score_debug   jsonb,

  -- cross-source enrichment: an HN submission of a blog post merges INTO that post.
  hn_url        text,
  hn_points     integer,

  -- single-user state; no users table, this is a personal site.
  read_at       timestamptz,
  saved_at      timestamptz,
  pinned        boolean not null default false,
  note          text,

  constraint items_url_key_uniq unique (url_key)
);

create index if not exists items_lane_idx  on items (topic, base_score desc);
create index if not exists items_saved_idx on items (saved_at desc) where saved_at is not null;
create index if not exists items_prune_idx on items (published_at)
  where saved_at is null and pinned = false;

-- Dedupe keys AND tombstones in one table.
create table if not exists item_keys (
  key_type      text  not null,   -- 'guid' | 'url' | 'title'
  key_hash      bytea not null,   -- sha256, 32 bytes
  item_id       bigint references items(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  -- carries read/saved state across a prune, so a resurfaced article stays read.
  disposition   text  not null default 'none',  -- 'none'|'read'|'dismissed'|'saved'
  primary key (key_type, key_hash)
);

create index if not exists item_keys_item_idx on item_keys (item_id) where item_id is not null;
create index if not exists item_keys_gc_idx   on item_keys (last_seen_at) where item_id is null;

-- Per-feed health. Keyed by config id, no FK.
create table if not exists feed_health (
  source_id            text primary key,
  last_attempt_at      timestamptz,
  last_success_at      timestamptz,
  last_new_item_at     timestamptz,
  -- newest published_at ever seen: the staleness signal, which is a DIFFERENT failure from
  -- a non-200. A dead-but-healthy blog returns 200 forever.
  newest_published_at  timestamptz,
  consecutive_failures integer not null default 0,
  last_status          integer,
  last_error           text,
  etag                 text,
  last_modified        text,
  -- fallback change detection for the many feeds that send no validator at all.
  last_body_hash       bytea,
  auto_disabled_at     timestamptz,
  auto_disabled_reason text
);

-- One row per ingest run: the only run log.
create table if not exists ingest_runs (
  id             bigint generated always as identity primary key,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  trigger        text not null,          -- 'schedule' | 'dispatch' | 'local'
  git_sha        text,
  feeds_total    integer, feeds_ok      integer, feeds_failed   integer,
  items_seen     integer, items_inserted integer, items_merged  integer,
  items_dropped  integer,
  pruned_items   integer, pruned_keys   integer,
  duration_ms    integer
);

create index if not exists ingest_runs_started_idx on ingest_runs (started_at desc);
