-- Apply only the three user-reviewed legacy assignments. Other installations
-- have no matching records. Never infer assignments from arbitrary recipe names.
do $assignments$
declare item jsonb; recipe public.meals; actual_ingredients jsonb; slots text[];
begin
 for item in select value from jsonb_array_elements($reviewed_recipe_assignments$[
  {
    "id": "meal-5d103340-278e-4e88-a0be-8f3fe230a27c",
    "owner": "f1791359-af0d-4435-9443-e9bfbaf6a368",
    "recipe": {
      "app_id": "meal-5d103340-278e-4e88-a0be-8f3fe230a27c",
      "archived_at": null,
      "complexity": "medium",
      "image": null,
      "is_system": false,
      "meal_slots": [],
      "name": "test11",
      "notes": "test1",
      "nutrition_notes": null,
      "owner_user_id": "f1791359-af0d-4435-9443-e9bfbaf6a368",
      "provided_nutrition": null,
      "reference": null,
      "revision": 3,
      "servings": 3,
      "source_url": null,
      "total_time_minutes": null,
      "unmeasured_ingredients": null
    },
    "ingredients": [
      {
        "cooking": null,
        "foodId": "food-egg",
        "order": 1,
        "servings": 6
      },
      {
        "cooking": null,
        "foodId": "food-peanut-butter",
        "order": 2,
        "servings": 3
      },
      {
        "cooking": null,
        "foodId": "food-egg",
        "order": 3,
        "servings": 1
      },
      {
        "cooking": null,
        "foodId": "food-peanut-butter",
        "order": 4,
        "servings": 2.5
      }
    ],
    "slots": [
      "breakfast",
      "snack"
    ]
  },
  {
    "id": "meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a",
    "owner": "f1791359-af0d-4435-9443-e9bfbaf6a368",
    "recipe": {
      "app_id": "meal-review-40f813ff-24a0-4d53-9e9d-1ab07c72c95a",
      "archived_at": null,
      "complexity": "medium",
      "image": null,
      "is_system": false,
      "meal_slots": [],
      "name": "Toast",
      "notes": null,
      "nutrition_notes": null,
      "owner_user_id": "f1791359-af0d-4435-9443-e9bfbaf6a368",
      "provided_nutrition": null,
      "reference": null,
      "revision": 2,
      "servings": 1,
      "source_url": null,
      "total_time_minutes": null,
      "unmeasured_ingredients": null
    },
    "ingredients": [
      {
        "cooking": null,
        "foodId": "food-bread",
        "order": 1,
        "servings": 1
      },
      {
        "cooking": null,
        "foodId": "food-peanut-butter",
        "order": 2,
        "servings": 1
      }
    ],
    "slots": [
      "breakfast",
      "lunch",
      "snack"
    ]
  },
  {
    "id": "meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5",
    "owner": "f1791359-af0d-4435-9443-e9bfbaf6a368",
    "recipe": {
      "app_id": "meal-review-e1d74fc4-7335-40cc-91cb-dc22e24b85a5",
      "archived_at": null,
      "complexity": "medium",
      "image": null,
      "is_system": false,
      "meal_slots": [],
      "name": "Fried Rice",
      "notes": null,
      "nutrition_notes": null,
      "owner_user_id": "f1791359-af0d-4435-9443-e9bfbaf6a368",
      "provided_nutrition": null,
      "reference": null,
      "revision": 2,
      "servings": 1,
      "source_url": null,
      "total_time_minutes": null,
      "unmeasured_ingredients": null
    },
    "ingredients": [
      {
        "cooking": null,
        "foodId": "food-fdc-2708951",
        "order": 1,
        "servings": 3.32
      },
      {
        "cooking": null,
        "foodId": "review-food-d2b382aba3896100dfbe82a26bde7eae",
        "order": 2,
        "servings": 1
      },
      {
        "cooking": null,
        "foodId": "review-food-0d0026d23355219d2f9c185856e81aa3",
        "order": 3,
        "servings": 1
      },
      {
        "cooking": null,
        "foodId": "food-egg",
        "order": 4,
        "servings": 1
      },
      {
        "cooking": null,
        "foodId": "review-food-a09bfb9d2256117d00575ae1b2115104",
        "order": 5,
        "servings": 0.5
      }
    ],
    "slots": [
      "lunch",
      "dinner"
    ]
  }
]$reviewed_recipe_assignments$::jsonb) loop
  select * into recipe from public.meals where app_id=item->>'id' and owner_user_id=(item->>'owner')::uuid for update;
  if not found then
   if exists(select 1 from public.meals where app_id=item->>'id') then raise exception 'Reviewed recipe owner changed: %',item->>'id'; end if;
   continue;
  end if;
  select array_agg(value order by ordinal) into slots from jsonb_array_elements_text(item->'slots') with ordinality as s(value,ordinal);
  if recipe.meal_slots=slots then continue; end if;
  if cardinality(recipe.meal_slots)<>0 or (to_jsonb(recipe)-'row_id'-'created_at'-'updated_at') is distinct from item->'recipe' then
   raise exception 'Reviewed recipe changed; assignment backfill stopped: %',item->>'id';
  end if;
  select jsonb_agg(jsonb_build_object('foodId',f.app_id,'servings',i.servings,'order',i.ingredient_order,'cooking',i.cooking_measurement) order by i.ingredient_order)
   into actual_ingredients from public.meal_ingredients i join public.foods f on f.row_id=i.food_row_id where i.meal_row_id=recipe.row_id;
  if actual_ingredients is distinct from item->'ingredients' then raise exception 'Reviewed ingredients changed; assignment backfill stopped: %',item->>'id'; end if;
  update public.meals set meal_slots=slots where row_id=recipe.row_id;
 end loop;
end;
$assignments$;
-- No schema or privilege changes; all existing RLS and authorized writers remain.
