-- SketchDuel persisted scores (run in Supabase SQL editor)
-- Server uses SUPABASE_SERVICE_ROLE_KEY to upsert; anon can read for optional client use.

create table if not exists public.room_scores (
  room_id text not null,
  player_id text not null,
  nickname text not null,
  score int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room_id, player_id)
);

create index if not exists room_scores_room_id_idx on public.room_scores (room_id);

alter table public.room_scores enable row level security;

create policy "room_scores_select_all"
  on public.room_scores for select
  using (true);

-- Inserts/updates are done with the service role (bypasses RLS). No insert policy for anon.
