create table public.workout_plans (
  row_id bigint generated always as identity primary key,
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  target_row_id bigint not null,
  supersedes_plan_row_id bigint,
  created_at timestamptz not null default now(),
  constraint workout_plans_app_id_version_unique unique (user_id, app_id, version),
  constraint workout_plans_user_row_unique unique (row_id, user_id),
  constraint workout_plans_target_fk foreign key (target_row_id, user_id)
    references public.daily_targets(row_id, user_id) on delete cascade,
  constraint workout_plans_supersedes_fk foreign key (supersedes_plan_row_id, user_id)
    references public.workout_plans(row_id, user_id) on delete cascade,
  constraint workout_plans_app_id_not_blank check (btrim(app_id) <> ''),
  constraint workout_plans_version_check check (version >= 1)
);

create table public.planned_workouts (
  row_id bigint generated always as identity primary key,
  plan_row_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null,
  day_of_week smallint not null,
  title text not null,
  focus text not null,
  warmup text[] not null default '{}',
  cooldown text[] not null default '{}',
  estimated_minutes smallint not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  constraint planned_workouts_plan_fk foreign key (plan_row_id, user_id)
    references public.workout_plans(row_id, user_id) on delete cascade,
  constraint planned_workouts_app_id_unique unique (plan_row_id, app_id),
  constraint planned_workouts_day_unique unique (plan_row_id, day_of_week),
  constraint planned_workouts_user_row_unique unique (row_id, user_id),
  constraint planned_workouts_app_id_not_blank check (btrim(app_id) <> ''),
  constraint planned_workouts_day_check check (day_of_week between 0 and 6),
  constraint planned_workouts_title_check check (btrim(title) <> ''),
  constraint planned_workouts_focus_check check (btrim(focus) <> ''),
  constraint planned_workouts_duration_check check (estimated_minutes between 1 and 240),
  constraint planned_workouts_sort_order_check check (sort_order > 0)
);

create table public.planned_exercises (
  row_id bigint generated always as identity primary key,
  planned_workout_row_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null,
  exercise_row_id bigint not null references public.exercises(row_id) on delete restrict,
  sort_order integer not null,
  exercise_name_snapshot text not null,
  measure_snapshot text not null,
  catalog_source_version text not null,
  sets smallint not null,
  reps smallint,
  hold_seconds smallint,
  rest_seconds smallint not null,
  regression_reference_snapshot text,
  progression_reference_snapshot text,
  created_at timestamptz not null default now(),
  constraint planned_exercises_workout_fk foreign key (planned_workout_row_id, user_id)
    references public.planned_workouts(row_id, user_id) on delete cascade,
  constraint planned_exercises_app_id_unique unique (planned_workout_row_id, app_id),
  constraint planned_exercises_user_row_unique unique (row_id, user_id),
  constraint planned_exercises_app_id_not_blank check (btrim(app_id) <> ''),
  constraint planned_exercises_sort_order_check check (sort_order > 0),
  constraint planned_exercises_name_check check (btrim(exercise_name_snapshot) <> ''),
  constraint planned_exercises_measure_check check (measure_snapshot in ('reps', 'hold')),
  constraint planned_exercises_measure_values_check check (
    (measure_snapshot = 'reps' and reps is not null and hold_seconds is null) or
    (measure_snapshot = 'hold' and hold_seconds is not null and reps is null)
  ),
  constraint planned_exercises_sets_check check (sets between 1 and 10),
  constraint planned_exercises_reps_check check (reps is null or reps between 1 and 100),
  constraint planned_exercises_hold_check check (hold_seconds is null or hold_seconds between 1 and 600),
  constraint planned_exercises_rest_check check (rest_seconds between 0 and 600),
  constraint planned_exercises_source_version_check check (btrim(catalog_source_version) <> '')
);

create table public.workout_plan_overrides (
  row_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null,
  planned_exercise_row_id bigint not null,
  replacement_exercise_row_id bigint references public.exercises(row_id) on delete restrict,
  measure_override text,
  sets_override smallint,
  reps_override smallint,
  hold_seconds_override smallint,
  rest_seconds_override smallint,
  active boolean not null default true,
  effective_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_plan_overrides_exercise_fk foreign key (planned_exercise_row_id, user_id)
    references public.planned_exercises(row_id, user_id) on delete cascade,
  constraint workout_plan_overrides_app_id_unique unique (user_id, app_id),
  constraint workout_plan_overrides_app_id_not_blank check (btrim(app_id) <> ''),
  constraint workout_plan_overrides_measure_check check (
    measure_override is null or measure_override in ('reps', 'hold')
  ),
  constraint workout_plan_overrides_measure_values_check check (
    (measure_override is null and reps_override is null and hold_seconds_override is null) or
    (measure_override = 'reps' and reps_override is not null and hold_seconds_override is null) or
    (measure_override = 'hold' and hold_seconds_override is not null and reps_override is null)
  ),
  constraint workout_plan_overrides_sets_check check (sets_override is null or sets_override between 1 and 10),
  constraint workout_plan_overrides_reps_check check (reps_override is null or reps_override between 1 and 100),
  constraint workout_plan_overrides_hold_check check (hold_seconds_override is null or hold_seconds_override between 1 and 600),
  constraint workout_plan_overrides_rest_check check (rest_seconds_override is null or rest_seconds_override between 0 and 600),
  constraint workout_plan_overrides_dates_check check (
    ended_at is null or ended_at >= effective_at
  ),
  constraint workout_plan_overrides_active_date_check check (
    (active and ended_at is null) or (not active and ended_at is not null)
  )
);

create unique index workout_plan_overrides_one_active_idx
  on public.workout_plan_overrides (user_id, planned_exercise_row_id)
  where active;

create index workout_plans_user_created_idx
  on public.workout_plans (user_id, created_at desc);
create index workout_plans_target_idx on public.workout_plans (target_row_id);
create index workout_plans_supersedes_idx
  on public.workout_plans (supersedes_plan_row_id, user_id)
  where supersedes_plan_row_id is not null;
create index planned_workouts_user_day_idx
  on public.planned_workouts (user_id, day_of_week);
create index planned_exercises_exercise_idx
  on public.planned_exercises (exercise_row_id);
create index workout_plan_overrides_replacement_idx
  on public.workout_plan_overrides (replacement_exercise_row_id);

alter table public.workout_plans enable row level security;
alter table public.planned_workouts enable row level security;
alter table public.planned_exercises enable row level security;
alter table public.workout_plan_overrides enable row level security;

create trigger workout_plan_overrides_set_updated_at
before update on public.workout_plan_overrides
for each row execute function private.set_updated_at();
