insert into public.club_members (display_name, role, passcode_hash)
select 'Admin', 'admin', encode(digest('0000', 'sha256'), 'hex')
where not exists (
  select 1 from public.club_members where role = 'admin'
);
