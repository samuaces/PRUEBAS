-- ============================================================
--  Carry — schema
--  Run in the Supabase SQL editor.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- entries on the board ----------
create table entries (
  id            bigserial primary key,
  slug          text unique not null,          -- what appears in /r/<slug>
  name          text not null,
  target_url    text not null,
  paid_cents    bigint not null default 0,
  visit_count   bigint not null default 0,     -- counter kept by the trigger below
  approved      boolean not null default false, -- nothing is public until you approve it
  created_at    timestamptz not null default now()
);

create index on entries (approved, paid_cents desc);

-- ---------- one row per counted visit ----------
-- No raw IP is ever stored. visitor_hash = HMAC(ip + user agent + day, secret).
create table visits (
  id            bigserial primary key,
  entry_id      bigint not null references entries(id) on delete cascade,
  visitor_hash  text not null,
  day           date not null,
  created_at    timestamptz not null default now()
);

-- THE dedup rule: one visitor can only count once per entry per day.
-- The database enforces it, so a race between two requests cannot double-count.
create unique index visits_once_per_day
  on visits (entry_id, visitor_hash, day);

create index on visits (entry_id, created_at desc);

-- ---------- rejected traffic, for your own review ----------
create table visit_rejects (
  id          bigserial primary key,
  entry_id    bigint references entries(id) on delete cascade,
  reason      text not null,      -- bot_ua | datacentre | duplicate | rate_limit | no_ip
  day         date not null,
  created_at  timestamptz not null default now()
);

create index on visit_rejects (entry_id, day);

-- ---------- keep visit_count in step with the visits table ----------
create or replace function bump_visit_count() returns trigger as $$
begin
  update entries set visit_count = visit_count + 1 where id = new.entry_id;
  return new;
end $$ language plpgsql;

create trigger visits_bump
  after insert on visits
  for each row execute function bump_visit_count();

-- ---------- the score, computed in one place ----------
--   score = paid + traffic value, traffic capped at 70% of the total
--   0.50 EUR (50 cents) of score per counted visit
create or replace view board as
select
  e.id, e.slug, e.name, e.target_url, e.approved,
  e.paid_cents,
  e.visit_count,
  least(
    e.visit_count * 50,                                  -- raw traffic value
    (e.paid_cents * 70) / 30                             -- cap: traffic <= 70% of total
  )::bigint as earned_cents,
  e.paid_cents + least(
    e.visit_count * 50,
    (e.paid_cents * 70) / 30
  )::bigint as score_cents
from entries e
where e.approved = true;

-- ---------- growth check, for spotting bought traffic ----------
-- Run this daily. A real audience arrives in a curve; bought traffic
-- arrives flat and fast. Look at entries near the top of the hourly count.
create or replace view visit_velocity as
select
  entry_id,
  date_trunc('hour', created_at) as hour,
  count(*) as visits
from visits
where created_at > now() - interval '7 days'
group by 1, 2
order by visits desc;
