create extension if not exists pgcrypto;

create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  role text not null check (role in ('member', 'captain', 'admin')),
  passcode_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.observation_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.club_members(id) on delete cascade,
  observed_at timestamptz not null,
  location text not null,
  location_detail text not null default '',
  latitude double precision,
  longitude double precision,
  order_name text not null default '',
  family_name text not null default '',
  species text not null,
  scientific_name text not null default '',
  points integer not null default 0,
  scoring_memo text not null default '',
  image_path text,
  guide_pdf_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.point_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.club_members(id) on delete cascade,
  awarded_at timestamptz not null,
  title text not null,
  description text not null default '',
  points integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists observation_logs_member_id_idx on public.observation_logs(member_id);
create index if not exists observation_logs_observed_at_idx on public.observation_logs(observed_at desc);
create index if not exists point_entries_member_id_idx on public.point_entries(member_id);
create index if not exists point_entries_awarded_at_idx on public.point_entries(awarded_at desc);
create unique index if not exists club_members_display_name_idx on public.club_members(display_name);

alter table public.club_members enable row level security;
alter table public.observation_logs enable row level security;
alter table public.point_entries enable row level security;

-- Minimal starter policies. Tighten these before real operation.
create policy "members can read themselves"
on public.club_members
for select
using (true);

create policy "members can read logs"
on public.observation_logs
for select
using (true);

create policy "members can insert logs"
on public.observation_logs
for insert
with check (true);

create policy "members can read point entries"
on public.point_entries
for select
using (true);

create policy "members can insert point entries"
on public.point_entries
for insert
with check (true);
