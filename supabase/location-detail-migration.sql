alter table public.observation_logs
add column if not exists location_detail text not null default '';
