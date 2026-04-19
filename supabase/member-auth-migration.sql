create extension if not exists pgcrypto;

create unique index if not exists club_members_display_name_idx on public.club_members(display_name);

update public.club_members
set passcode_hash = encode(digest('9999', 'sha256'), 'hex')
where display_name = '隊長'
  and (passcode_hash is null or passcode_hash = '');
