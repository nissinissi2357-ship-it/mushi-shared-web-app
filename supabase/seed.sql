insert into public.club_members (display_name, role, passcode_hash)
values
  ('たろう', 'member', encode(digest('1234', 'sha256'), 'hex')),
  ('はな', 'member', encode(digest('1234', 'sha256'), 'hex')),
  ('隊長', 'captain', encode(digest('9999', 'sha256'), 'hex'))
on conflict do nothing;

insert into public.observation_logs (member_id, observed_at, location, species, points, scoring_memo)
select
  m.id,
  now(),
  '呉市焼山',
  'セボシジョウカイ',
  1,
  '焼山🟪…1P'
from public.club_members m
where m.display_name = 'たろう'
  and not exists (
    select 1
    from public.observation_logs l
    where l.member_id = m.id
      and l.species = 'セボシジョウカイ'
      and l.location = '呉市焼山'
  );
