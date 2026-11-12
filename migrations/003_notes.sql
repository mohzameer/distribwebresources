-- Knowledge manager: notes and highlights taken on articles opened from the site.
--
-- A note page is one article. It is keyed by the same canonical URL as items.url_key, and
-- carries source/topic denormalized: the notes are meant to feed analytics later, so they
-- must stay attributable even if the item row is ever deleted (item_id then goes NULL).
-- Taking a note also stars the item, so in practice the item survives the 30-day prune.

create table if not exists note_pages (
  id          bigint generated always as identity primary key,
  url         text not null,          -- the URL as clicked on the site
  url_key     text not null,          -- canonicalUrl(url), same key space as items.url_key
  title       text not null,
  item_id     bigint references items(id) on delete set null,
  source_id   text,
  source_name text,
  topic       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint note_pages_url_key_uniq unique (url_key)
);

create index if not exists note_pages_updated_idx on note_pages (updated_at desc);
create index if not exists note_pages_item_idx on note_pages (item_id) where item_id is not null;

create table if not exists note_entries (
  id         bigint generated always as identity primary key,
  page_id    bigint not null references note_pages(id) on delete cascade,
  kind       text not null check (kind in ('highlight', 'note')),
  quote      text,                    -- highlight: the selected passage
  doc        jsonb,                   -- note: Tiptap/ProseMirror JSON
  text       text not null default '',-- plain text of either, for search and analytics
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_entries_shape check (
    (kind = 'highlight' and quote is not null) or (kind = 'note' and doc is not null)
  )
);

create index if not exists note_entries_page_idx on note_entries (page_id, created_at);

-- The web app runs as a restricted `web` role (see README). It owns these tables'
-- writes, unlike items where it may only touch a few columns. No-op where the role does
-- not exist, e.g. a local database.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web') then
    grant select, insert, update, delete on note_pages, note_entries to web;
    grant usage, select on sequence note_pages_id_seq, note_entries_id_seq to web;
  end if;
end
$$;
