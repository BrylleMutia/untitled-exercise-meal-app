-- System catalog rows are public read models. Future user-created foods and
-- meals share the tables but carry an owner_user_id and are protected by RLS.

create table public.exercises (
  row_id bigint generated always as identity primary key,
  app_id text not null unique,
  slug text not null unique,
  name text not null,
  description text not null,
  movement_category text not null,
  muscles text[] not null default '{}',
  difficulty smallint not null,
  equipment text[] not null default '{}',
  measure text not null,
  illustration_alt text not null,
  regression_reference text,
  progression_reference text,
  safety text not null,
  source text not null,
  source_version text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  constraint exercises_system_only check (is_system),
  constraint exercises_name_not_blank check (btrim(name) <> ''),
  constraint exercises_category_check check (
    movement_category in ('push', 'pull', 'squat', 'hinge', 'core', 'mobility')
  ),
  constraint exercises_muscles_check check (cardinality(muscles) > 0),
  constraint exercises_difficulty_check check (difficulty between 1 and 5),
  constraint exercises_equipment_check check (
    equipment <@ array['none', 'pullup_bar', 'bands', 'dumbbells', 'bench']::text[]
  ),
  constraint exercises_measure_check check (measure in ('reps', 'hold')),
  constraint exercises_source_check check (btrim(source) <> ''),
  constraint exercises_version_check check (btrim(source_version) <> '')
);

create table public.foods (
  row_id bigint generated always as identity primary key,
  app_id text not null unique,
  owner_user_id uuid references auth.users(id) on delete cascade,
  is_system boolean not null default false,
  name text not null,
  serving_label text not null,
  serving_grams numeric(9, 3) not null,
  serving_unit text not null,
  calories numeric(10, 2) not null,
  protein_g numeric(10, 2) not null,
  carbs_g numeric(10, 2) not null,
  fat_g numeric(10, 2) not null,
  fiber_g numeric(10, 2),
  category text not null,
  source text not null,
  source_version text not null,
  estimated boolean not null default true,
  confidence text not null,
  preparation_basis text not null default 'as_labeled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foods_system_owner_check check (
    (is_system and owner_user_id is null) or (not is_system and owner_user_id is not null)
  ),
  constraint foods_name_not_blank check (btrim(name) <> ''),
  constraint foods_serving_label_not_blank check (btrim(serving_label) <> ''),
  constraint foods_serving_grams_check check (serving_grams > 0),
  constraint foods_serving_unit_check check (serving_unit in ('g', 'piece')),
  constraint foods_nutrition_nonnegative check (
    calories >= 0 and protein_g >= 0 and carbs_g >= 0 and fat_g >= 0 and
    (fiber_g is null or fiber_g >= 0)
  ),
  constraint foods_category_check check (
    category in ('Produce', 'Protein', 'Dairy', 'Grains', 'Pantry', 'Other')
  ),
  constraint foods_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint foods_preparation_basis_check check (
    preparation_basis in ('raw', 'cooked', 'baked', 'dry', 'prepared', 'as_labeled', 'unknown')
  ),
  constraint foods_source_check check (btrim(source) <> ''),
  constraint foods_version_check check (btrim(source_version) <> '')
);

create table public.meals (
  row_id bigint generated always as identity primary key,
  app_id text not null unique,
  owner_user_id uuid references auth.users(id) on delete cascade,
  is_system boolean not null default false,
  name text not null,
  servings numeric(8, 3) not null,
  notes text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meals_system_owner_check check (
    (is_system and owner_user_id is null) or (not is_system and owner_user_id is not null)
  ),
  constraint meals_name_not_blank check (btrim(name) <> ''),
  constraint meals_servings_check check (servings > 0)
);

create table public.meal_ingredients (
  row_id bigint generated always as identity primary key,
  meal_row_id bigint not null references public.meals(row_id) on delete cascade,
  food_row_id bigint not null references public.foods(row_id) on delete restrict,
  ingredient_order integer not null,
  servings numeric(8, 3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_ingredients_order_check check (ingredient_order > 0),
  constraint meal_ingredients_servings_check check (servings > 0),
  constraint meal_ingredients_order_unique unique (meal_row_id, ingredient_order)
);

create index foods_owner_user_idx on public.foods (owner_user_id)
  where owner_user_id is not null;
create index meals_owner_user_idx on public.meals (owner_user_id)
  where owner_user_id is not null;
create index meal_ingredients_food_idx on public.meal_ingredients (food_row_id);

alter table public.exercises enable row level security;
alter table public.foods enable row level security;
alter table public.meals enable row level security;
alter table public.meal_ingredients enable row level security;

create trigger foods_set_updated_at
before update on public.foods
for each row execute function private.set_updated_at();

create trigger meals_set_updated_at
before update on public.meals
for each row execute function private.set_updated_at();

create trigger meal_ingredients_set_updated_at
before update on public.meal_ingredients
for each row execute function private.set_updated_at();
