create table if not exists public.user_dashboard_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  holdings jsonb not null default '[]'::jsonb,
  prices jsonb not null default '{}'::jsonb,
  snapshots jsonb not null default '[]'::jsonb,
  incomes jsonb not null default '[]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  bank_history jsonb not null default '[]'::jsonb,
  scenarios jsonb not null default '[]'::jsonb,
  last_refreshed_at timestamptz,
  setup_complete boolean not null default false,
  imported_local_data boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists user_dashboard_state_set_updated_at on public.user_dashboard_state;
create trigger user_dashboard_state_set_updated_at
before update on public.user_dashboard_state
for each row
execute function public.set_updated_at();

alter table public.user_dashboard_state enable row level security;

drop policy if exists "Users can read their own dashboard state" on public.user_dashboard_state;
create policy "Users can read their own dashboard state"
on public.user_dashboard_state
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own dashboard state" on public.user_dashboard_state;
create policy "Users can insert their own dashboard state"
on public.user_dashboard_state
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own dashboard state" on public.user_dashboard_state;
create policy "Users can update their own dashboard state"
on public.user_dashboard_state
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own dashboard state" on public.user_dashboard_state;
create policy "Users can delete their own dashboard state"
on public.user_dashboard_state
for delete
using (auth.uid() = user_id);
