create table public.grocery_lists (
  row_id bigint generated always as identity primary key,
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_of date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grocery_lists_user_week_unique unique (user_id, week_of),
  constraint grocery_lists_user_app_unique unique (user_id, app_id),
  constraint grocery_lists_user_row_unique unique (row_id, user_id),
  constraint grocery_lists_app_id_not_blank check (btrim(app_id) <> ''),
  constraint grocery_lists_week_start_check check (extract(isodow from week_of) = 1)
);

create table public.grocery_items (
  row_id bigint generated always as identity primary key,
  grocery_list_row_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null,
  name text not null,
  category text not null,
  unit text not null,
  generated_quantity numeric(12, 3) not null,
  quantity numeric(12, 3) not null,
  checked boolean not null default false,
  custom_item boolean not null default false,
  removed boolean not null default false,
  source_food_row_id bigint references public.foods(row_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grocery_items_list_fk foreign key (grocery_list_row_id, user_id)
    references public.grocery_lists(row_id, user_id) on delete cascade,
  constraint grocery_items_app_id_unique unique (grocery_list_row_id, app_id),
  constraint grocery_items_user_row_unique unique (row_id, user_id),
  constraint grocery_items_app_id_not_blank check (btrim(app_id) <> ''),
  constraint grocery_items_name_not_blank check (btrim(name) <> ''),
  constraint grocery_items_category_check check (
    category in ('Produce', 'Protein', 'Dairy', 'Grains', 'Pantry', 'Other')
  ),
  constraint grocery_items_unit_not_blank check (btrim(unit) <> ''),
  constraint grocery_items_quantities_check check (generated_quantity >= 0 and quantity >= 0)
);

create index grocery_items_user_list_idx
  on public.grocery_items (user_id, grocery_list_row_id);
create index grocery_items_source_food_idx
  on public.grocery_items (source_food_row_id);
create index grocery_lists_user_week_idx
  on public.grocery_lists (user_id, week_of desc);

alter table public.grocery_lists enable row level security;
alter table public.grocery_items enable row level security;

create trigger grocery_lists_set_updated_at
before update on public.grocery_lists
for each row execute function private.set_updated_at();

create trigger grocery_items_set_updated_at
before update on public.grocery_items
for each row execute function private.set_updated_at();
