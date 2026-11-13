-- Errors from the browser and the server, for the private metrics page. Like `events`, clients may only
-- insert; reading needs the secret key on the server. Rows hold a short message, a trimmed stack, the
-- page path without its query string, and the release, never hand text or personal data.
create table public.app_errors (
  id bigint generated always as identity primary key,
  source text not null check (source in ('client', 'server')),
  kind text not null check (char_length(kind) <= 32),
  message text not null check (char_length(message) <= 500),
  stack text check (char_length(stack) <= 2000),
  path text check (char_length(path) <= 200),
  digest text check (char_length(digest) <= 64),
  fingerprint text not null check (char_length(fingerprint) <= 16),
  release text not null check (char_length(release) <= 40),
  session_id text check (char_length(session_id) <= 64),
  created_at timestamptz not null default now()
);
create index app_errors_created_idx on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;
create policy "Clients can report errors" on public.app_errors for insert to anon, authenticated
  with check (source = 'client');
revoke all on public.app_errors from anon, authenticated;
grant insert on public.app_errors to anon, authenticated;
