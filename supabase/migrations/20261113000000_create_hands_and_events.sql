create table public.hands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  hand_text text not null check (char_length(hand_text) <= 20000),
  hero_class text not null check (char_length(hero_class) <= 4),
  hero_position text not null check (char_length(hero_position) <= 8),
  net_bb numeric not null,
  ev_loss_bb numeric not null default 0,
  mistakes int not null default 0,
  inaccuracies int not null default 0,
  flags jsonb not null default '[]'::jsonb check (pg_column_size(flags) <= 8192),
  profile text not null default 'standard' check (profile in ('passive', 'standard', 'aggressive')),
  range_overrides jsonb not null default '{}'::jsonb check (pg_column_size(range_overrides) <= 8192),
  created_at timestamptz not null default now()
);
create index hands_user_created_idx on public.hands (user_id, created_at desc);
alter table public.hands enable row level security;
create policy "Users read their own hands" on public.hands for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users save their own hands" on public.hands for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users delete their own hands" on public.hands for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.hands from anon, authenticated;
grant select, insert, delete on public.hands to authenticated;

-- Product usage events. Write-only from the client; read them from the dashboard or SQL.
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  session_id text not null check (char_length(session_id) <= 64),
  name text not null check (char_length(name) <= 64),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 2048),
  created_at timestamptz not null default now()
);
create index events_name_created_idx on public.events (name, created_at desc);
create index events_user_idx on public.events (user_id);
alter table public.events enable row level security;
create policy "Clients can log their own events" on public.events for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
revoke all on public.events from anon, authenticated;
grant insert on public.events to anon, authenticated;
