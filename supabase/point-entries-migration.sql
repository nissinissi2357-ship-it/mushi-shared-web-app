create table if not exists public.point_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.club_members(id) on delete cascade,
  awarded_at timestamptz not null,
  title text not null,
  description text not null default '',
  points integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists point_entries_member_id_idx on public.point_entries(member_id);
create index if not exists point_entries_awarded_at_idx on public.point_entries(awarded_at desc);

alter table public.point_entries enable row level security;

drop policy if exists "members can read point entries" on public.point_entries;
drop policy if exists "members can insert point entries" on public.point_entries;

create policy "members can read point entries"
on public.point_entries
for select
using (true);

create policy "members can insert point entries"
on public.point_entries
for insert
with check (true);
