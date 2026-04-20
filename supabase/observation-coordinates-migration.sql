alter table public.observation_logs
add column if not exists latitude double precision;

alter table public.observation_logs
add column if not exists longitude double precision;
