drop policy if exists "members can read themselves" on public.club_members;
drop policy if exists "members can read logs" on public.observation_logs;
drop policy if exists "members can insert logs" on public.observation_logs;

revoke all on public.club_members from anon, authenticated;
revoke all on public.observation_logs from anon, authenticated;

comment on table public.club_members is 'Access from the browser is blocked. Use the Next.js server API with the service role key.';
comment on table public.observation_logs is 'Access from the browser is blocked. Use the Next.js server API with the service role key.';
