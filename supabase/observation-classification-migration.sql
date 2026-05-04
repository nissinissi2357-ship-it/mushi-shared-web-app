alter table public.observation_logs
add column if not exists order_name text not null default '';

alter table public.observation_logs
add column if not exists family_name text not null default '';

alter table public.observation_logs
add column if not exists scientific_name text not null default '';
