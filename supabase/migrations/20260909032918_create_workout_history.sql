create table public.workout_sessions (
  row_id bigint generated always as identity primary key,
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_workout_row_id bigint not null,
  planned_plan_row_id bigint not null,
  planned_plan_version integer not null,
  session_date date not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null default 'in_progress',
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_sessions_workout_fk foreign key (planned_workout_row_id, user_id)
    references public.planned_workouts(row_id, user_id) on delete restrict,
  constraint workout_sessions_plan_fk foreign key (planned_plan_row_id, user_id)
    references public.workout_plans(row_id, user_id) on delete restrict,
  constraint workout_sessions_app_id_unique unique (user_id, app_id),
  constraint workout_sessions_user_row_unique unique (row_id, user_id),
  constraint workout_sessions_app_id_not_blank check (btrim(app_id) <> ''),
  constraint workout_sessions_plan_version_check check (planned_plan_version >= 1),
  constraint workout_sessions_status_check check (
    status in ('in_progress', 'completed', 'partial', 'abandoned')
  ),
  constraint workout_sessions_finished_after_started_check check (
    finished_at is null or finished_at >= started_at
  ),
  constraint workout_sessions_idempotency_key_check check (
    idempotency_key is null or btrim(idempotency_key) <> ''
  )
);

create table public.exercise_logs (
  row_id bigint generated always as identity primary key,
  session_row_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_exercise_row_id bigint not null,
  actual_exercise_row_id bigint not null references public.exercises(row_id) on delete restrict,
  planned_exercise_app_id text not null,
  planned_exercise_name_snapshot text not null,
  planned_measure text not null,
  planned_sets smallint not null,
  planned_reps smallint,
  planned_hold_seconds smallint,
  actual_measure text not null,
  actual_sets smallint,
  actual_reps smallint,
  actual_hold_seconds smallint,
  status text not null,
  rpe smallint,
  manageable boolean,
  pain boolean,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_logs_session_fk foreign key (session_row_id, user_id)
    references public.workout_sessions(row_id, user_id) on delete cascade,
  constraint exercise_logs_planned_exercise_fk foreign key (planned_exercise_row_id, user_id)
    references public.planned_exercises(row_id, user_id) on delete restrict,
  constraint exercise_logs_session_exercise_unique unique (session_row_id, planned_exercise_row_id),
  constraint exercise_logs_user_row_unique unique (row_id, user_id),
  constraint exercise_logs_planned_app_id_check check (btrim(planned_exercise_app_id) <> ''),
  constraint exercise_logs_planned_name_check check (btrim(planned_exercise_name_snapshot) <> ''),
  constraint exercise_logs_planned_measure_check check (planned_measure in ('reps', 'hold')),
  constraint exercise_logs_planned_measure_values_check check (
    (planned_measure = 'reps' and planned_reps is not null and planned_hold_seconds is null) or
    (planned_measure = 'hold' and planned_hold_seconds is not null and planned_reps is null)
  ),
  constraint exercise_logs_planned_sets_check check (planned_sets between 1 and 10),
  constraint exercise_logs_planned_reps_check check (planned_reps is null or planned_reps between 1 and 100),
  constraint exercise_logs_planned_hold_check check (planned_hold_seconds is null or planned_hold_seconds between 1 and 600),
  constraint exercise_logs_actual_measure_check check (actual_measure in ('reps', 'hold')),
  constraint exercise_logs_actual_values_check check (
    (status = 'skipped' and actual_sets is null and actual_reps is null and actual_hold_seconds is null) or
    (status in ('completed', 'modified') and actual_sets is not null and actual_sets between 0 and 10 and
      ((actual_measure = 'reps' and actual_reps is not null and actual_reps between 0 and 100 and actual_hold_seconds is null) or
       (actual_measure = 'hold' and actual_hold_seconds is not null and actual_hold_seconds between 0 and 600 and actual_reps is null)))
  ),
  constraint exercise_logs_status_check check (status in ('completed', 'skipped', 'modified')),
  constraint exercise_logs_rpe_check check (rpe is null or rpe between 1 and 10)
);

create unique index workout_sessions_one_in_progress_idx
  on public.workout_sessions (user_id, planned_workout_row_id)
  where status = 'in_progress';
create unique index workout_sessions_idempotency_idx
  on public.workout_sessions (user_id, idempotency_key)
  where idempotency_key is not null;

create index workout_sessions_user_date_idx
  on public.workout_sessions (user_id, session_date desc, row_id desc);
create index workout_sessions_status_idx
  on public.workout_sessions (user_id, status, session_date desc);
create index workout_sessions_planned_plan_idx
  on public.workout_sessions (planned_plan_row_id);
create index workout_sessions_planned_workout_idx
  on public.workout_sessions (planned_workout_row_id, user_id);
create index exercise_logs_actual_exercise_idx
  on public.exercise_logs (actual_exercise_row_id);
create index exercise_logs_planned_exercise_idx
  on public.exercise_logs (planned_exercise_row_id, user_id);

alter table public.workout_sessions enable row level security;
alter table public.exercise_logs enable row level security;

create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row execute function private.set_updated_at();

create trigger exercise_logs_set_updated_at
before update on public.exercise_logs
for each row execute function private.set_updated_at();
