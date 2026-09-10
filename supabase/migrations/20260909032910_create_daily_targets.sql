create table public.daily_targets (
  row_id bigint generated always as identity primary key,
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_row_id bigint not null,
  version integer not null,
  effective_date date not null,
  calories numeric(10, 2) not null,
  protein_g numeric(10, 2) not null,
  carbs_g numeric(10, 2) not null,
  fat_g numeric(10, 2) not null,
  bmr numeric(10, 2) not null,
  bmi numeric(6, 2) not null,
  tdee numeric(10, 2) not null,
  activity_factor numeric(4, 2) not null,
  formula text not null,
  calculation_assumptions text not null default '',
  disclaimer text not null,
  created_at timestamptz not null default now(),
  constraint daily_targets_app_id_version_unique unique (user_id, app_id, version),
  constraint daily_targets_version_unique unique (user_id, version),
  constraint daily_targets_user_row_unique unique (row_id, user_id),
  constraint daily_targets_goal_fk foreign key (goal_row_id, user_id)
    references public.goals(row_id, user_id) on delete cascade,
  constraint daily_targets_app_id_not_blank check (btrim(app_id) <> ''),
  constraint daily_targets_version_check check (version >= 1),
  constraint daily_targets_values_check check (
    calories >= 0 and protein_g >= 0 and carbs_g >= 0 and fat_g >= 0 and
    bmr >= 0 and bmi >= 0 and tdee >= 0
  ),
  constraint daily_targets_activity_factor_check check (activity_factor between 1.35 and 1.65),
  constraint daily_targets_formula_check check (btrim(formula) <> ''),
  constraint daily_targets_disclaimer_check check (btrim(disclaimer) <> '')
);

create index daily_targets_user_effective_date_idx
  on public.daily_targets (user_id, effective_date desc);
create index daily_targets_goal_idx on public.daily_targets (goal_row_id);

alter table public.daily_targets enable row level security;
