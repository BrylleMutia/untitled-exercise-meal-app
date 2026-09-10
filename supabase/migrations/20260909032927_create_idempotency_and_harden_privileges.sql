create table public.mutation_idempotency (
  row_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'pending',
  result_refs jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  constraint mutation_idempotency_unique unique (user_id, operation, idempotency_key),
  constraint mutation_idempotency_user_row_unique unique (row_id, user_id),
  constraint mutation_idempotency_operation_check check (btrim(operation) <> ''),
  constraint mutation_idempotency_key_check check (btrim(idempotency_key) <> ''),
  constraint mutation_idempotency_hash_check check (btrim(request_hash) <> ''),
  constraint mutation_idempotency_status_check check (status in ('pending', 'completed', 'failed')),
  constraint mutation_idempotency_result_refs_check check (jsonb_typeof(result_refs) = 'object'),
  constraint mutation_idempotency_completed_at_check check (
    completed_at is null or completed_at >= created_at
  ),
  constraint mutation_idempotency_expiry_check check (
    expires_at is null or expires_at >= created_at
  )
);

create index mutation_idempotency_expiry_idx
  on public.mutation_idempotency (expires_at)
  where expires_at is not null;

alter table public.mutation_idempotency enable row level security;

-- Public catalog reads are intentionally explicit. Durable writes will be
-- exposed later through authorized RPCs, not table-level Data API grants.
revoke all on
  public.exercises,
  public.foods,
  public.meals,
  public.meal_ingredients,
  public.profiles,
  public.goals,
  public.daily_targets,
  public.workout_plans,
  public.planned_workouts,
  public.planned_exercises,
  public.workout_plan_overrides,
  public.meal_plans,
  public.planned_meals,
  public.workout_sessions,
  public.exercise_logs,
  public.nutrition_logs,
  public.weight_entries,
  public.grocery_lists,
  public.grocery_items,
  public.mutation_idempotency
  from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on public.exercises, public.foods, public.meals, public.meal_ingredients
  to anon, authenticated;

grant select on
  public.profiles,
  public.goals,
  public.daily_targets,
  public.workout_plans,
  public.planned_workouts,
  public.planned_exercises,
  public.workout_plan_overrides,
  public.meal_plans,
  public.planned_meals,
  public.workout_sessions,
  public.exercise_logs,
  public.nutrition_logs,
  public.weight_entries,
  public.grocery_lists,
  public.grocery_items,
  public.mutation_idempotency
  to authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- Catalog policies.
create policy "public can read system exercises"
  on public.exercises
  for select
  to anon, authenticated
  using (is_system);

create policy "users can read system or owned foods"
  on public.foods
  for select
  to anon, authenticated
  using (is_system or (select auth.uid()) = owner_user_id);

create policy "users can read system or owned meals"
  on public.meals
  for select
  to anon, authenticated
  using (is_system or (select auth.uid()) = owner_user_id);

create policy "users can read ingredients for visible meals and foods"
  on public.meal_ingredients
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.meals
      where meals.row_id = meal_ingredients.meal_row_id
        and (meals.is_system or (select auth.uid()) = meals.owner_user_id)
    )
    and exists (
      select 1
      from public.foods
      where foods.row_id = meal_ingredients.food_row_id
        and (foods.is_system or (select auth.uid()) = foods.owner_user_id)
    )
  );

-- Every durable read model is owner-scoped. There are deliberately no
-- INSERT/UPDATE/DELETE policies or grants for anon/authenticated roles.
create policy "users can read their profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "users can read their goals"
  on public.goals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their daily targets"
  on public.daily_targets
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their workout plans"
  on public.workout_plans
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their planned workouts"
  on public.planned_workouts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their planned exercises"
  on public.planned_exercises
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their plan overrides"
  on public.workout_plan_overrides
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their meal plans"
  on public.meal_plans
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their planned meals"
  on public.planned_meals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their workout sessions"
  on public.workout_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their exercise logs"
  on public.exercise_logs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their nutrition logs"
  on public.nutrition_logs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their weight entries"
  on public.weight_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their grocery lists"
  on public.grocery_lists
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their grocery items"
  on public.grocery_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read their mutation records"
  on public.mutation_idempotency
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.mutation_idempotency is
  'Retry records for authorized mutations; do not store full snapshots or secrets here.';
