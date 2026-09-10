create table public.nutrition_logs (
  row_id bigint generated always as identity primary key,
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  meal_slot text not null,
  food_row_id bigint references public.foods(row_id) on delete restrict,
  custom_name text,
  servings numeric(10, 3) not null,
  serving_quantity numeric(10, 3) not null,
  serving_unit text not null default 'serving',
  calories numeric(10, 2) not null,
  protein_g numeric(10, 2) not null,
  carbs_g numeric(10, 2) not null,
  fat_g numeric(10, 2) not null,
  fiber_g numeric(10, 2),
  estimated boolean not null default true,
  confidence text not null,
  source text not null,
  source_version text not null default '',
  preparation_basis text not null default 'unknown',
  assumptions text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_logs_user_app_unique unique (user_id, app_id),
  constraint nutrition_logs_user_row_unique unique (row_id, user_id),
  constraint nutrition_logs_app_id_not_blank check (btrim(app_id) <> ''),
  constraint nutrition_logs_slot_check check (
    meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')
  ),
  constraint nutrition_logs_reference_check check (
    food_row_id is not null or (custom_name is not null and btrim(custom_name) <> '')
  ),
  constraint nutrition_logs_custom_name_check check (
    custom_name is null or btrim(custom_name) <> ''
  ),
  constraint nutrition_logs_servings_check check (servings > 0),
  constraint nutrition_logs_serving_quantity_check check (serving_quantity > 0),
  constraint nutrition_logs_serving_unit_check check (
    serving_unit in ('g', 'piece', 'serving', 'ml', 'custom')
  ),
  constraint nutrition_logs_values_check check (
    calories >= 0 and protein_g >= 0 and carbs_g >= 0 and fat_g >= 0 and
    (fiber_g is null or fiber_g >= 0)
  ),
  constraint nutrition_logs_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint nutrition_logs_source_check check (btrim(source) <> ''),
  constraint nutrition_logs_preparation_basis_check check (
    preparation_basis in ('raw', 'cooked', 'baked', 'dry', 'prepared', 'as_labeled', 'unknown')
  ),
  constraint nutrition_logs_idempotency_key_check check (
    idempotency_key is null or btrim(idempotency_key) <> ''
  )
);

create table public.weight_entries (
  row_id bigint generated always as identity primary key,
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  weight_kg numeric(6, 2) not null,
  created_at timestamptz not null default now(),
  constraint weight_entries_user_app_unique unique (user_id, app_id),
  constraint weight_entries_user_row_unique unique (row_id, user_id),
  constraint weight_entries_app_id_not_blank check (btrim(app_id) <> ''),
  constraint weight_entries_weight_check check (weight_kg between 35 and 300)
);

create unique index nutrition_logs_idempotency_idx
  on public.nutrition_logs (user_id, idempotency_key)
  where idempotency_key is not null;
create index nutrition_logs_user_date_slot_idx
  on public.nutrition_logs (user_id, log_date desc, meal_slot, row_id desc);
create index nutrition_logs_food_idx on public.nutrition_logs (food_row_id);
create index weight_entries_user_date_idx
  on public.weight_entries (user_id, entry_date desc, row_id desc);

alter table public.nutrition_logs enable row level security;
alter table public.weight_entries enable row level security;

create trigger nutrition_logs_set_updated_at
before update on public.nutrition_logs
for each row execute function private.set_updated_at();
