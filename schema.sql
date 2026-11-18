-- Care Tracker: run this once in Supabase > SQL Editor > New query > Run

-- 1. Main table ---------------------------------------------------------
create table if not exists public.people (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact       text,
  status        text not null default 'New',
  meeting_day   text,
  meeting_time  time,
  frequency     text,
  location      text,
  met_by        text,
  last_contact  date,
  next_followup date,
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Keep updated_at fresh on every edit
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

-- 2. Privacy: only signed-in users can touch the data -------------------
alter table public.people enable row level security;

drop policy if exists "signed-in users have full access" on public.people;
create policy "signed-in users have full access"
  on public.people
  for all
  to authenticated
  using (true)
  with check (true);
-- (No policy exists for the anonymous role, so logged-out visitors get nothing.)

-- 3. Keep-alive table for cron-job.org ----------------------------------
-- Holds no real data. Public read access is intentional so the ping works
-- without a login.
create table if not exists public.keepalive (
  id        int primary key,
  last_seen timestamptz not null default now()
);
insert into public.keepalive (id) values (1) on conflict do nothing;

alter table public.keepalive enable row level security;
drop policy if exists "anyone can read keepalive" on public.keepalive;
create policy "anyone can read keepalive"
  on public.keepalive
  for select
  to anon, authenticated
  using (true);
