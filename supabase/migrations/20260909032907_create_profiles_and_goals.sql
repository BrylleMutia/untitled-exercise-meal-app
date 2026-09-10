create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  age smallint not null,
  sex text not null,
  height_cm numeric(5, 2) not null,
  weight_kg numeric(6, 2) not null,
  units text not null,
  experience text not null,
  equipment text[] not null default '{}',
  days_per_week smallint not null,
  session_minutes smallint not null,
  goal text not null,
  dietary_pattern text not null default '',
  allergies text[] not null default '{}',
  food_preferences text[] not null default '{}',
  cooking_time_minutes smallint,
  meal_budget numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_not_blank check (btrim(name) <> ''),
  constraint profiles_age_check check (age between 18 and 100),
  constraint profiles_sex_check check (sex in ('female', 'male')),
  constraint profiles_height_check check (height_cm between 120 and 230),
  constraint profiles_weight_check check (weight_kg between 35 and 300),
  constraint profiles_units_check check (units in ('metric', 'imperial')),
  constraint profiles_experience_check check (experience in ('beginner', 'intermediate', 'advanced')),
  constraint profiles_equipment_check check (
    equipment <@ array['none', 'pullup_bar', 'bands', 'dumbbells', 'bench']::text[]
  ),
  constraint profiles_days_check check (days_per_week between 1 and 7),
  constraint profiles_session_minutes_check check (session_minutes between 15 and 120),
  constraint profiles_goal_check check (
    goal in ('lose', 'maintain', 'gain', 'strength', 'consistency')
  ),
  constraint profiles_cooking_time_check check (
    cooking_time_minutes is null or cooking_time_minutes between 0 and 240
  ),
  constraint profiles_meal_budget_check check (meal_budget is null or meal_budget >= 0)
);

create table public.goals (
  row_id bigint generated always as identity primary key,
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_type text not null,
  target_weight_kg numeric(6, 2),
  desired_rate_kg_per_week numeric(6, 3),
  target_date date,
  weekly_workout_target smallint not null,
  skill_targets jsonb not null default '{}'::jsonb,
  effective_date date not null,
  version integer not null default 1,
  is_primary boolean not null default true,
  status text not null default 'active',
  ended_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_app_id_version_unique unique (user_id, app_id, version),
  constraint goals_user_version_unique unique (user_id, version),
  constraint goals_user_row_unique unique (row_id, user_id),
  constraint goals_app_id_not_blank check (btrim(app_id) <> ''),
  constraint goals_goal_type_check check (
    goal_type in ('lose', 'maintain', 'gain', 'strength', 'consistency')
  ),
  constraint goals_target_weight_check check (
    target_weight_kg is null or target_weight_kg between 35 and 300
  ),
  constraint goals_rate_check check (
    desired_rate_kg_per_week is null or desired_rate_kg_per_week between -10 and 10
  ),
  constraint goals_weekly_target_check check (weekly_workout_target between 1 and 7),
  constraint goals_skill_targets_check check (jsonb_typeof(skill_targets) = 'object'),
  constraint goals_version_check check (version >= 1),
  constraint goals_status_check check (status in ('active', 'ended')),
  constraint goals_ended_date_check check (
    (status = 'active' and ended_date is null) or
    (status = 'ended' and ended_date is not null)
  ),
  constraint goals_target_date_check check (
    target_date is null or target_date >= effective_date
  )
);

create unique index goals_one_active_primary_idx
  on public.goals (user_id)
  where status = 'active' and is_primary;

create index goals_user_effective_date_idx
  on public.goals (user_id, effective_date desc);

alter table public.profiles enable row level security;
alter table public.goals enable row level security;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger goals_set_updated_at
before update on public.goals
for each row execute function private.set_updated_at();
