create table public.meal_plans (
  row_id bigint generated always as identity primary key,
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  week_of date not null,
  target_row_id bigint not null,
  supersedes_plan_row_id bigint,
  created_at timestamptz not null default now(),
  constraint meal_plans_app_id_version_unique unique (user_id, app_id, version),
  constraint meal_plans_user_row_unique unique (row_id, user_id),
  constraint meal_plans_user_row_week_unique unique (row_id, user_id, week_of),
  constraint meal_plans_target_fk foreign key (target_row_id, user_id)
    references public.daily_targets(row_id, user_id) on delete cascade,
  constraint meal_plans_supersedes_fk foreign key (supersedes_plan_row_id, user_id)
    references public.meal_plans(row_id, user_id) on delete cascade,
  constraint meal_plans_app_id_not_blank check (btrim(app_id) <> ''),
  constraint meal_plans_version_check check (version >= 1),
  constraint meal_plans_week_start_check check (extract(isodow from week_of) = 1)
);

create table public.planned_meals (
  row_id bigint generated always as identity primary key,
  meal_plan_row_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_of date not null,
  app_id text not null,
  meal_date date not null,
  meal_slot text not null,
  meal_row_id bigint references public.meals(row_id) on delete restrict,
  food_row_id bigint references public.foods(row_id) on delete restrict,
  label text not null,
  servings numeric(8, 3) not null,
  skipped boolean not null default false,
  expected_calories numeric(10, 2) not null default 0,
  expected_protein_g numeric(10, 2) not null default 0,
  expected_carbs_g numeric(10, 2) not null default 0,
  expected_fat_g numeric(10, 2) not null default 0,
  expected_fiber_g numeric(10, 2),
  source text,
  source_version text,
  assumptions text,
  confidence text,
  preparation_basis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_meals_plan_fk foreign key (meal_plan_row_id, user_id, week_of)
    references public.meal_plans(row_id, user_id, week_of) on delete cascade,
  constraint planned_meals_app_id_unique unique (meal_plan_row_id, app_id),
  constraint planned_meals_slot_unique unique (meal_plan_row_id, meal_date, meal_slot),
  constraint planned_meals_user_row_unique unique (row_id, user_id),
  constraint planned_meals_app_id_not_blank check (btrim(app_id) <> ''),
  constraint planned_meals_date_in_week_check check (
    meal_date >= week_of and meal_date < week_of + 7
  ),
  constraint planned_meals_slot_check check (
    meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')
  ),
  constraint planned_meals_reference_check check (
    not (meal_row_id is not null and food_row_id is not null)
  ),
  constraint planned_meals_label_check check (btrim(label) <> ''),
  constraint planned_meals_servings_check check (servings > 0),
  constraint planned_meals_expected_values_check check (
    expected_calories >= 0 and expected_protein_g >= 0 and expected_carbs_g >= 0 and
    expected_fat_g >= 0 and (expected_fiber_g is null or expected_fiber_g >= 0)
  ),
  constraint planned_meals_confidence_check check (
    confidence is null or confidence in ('high', 'medium', 'low')
  ),
  constraint planned_meals_preparation_basis_check check (
    preparation_basis is null or
    preparation_basis in ('raw', 'cooked', 'baked', 'dry', 'prepared', 'as_labeled', 'unknown')
  )
);

create index meal_plans_user_week_idx
  on public.meal_plans (user_id, week_of desc);
create index meal_plans_target_idx on public.meal_plans (target_row_id);
create index meal_plans_supersedes_idx
  on public.meal_plans (supersedes_plan_row_id, user_id)
  where supersedes_plan_row_id is not null;
create index planned_meals_user_date_idx
  on public.planned_meals (user_id, meal_date, meal_slot);
create index planned_meals_meal_idx on public.planned_meals (meal_row_id);
create index planned_meals_food_idx on public.planned_meals (food_row_id);

alter table public.meal_plans enable row level security;
alter table public.planned_meals enable row level security;

create trigger planned_meals_set_updated_at
before update on public.planned_meals
for each row execute function private.set_updated_at();
