-- ============================================================
--  klym — additive migration on top of db/schema.sql
--  Run this in the Supabase SQL editor AFTER schema.sql.
--
--  schema.sql is the given, correct source of truth for the board's
--  scoring model and is left untouched. This file only adds columns
--  schema.sql doesn't have yet: payer email/receipts, Stripe
--  idempotency + refund bookkeeping, and rank tracking for overtake
--  emails. Nothing here changes the `board` view or its formula.
-- ============================================================

alter table entries
  add column if not exists email                  text,
  add column if not exists stripe_session_id       text unique,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists rejected                boolean not null default false,
  add column if not exists reject_reason           text,
  add column if not exists refunded                boolean not null default false,
  add column if not exists last_known_rank         integer,
  add column if not exists resolved_url            text;

-- The webhook uses this to guarantee a replayed Stripe event can never
-- insert a second entry for the same Checkout Session.
create unique index if not exists entries_stripe_session_id_key
  on entries (stripe_session_id)
  where stripe_session_id is not null;

-- The admin queue lists everything still awaiting a decision.
create index if not exists entries_pending_idx
  on entries (created_at)
  where approved = false and rejected = false;

-- ---------- log of automatic-filter decisions, for the audit trail ----------
create table if not exists filter_rejections (
  id          bigserial primary key,
  entry_id    bigint references entries(id) on delete cascade,
  reason      text not null,
  detail      text,
  created_at  timestamptz not null default now()
);
