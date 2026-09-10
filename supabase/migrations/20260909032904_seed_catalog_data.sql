-- Authored catalog snapshot. These values are estimates and are not the
-- trusted production nutrition database described in FEATURES.md.

insert into public.exercises (
  app_id,
  slug,
  name,
  description,
  movement_category,
  muscles,
  difficulty,
  equipment,
  measure,
  illustration_alt,
  regression_reference,
  progression_reference,
  safety,
  source,
  source_version,
  is_system
)
values
  ('ex-knee-push-up', 'knee-push-up', 'Knee Push-up', 'A gentle push-up from the knees to build pressing strength.', 'push', array['Chest', 'Triceps'], 1, array['none'], 'reps', 'Illustration of a knee push-up position', null, 'push-up', 'Keep a straight line from head to knees; stop if wrists or shoulders hurt.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-incline-push-up', 'incline-push-up', 'Incline Push-up', 'Hands on a bench or counter to make the push-up easier.', 'push', array['Chest', 'Triceps'], 1, array['bench'], 'reps', 'Illustration of an incline push-up', 'knee-push-up', 'push-up', 'Use a stable surface that cannot slide.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-push-up', 'push-up', 'Push-up', 'Classic floor push-up with a rigid body line.', 'push', array['Chest', 'Triceps', 'Core'], 2, array['none'], 'reps', 'Illustration of a push-up', 'knee-push-up', 'diamond-push-up', 'Brace your core; elbows about 45 degrees from the body.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-diamond-push-up', 'diamond-push-up', 'Diamond Push-up', 'Narrow-hand push-up that emphasizes the triceps.', 'push', array['Triceps', 'Chest'], 4, array['none'], 'reps', 'Illustration of a diamond push-up', 'push-up', null, 'Keep wrists comfortable; shorten the range if needed.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-pike-push-up', 'pike-push-up', 'Pike Push-up', 'Hips-high push-up that shifts load toward the shoulders.', 'push', array['Shoulders', 'Triceps'], 3, array['none'], 'reps', 'Illustration of a pike push-up', 'push-up', null, 'Keep your neck neutral; look at your feet, not the floor ahead.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-dip', 'dip', 'Dip', 'Parallel-bar dip for chest and triceps.', 'push', array['Chest', 'Triceps'], 4, array['bench'], 'reps', 'Illustration of a dip', 'bench-supported dip with feet down', null, 'Stop above shoulder discomfort; avoid shrugging.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-inverted-row', 'inverted-row', 'Inverted Row', 'Horizontal pull under a bar or sturdy table edge.', 'pull', array['Back', 'Biceps'], 2, array['pullup_bar'], 'reps', 'Illustration of an inverted row', null, 'pull-up', 'Check the surface can hold you; keep ribs down.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-pull-up', 'pull-up', 'Pull-up', 'Full hang to chin-over-bar pull.', 'pull', array['Lats', 'Biceps'], 4, array['pullup_bar'], 'reps', 'Illustration of a pull-up', 'inverted-row', null, 'Avoid kipping in the MVP program; control the lowering phase.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-bodyweight-squat', 'bodyweight-squat', 'Bodyweight Squat', 'Sit back and down to a comfortable depth, drive up tall.', 'squat', array['Quads', 'Glutes'], 1, array['none'], 'reps', 'Illustration of a bodyweight squat', null, 'bulgarian-split-squat', 'Knees track over toes; heels stay down.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-goblet-squat', 'goblet-squat', 'Goblet Squat', 'Squat holding a dumbbell at the chest.', 'squat', array['Quads', 'Glutes'], 2, array['dumbbells'], 'reps', 'Illustration of a goblet squat', 'bodyweight-squat', null, 'Start light; keep the chest up.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-bulgarian-split-squat', 'bulgarian-split-squat', 'Bulgarian Split Squat', 'Rear-foot-elevated single-leg squat.', 'squat', array['Quads', 'Glutes'], 4, array['bench'], 'reps', 'Illustration of a Bulgarian split squat', 'bodyweight-squat', null, 'Hold a support until balance is reliable.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-glute-bridge', 'glute-bridge', 'Glute Bridge', 'Hip lift from the floor for glutes and hamstrings.', 'hinge', array['Glutes', 'Hamstrings'], 1, array['none'], 'reps', 'Illustration of a glute bridge', null, 'single-leg-romanian-deadlift', 'Squeeze glutes at the top; do not arch the lower back.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-good-morning', 'good-morning', 'Good Morning', 'Hip hinge with hands behind the head.', 'hinge', array['Hamstrings', 'Lower Back'], 2, array['none'], 'reps', 'Illustration of a good morning hinge', 'glute-bridge', null, 'Soft knees, neutral spine, small range first.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-single-leg-romanian-deadlift', 'single-leg-romanian-deadlift', 'Single-Leg Romanian Deadlift', 'One-legged hinge with a dumbbell.', 'hinge', array['Hamstrings', 'Glutes'], 4, array['dumbbells'], 'reps', 'Illustration of a single-leg Romanian deadlift', 'good-morning', null, 'Stand near a wall or chair for balance support.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-plank', 'plank', 'Plank', 'Straight-line forearm hold.', 'core', array['Core'], 2, array['none'], 'hold', 'Illustration of a plank hold', 'dead-bug', 'side-plank', 'Stop if the lower back sags or pinches.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-side-plank', 'side-plank', 'Side Plank', 'Lateral hold on one forearm.', 'core', array['Obliques', 'Core'], 3, array['none'], 'hold', 'Illustration of a side plank', 'plank', null, 'Stack shoulder over elbow; drop the knee to scale down.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-dead-bug', 'dead-bug', 'Dead Bug', 'Alternating arm and leg reaches lying on your back.', 'core', array['Core'], 1, array['none'], 'reps', 'Illustration of a dead bug exercise', null, 'plank', 'Keep the lower back gently pressed to the floor.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-bird-dog', 'bird-dog', 'Bird Dog', 'Opposite arm and leg reach from all fours.', 'core', array['Core', 'Glutes'], 1, array['none'], 'reps', 'Illustration of a bird dog exercise', null, 'plank', 'Move slowly; hips stay level.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-mountain-climber', 'mountain-climber', 'Mountain Climber', 'Alternating knee drives from a plank position.', 'core', array['Core', 'Hip Flexors'], 3, array['none'], 'reps', 'Illustration of mountain climbers', 'plank', null, 'Keep wrists under shoulders; slow down if form breaks.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-hanging-knee-raise', 'hanging-knee-raise', 'Hanging Knee Raise', 'Knee lifts while hanging from a bar.', 'core', array['Core', 'Grip'], 3, array['pullup_bar'], 'reps', 'Illustration of a hanging knee raise', 'dead-bug', null, 'No swinging; step down if grip fails.', '@bryllim/workout-guide', '1.0.0', true),
  ('ex-superman-hold', 'superman-hold', 'Superman Hold', 'Prone back-extension hold.', 'core', array['Lower Back', 'Glutes'], 1, array['none'], 'hold', 'Illustration of a superman hold', null, null, 'Lift gently; stop on any back pain.', '@bryllim/workout-guide', '1.0.0', true)
on conflict (app_id) do nothing;

insert into public.foods (
  app_id,
  is_system,
  name,
  serving_label,
  serving_grams,
  serving_unit,
  calories,
  protein_g,
  carbs_g,
  fat_g,
  fiber_g,
  category,
  source,
  source_version,
  estimated,
  confidence,
  preparation_basis
)
values
  ('food-egg', true, 'Egg', '1 large egg', 50, 'piece', 72, 6.3, 0.4, 4.8, null, 'Protein', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-chicken', true, 'Chicken breast', '120 g, cooked', 120, 'g', 198, 37, 0, 4.3, null, 'Protein', 'Starter Food Catalog', '2026.09', true, 'high', 'cooked'),
  ('food-salmon', true, 'Salmon', '120 g fillet', 120, 'g', 250, 26, 0, 15, null, 'Protein', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-tofu', true, 'Tofu', '150 g', 150, 'g', 114, 12, 2.9, 6, null, 'Protein', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-greek-yogurt', true, 'Greek yogurt', '170 g cup', 170, 'g', 100, 17, 6, 0.7, null, 'Dairy', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-milk', true, 'Milk', '250 ml glass', 250, 'g', 122, 8, 12, 4.8, null, 'Dairy', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-cheddar', true, 'Cheddar', '30 g slice', 30, 'g', 121, 7, 0.4, 10, null, 'Dairy', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-oats', true, 'Rolled oats', '40 g dry', 40, 'g', 152, 5.3, 26, 2.6, 4, 'Grains', 'Starter Food Catalog', '2026.09', true, 'high', 'dry'),
  ('food-bread', true, 'Whole wheat bread', '1 slice', 32, 'piece', 81, 4, 13.8, 1.1, 1.9, 'Grains', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-rice', true, 'White rice', '150 g, cooked', 150, 'g', 194, 4.1, 42, 0.4, null, 'Grains', 'Starter Food Catalog', '2026.09', true, 'high', 'cooked'),
  ('food-pasta', true, 'Pasta', '150 g, cooked', 150, 'g', 236, 8.5, 46, 1.4, 2.7, 'Grains', 'Starter Food Catalog', '2026.09', true, 'high', 'cooked'),
  ('food-banana', true, 'Banana', '1 medium', 118, 'piece', 105, 1.3, 27, 0.4, 3.1, 'Produce', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-apple', true, 'Apple', '1 medium', 182, 'piece', 95, 0.5, 25, 0.3, 4.4, 'Produce', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-blueberries', true, 'Blueberries', '100 g', 100, 'g', 57, 0.7, 14.5, 0.3, 2.4, 'Produce', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-broccoli', true, 'Broccoli', '100 g, cooked', 100, 'g', 35, 2.4, 7.2, 0.4, 3.3, 'Produce', 'Starter Food Catalog', '2026.09', true, 'high', 'cooked'),
  ('food-sweet-potato', true, 'Sweet potato', '150 g, baked', 150, 'g', 129, 2.3, 30, 0.2, 4.5, 'Produce', 'Starter Food Catalog', '2026.09', true, 'high', 'baked'),
  ('food-greens', true, 'Mixed greens', '80 g bowl', 80, 'g', 18, 1.4, 3, 0.2, 2, 'Produce', 'Starter Food Catalog', '2026.09', true, 'medium', 'as_labeled'),
  ('food-peanut-butter', true, 'Peanut butter', '1 tbsp (16 g)', 16, 'g', 96, 3.6, 3.6, 8.2, null, 'Pantry', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-olive-oil', true, 'Olive oil', '1 tsp (5 ml)', 5, 'g', 40, 0, 0, 4.5, null, 'Pantry', 'Starter Food Catalog', '2026.09', true, 'medium', 'as_labeled'),
  ('food-butter', true, 'Butter', '1 tsp (5 g)', 5, 'g', 36, 0, 0, 4.1, null, 'Dairy', 'Starter Food Catalog', '2026.09', true, 'medium', 'as_labeled'),
  ('food-almonds', true, 'Almonds', '28 g handful', 28, 'g', 164, 6, 6, 14, 3.5, 'Pantry', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled'),
  ('food-honey', true, 'Honey', '1 tsp (7 g)', 7, 'g', 21, 0, 5.7, 0, null, 'Pantry', 'Starter Food Catalog', '2026.09', true, 'high', 'as_labeled')
on conflict (app_id) do nothing;

insert into public.meals (app_id, is_system, name, servings, notes)
values
  ('meal-yogurt-bowl', true, 'Greek Yogurt Berry Bowl', 1, 'Stir, top with berries and honey.'),
  ('meal-pb-toast', true, 'PB Banana Toast', 1, 'Toast bread, spread, slice banana on top.'),
  ('meal-chicken-rice', true, 'Chicken & Rice Plate', 1, 'Pan-sear chicken, steam rice and broccoli, finish with olive oil.'),
  ('meal-salmon-potato', true, 'Salmon & Sweet Potato', 1, 'Bake both at 200 degrees C; add greens.')
on conflict (app_id) do nothing;

insert into public.meal_ingredients (meal_row_id, food_row_id, ingredient_order, servings)
select meals.row_id, foods.row_id, ingredients.ingredient_order, ingredients.servings
from (
  values
    ('meal-yogurt-bowl', 'food-greek-yogurt', 1, 1::numeric),
    ('meal-yogurt-bowl', 'food-blueberries', 2, 1::numeric),
    ('meal-yogurt-bowl', 'food-oats', 3, 1::numeric),
    ('meal-yogurt-bowl', 'food-honey', 4, 1::numeric),
    ('meal-pb-toast', 'food-bread', 1, 2::numeric),
    ('meal-pb-toast', 'food-peanut-butter', 2, 2::numeric),
    ('meal-pb-toast', 'food-banana', 3, 1::numeric),
    ('meal-chicken-rice', 'food-chicken', 1, 1::numeric),
    ('meal-chicken-rice', 'food-rice', 2, 1::numeric),
    ('meal-chicken-rice', 'food-broccoli', 3, 2::numeric),
    ('meal-chicken-rice', 'food-olive-oil', 4, 1::numeric),
    ('meal-salmon-potato', 'food-salmon', 1, 1::numeric),
    ('meal-salmon-potato', 'food-sweet-potato', 2, 1::numeric),
    ('meal-salmon-potato', 'food-greens', 3, 1::numeric)
) as ingredients(meal_app_id, food_app_id, ingredient_order, servings)
join public.meals on meals.app_id = ingredients.meal_app_id
join public.foods on foods.app_id = ingredients.food_app_id
on conflict (meal_row_id, ingredient_order) do nothing;

do $$
declare
  exercise_count integer;
  food_count integer;
  meal_count integer;
  ingredient_count integer;
begin
  select count(*) into exercise_count from public.exercises where is_system;
  select count(*) into food_count from public.foods where is_system;
  select count(*) into meal_count from public.meals where is_system;
  select count(*) into ingredient_count from public.meal_ingredients;

  if exercise_count <> 21 or food_count <> 22 or meal_count <> 4 or ingredient_count <> 14 then
    raise exception
      'Starter catalog seed count mismatch: exercises %, foods %, meals %, ingredients %',
      exercise_count, food_count, meal_count, ingredient_count;
  end if;
end;
$$;
