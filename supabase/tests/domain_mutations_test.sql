begin;

select plan(63);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000301', 'rpc-a@example.test'),
  ('00000000-0000-0000-0000-000000000302', 'rpc-b@example.test');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000301';

select lives_ok($$
  select public.complete_onboarding($onboarding$
    {
      "profile": {
        "name": "RPC User A", "age": 30, "sex": "female",
        "heightCm": 165, "weightKg": 65, "units": "metric",
        "experience": "beginner", "equipment": ["none"],
        "daysPerWeek": 3, "sessionMinutes": 30, "goal": "maintain",
        "dietaryPattern": "", "allergies": [], "foodPreferences": []
      },
      "target": {
        "id": "test-rpc-target-a", "effectiveDate": "2026-09-07",
        "calories": 2000, "proteinG": 120, "carbsG": 220, "fatG": 60,
        "bmr": 1400, "bmi": 24, "tdee": 2000, "activityFactor": 1.5,
        "formula": "test-formula", "calculationAssumptions": "test",
        "disclaimer": "Test estimates only."
      },
      "plan": {
        "id": "test-rpc-plan-a", "workouts": [{
          "id": "test-rpc-workout-a", "dayOfWeek": 1,
          "title": "RPC workout", "focus": "Full body",
          "estimatedMinutes": 30, "sortOrder": 1,
          "warmup": [], "cooldown": [], "exercises": [{
            "id": "test-rpc-exercise-a", "exerciseId": "ex-knee-push-up",
            "sortOrder": 1, "sets": 3, "reps": 8, "restSeconds": 60
          }]
        }]
      },
      "mealPlan": {
        "id": "test-rpc-meal-plan-a", "weekOf": "2026-09-07",
        "meals": [{
          "id": "test-rpc-planned-meal-a", "date": "2026-09-07",
          "slot": "breakfast", "foodId": "food-egg",
          "label": "Egg breakfast", "servings": 1,
          "expectedCalories": 72, "expectedProteinG": 6.3,
          "expectedCarbsG": 0.4, "expectedFatG": 4.8,
          "source": "Starter Food Catalog", "sourceVersion": "2026.09",
          "confidence": "high", "preparationBasis": "as_labeled"
        }]
      },
      "grocery": {
        "id": "test-rpc-grocery-a", "weekOf": "2026-09-07",
        "items": [{
          "id": "test-rpc-grocery-item-a", "name": "Egg",
          "category": "Protein", "unit": "piece", "generatedQuantity": 2,
          "quantity": 2, "checked": false, "custom": false,
          "removed": false, "foodId": "food-egg"
        }]
      },
      "effectiveDate": "2026-09-07", "goalId": "test-rpc-goal-a",
      "idempotencyKey": "test-rpc-onboarding-a"
    }
  $onboarding$::jsonb)
$$, 'onboarding RPC atomically creates the initial domain bundle');

select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-000000000301'), 1, 'onboarding creates one profile');
select is((select count(*)::int from public.goals where user_id = '00000000-0000-0000-0000-000000000301'), 1, 'onboarding creates one goal');
select is((select count(*)::int from public.daily_targets where user_id = '00000000-0000-0000-0000-000000000301'), 1, 'onboarding creates one target version');
select is((select count(*)::int from public.workout_plans where user_id = '00000000-0000-0000-0000-000000000301'), 1, 'onboarding creates one workout plan version');
select is((select count(*)::int from public.planned_workouts where user_id = '00000000-0000-0000-0000-000000000301'), 1, 'onboarding creates planned workouts');
select is((select count(*)::int from public.planned_exercises where user_id = '00000000-0000-0000-0000-000000000301'), 1, 'onboarding creates planned exercises');
select is((select count(*)::int from public.meal_plans where user_id = '00000000-0000-0000-0000-000000000301'), 1, 'onboarding creates one meal plan version');
select is((select count(*)::int from public.planned_meals where user_id = '00000000-0000-0000-0000-000000000301'), 1, 'onboarding creates planned meals');
select is((select count(*)::int from public.grocery_lists where user_id = '00000000-0000-0000-0000-000000000301'), 1, 'onboarding creates one grocery list');
select is((select count(*)::int from public.grocery_items where user_id = '00000000-0000-0000-0000-000000000301'), 1, 'onboarding creates grocery items');
select is((select count(*)::int from public.mutation_idempotency where user_id = '00000000-0000-0000-0000-000000000301' and operation = 'complete_onboarding'), 1, 'onboarding records one idempotency claim');
select is((select count(*)::int from public.planned_exercises where app_id = 'test-rpc-exercise-a' and exercise_name_snapshot = 'Knee Push-up'), 1, 'onboarding preserves catalog exercise snapshots and app IDs');
select is((select count(*)::int from public.planned_meals where food_row_id = (select row_id from public.foods where app_id = 'food-egg') and source_version = '2026.09'), 1, 'onboarding preserves nutrition source and catalog version');

select is((select public.complete_onboarding($replay$
    {"profile":{"name":"RPC User A","age":30,"sex":"female","heightCm":165,"weightKg":65,"units":"metric","experience":"beginner","equipment":["none"],"daysPerWeek":3,"sessionMinutes":30,"goal":"maintain","dietaryPattern":"","allergies":[],"foodPreferences":[]},
     "target":{"id":"test-rpc-target-a","effectiveDate":"2026-09-07","calories":2000,"proteinG":120,"carbsG":220,"fatG":60,"bmr":1400,"bmi":24,"tdee":2000,"activityFactor":1.5,"formula":"test-formula","calculationAssumptions":"test","disclaimer":"Test estimates only."},
     "plan":{"id":"test-rpc-plan-a","workouts":[{"id":"test-rpc-workout-a","dayOfWeek":1,"title":"RPC workout","focus":"Full body","estimatedMinutes":30,"sortOrder":1,"warmup":[],"cooldown":[],"exercises":[{"id":"test-rpc-exercise-a","exerciseId":"ex-knee-push-up","sortOrder":1,"sets":3,"reps":8,"restSeconds":60}]}]},
     "mealPlan":{"id":"test-rpc-meal-plan-a","weekOf":"2026-09-07","meals":[{"id":"test-rpc-planned-meal-a","date":"2026-09-07","slot":"breakfast","foodId":"food-egg","label":"Egg breakfast","servings":1,"expectedCalories":72,"expectedProteinG":6.3,"expectedCarbsG":0.4,"expectedFatG":4.8,"source":"Starter Food Catalog","sourceVersion":"2026.09","confidence":"high","preparationBasis":"as_labeled"}]},
     "grocery":{"id":"test-rpc-grocery-a","weekOf":"2026-09-07","items":[{"id":"test-rpc-grocery-item-a","name":"Egg","category":"Protein","unit":"piece","generatedQuantity":2,"quantity":2,"checked":false,"custom":false,"removed":false,"foodId":"food-egg"}]},
     "effectiveDate":"2026-09-07","goalId":"test-rpc-goal-a","idempotencyKey":"test-rpc-onboarding-a"}
  $replay$::jsonb)->>'replayed'), 'true', 'repeating onboarding with the same request replays safely');
select is((select count(*)::int from public.goals where user_id = '00000000-0000-0000-0000-000000000301'), 1, 'onboarding replay does not duplicate goals');

select throws_ok($$select public.complete_onboarding('{"idempotencyKey":"test-rpc-onboarding-a","different":true}'::jsonb)$$,
  'P0001', null, 'reusing a key with a different request hash is rejected');

set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000302';
select throws_ok($$
  select public.complete_onboarding($invalid_onboarding$
    {"profile":{"name":"RPC User B","age":30,"sex":"male","heightCm":175,"weightKg":75,"units":"metric","experience":"beginner","equipment":["none"],"daysPerWeek":3,"sessionMinutes":30,"goal":"maintain"},
     "target":{"id":"test-rpc-target-b","effectiveDate":"2026-09-07","calories":2000,"proteinG":120,"carbsG":220,"fatG":60,"bmr":1400,"bmi":24,"tdee":2000,"activityFactor":1.5,"formula":"test","disclaimer":"test"},
     "plan":{"id":"test-rpc-plan-b","workouts":[{"id":"test-rpc-workout-b","dayOfWeek":1,"title":"RPC workout","focus":"Full body","estimatedMinutes":30,"exercises":[{"id":"test-rpc-exercise-b","exerciseId":"missing-exercise","sets":3,"reps":8,"restSeconds":60}]}]},
     "mealPlan":{"id":"test-rpc-meal-plan-b","weekOf":"2026-09-07","meals":[]},
     "idempotencyKey":"test-rpc-invalid-onboarding"}
  $invalid_onboarding$::jsonb)
$$, 'P0001', null, 'invalid onboarding child data fails the atomic bundle');
set local role postgres;
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-000000000302'), 0, 'invalid onboarding leaves no partial profile');
select is((select count(*)::int from public.goals where user_id = '00000000-0000-0000-0000-000000000302'), 0, 'invalid onboarding leaves no partial goal');
select is((select count(*)::int from public.daily_targets where user_id = '00000000-0000-0000-0000-000000000302'), 0, 'invalid onboarding leaves no partial target');
select is((select count(*)::int from public.workout_plans where user_id = '00000000-0000-0000-0000-000000000302'), 0, 'invalid onboarding leaves no partial plan');
select is((select count(*)::int from public.meal_plans where user_id = '00000000-0000-0000-0000-000000000302'), 0, 'invalid onboarding leaves no partial meal plan');
select is((select count(*)::int from public.grocery_lists where user_id = '00000000-0000-0000-0000-000000000302'), 0, 'invalid onboarding leaves no partial grocery list');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000301';
select lives_ok($$select public.update_profile('{"profile":{"name":"RPC User A Updated","age":31,"sex":"female","heightCm":165,"weightKg":64,"units":"metric","experience":"beginner","equipment":["none"],"daysPerWeek":3,"sessionMinutes":30,"goal":"maintain"},"target":{"id":"test-rpc-target-a-2","effectiveDate":"2026-09-10","calories":1950,"proteinG":120,"carbsG":210,"fatG":58,"bmr":1390,"bmi":23.5,"tdee":1950,"activityFactor":1.5,"formula":"test-2","disclaimer":"Test estimates only."},"plan":{"id":"test-rpc-plan-a","workouts":[{"id":"test-rpc-workout-a","dayOfWeek":1,"title":"RPC workout v2","focus":"Full body","estimatedMinutes":30,"exercises":[{"id":"test-rpc-exercise-a","exerciseId":"ex-knee-push-up","sets":3,"reps":10,"restSeconds":60}]}]},"mealPlan":{"id":"test-rpc-meal-plan-a","weekOf":"2026-09-07","meals":[]},"effectiveDate":"2026-09-10","goalId":"test-rpc-goal-a-2","idempotencyKey":"test-rpc-profile-update"}'::jsonb)$$,
  'profile update RPC creates a new versioned target and plan');
select is((select count(*)::int from public.goals where user_id = '00000000-0000-0000-0000-000000000301'), 2, 'profile update retains the prior goal version');
select is((select count(*)::int from public.daily_targets where user_id = '00000000-0000-0000-0000-000000000301'), 2, 'profile update appends a target version');
select is((select count(*)::int from public.workout_plans where user_id = '00000000-0000-0000-0000-000000000301'), 2, 'profile update appends a workout plan version');
select is((select count(*)::int from public.planned_workouts where user_id = '00000000-0000-0000-0000-000000000301'), 2, 'profile update retains prior planned workouts');

select lives_ok($$select public.start_workout_session('{"session":{"id":"test-rpc-session-a","plannedWorkoutId":"test-rpc-workout-a","date":"2026-09-10","startedAt":"2026-09-10T08:00:00Z"},"idempotencyKey":"test-rpc-start-a"}'::jsonb)$$,
  'workout start creates an in-progress session');
select is((select count(*)::int from public.workout_sessions where user_id = '00000000-0000-0000-0000-000000000301' and app_id = 'test-rpc-session-a'), 1, 'workout start creates one session');
select is((select public.start_workout_session('{"session":{"id":"test-rpc-session-a","plannedWorkoutId":"test-rpc-workout-a","date":"2026-09-10","startedAt":"2026-09-10T08:00:00Z"},"idempotencyKey":"test-rpc-start-a"}'::jsonb)->>'replayed'), 'true', 'workout start replay is stable');
select lives_ok($$select public.save_workout_session('{"session":{"id":"test-rpc-session-a","logs":[{"plannedExerciseId":"test-rpc-exercise-a","actualExerciseId":"ex-knee-push-up","status":"completed","actual":{"sets":3,"reps":8},"rpe":6,"manageable":true,"pain":false,"note":"steady"}]},"idempotencyKey":"test-rpc-save-session-a"}'::jsonb)$$,
  'workout save stores actual exercise results');
select is((select count(*)::int from public.exercise_logs el join public.workout_sessions ws on ws.row_id = el.session_row_id where ws.app_id = 'test-rpc-session-a'), 1, 'workout save creates one exercise log');
select ok((select planned_sets <> actual_sets or planned_reps <> actual_reps from public.exercise_logs el join public.workout_sessions ws on ws.row_id = el.session_row_id where ws.app_id = 'test-rpc-session-a'), 'planned and actual workout values remain separate');
select lives_ok($$select public.finish_workout_session('{"session":{"id":"test-rpc-session-a","finishedAt":"2026-09-10T08:30:00Z","logs":[{"plannedExerciseId":"test-rpc-exercise-a","actualExerciseId":"ex-knee-push-up","status":"completed","actual":{"sets":3,"reps":8},"rpe":6,"manageable":true,"pain":false}]},"idempotencyKey":"test-rpc-finish-a"}'::jsonb)$$,
  'workout finish completes a valid session');
select is((select status from public.workout_sessions where app_id = 'test-rpc-session-a'), 'completed', 'finished session status is completed');
select is((select public.finish_workout_session('{"session":{"id":"test-rpc-session-a","finishedAt":"2026-09-10T08:30:00Z","logs":[{"plannedExerciseId":"test-rpc-exercise-a","actualExerciseId":"ex-knee-push-up","status":"completed","actual":{"sets":3,"reps":8},"rpe":6,"manageable":true,"pain":false}]},"idempotencyKey":"test-rpc-finish-a"}'::jsonb)->>'replayed'), 'true', 'workout finish retries replay safely');
select throws_ok($$select public.finish_workout_session('{"session":{"id":"test-rpc-session-a","logs":[]},"idempotencyKey":"test-rpc-finish-again"}'::jsonb)$$,
  'P0001', null, 'a completed session cannot be finished again with a new key');

select lives_ok($$select public.save_nutrition_log('{"entry":{"id":"test-rpc-nutrition-a","date":"2026-09-10","slot":"lunch","foodId":"food-egg","servings":2,"servingQuantity":2,"servingUnit":"piece","calories":144,"proteinG":12.6,"carbsG":0.8,"fatG":9.6,"fiberG":0,"estimated":true,"confidence":"high","source":"Starter Food Catalog","sourceVersion":"2026.09","preparationBasis":"as_labeled","assumptions":"test"},"idempotencyKey":"test-rpc-nutrition-a"}'::jsonb)$$,
  'nutrition RPC saves a system food snapshot');
select ok((select source_version = '2026.09' and confidence = 'high' and serving_quantity = 2 and preparation_basis = 'as_labeled' and estimated from public.nutrition_logs where app_id = 'test-rpc-nutrition-a'), 'nutrition source, serving, confidence, preparation, and estimate metadata persist');
select lives_ok($$select public.save_nutrition_log('{"entry":{"id":"test-rpc-nutrition-a","date":"2026-09-10","slot":"lunch","foodId":"food-egg","servings":2,"servingQuantity":2,"servingUnit":"piece","calories":150,"proteinG":13,"carbsG":1,"fatG":10,"confidence":"medium","source":"Manual correction"},"idempotencyKey":"test-rpc-nutrition-update"}'::jsonb)$$,
  'saving the same nutrition app ID updates rather than duplicates');
select is((select count(*)::int from public.nutrition_logs where app_id = 'test-rpc-nutrition-a'), 1, 'nutrition app IDs are idempotent at the row level');
select lives_ok($$select public.save_nutrition_log('{"entry":{"id":"test-rpc-nutrition-custom","date":"2026-09-10","slot":"snack","customName":"Homemade snack","servings":1,"servingQuantity":1,"servingUnit":"custom","calories":200,"proteinG":5,"carbsG":20,"fatG":10,"confidence":"low","source":"User-provided"},"idempotencyKey":"test-rpc-nutrition-custom"}'::jsonb)$$,
  'nutrition RPC accepts a reviewed custom-name entry');
select lives_ok($$select public.save_weight_entry('{"entry":{"id":"test-rpc-weight-a","date":"2026-09-10","weightKg":64.5},"idempotencyKey":"test-rpc-weight-a"}'::jsonb)$$,
  'weight RPC saves an observation');
select lives_ok($$select public.save_saved_meal('{"meal":{"id":"test-rpc-saved-meal-a","name":"RPC saved meal","servings":1,"notes":"test","ingredients":[{"foodId":"food-egg","servings":2}]},"idempotencyKey":"test-rpc-meal-a"}'::jsonb)$$,
  'saved meal RPC accepts system catalog ingredients');
select is((select count(*)::int from public.meal_ingredients mi join public.meals m on m.row_id = mi.meal_row_id where m.app_id = 'test-rpc-saved-meal-a'), 1, 'saved meal preserves ordered ingredient rows');
select throws_ok($$select public.save_saved_meal('{"meal":{"id":"meal-yogurt-bowl","name":"overwrite","servings":1,"ingredients":[]},"idempotencyKey":"test-rpc-system-meal"}'::jsonb)$$,
  'P0001', null, 'system starter meals cannot be overwritten');

select lives_ok($$select public.set_grocery_quantity('{"itemId":"test-rpc-grocery-item-a","quantity":5,"idempotencyKey":"test-rpc-grocery-set"}'::jsonb)$$,
  'grocery quantity edits are accepted');
select lives_ok($$select public.toggle_grocery_item('{"itemId":"test-rpc-grocery-item-a","idempotencyKey":"test-rpc-grocery-toggle"}'::jsonb)$$,
  'grocery checked state toggles');
select lives_ok($$select public.remove_grocery_item('{"itemId":"test-rpc-grocery-item-a","idempotencyKey":"test-rpc-grocery-remove"}'::jsonb)$$,
  'grocery removal is a soft state change');
select lives_ok($$select public.regenerate_grocery('{"grocery":{"id":"test-rpc-grocery-a","weekOf":"2026-09-07","items":[{"id":"test-rpc-grocery-item-a","generatedQuantity":7}]},"idempotencyKey":"test-rpc-grocery-regenerate"}'::jsonb)$$,
  'grocery regeneration accepts generated quantities');
select is((select quantity from public.grocery_items where app_id = 'test-rpc-grocery-item-a')::numeric, 5::numeric, 'regeneration preserves an explicit user quantity override');
select ok((select checked and removed from public.grocery_items where app_id = 'test-rpc-grocery-item-a'), 'regeneration preserves checked and removed state');
select lives_ok($$select public.add_custom_grocery_item('{"grocery":{"id":"test-rpc-grocery-a"},"item":{"id":"test-rpc-custom-item","name":"Custom item","category":"Other","unit":"pack","quantity":1},"idempotencyKey":"test-rpc-custom-grocery"}'::jsonb)$$,
  'custom grocery items can be added');
select is((select count(*)::int from public.grocery_items where app_id = 'test-rpc-custom-item'), 1, 'custom grocery item persists');

select lives_ok($$select public.export_account_data('{"idempotencyKey":"test-rpc-export-a"}'::jsonb)$$,
  'export RPC returns the owner-scoped account document');
select ok((select (public.export_account_data('{"idempotencyKey":"test-rpc-export-shape"}'::jsonb)->'data'->'goals'->0) ? 'app_id'), 'export preserves application IDs');
select ok((select (public.export_account_data('{"idempotencyKey":"test-rpc-export-shape-2"}'::jsonb)->'data'->'goals'->0) ? 'row_id') = false, 'export omits internal row IDs');
select ok((select (public.export_account_data('{"idempotencyKey":"test-rpc-export-shape-3"}'::jsonb)->'data'->'goals'->0) ? 'user_id') = false, 'export omits normalized ownership IDs');
select is((select public.export_account_data('{"idempotencyKey":"test-rpc-export-replay"}'::jsonb)->>'status'), 'completed', 'export is retry-safe');

set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000302';
select is((select public.delete_account('{"idempotencyKey":"test-rpc-delete-b"}'::jsonb)->>'clear_cache'), 'true', 'account deletion returns the cache-clearing signal');
set local role postgres;
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-000000000302'), 0, 'account deletion cascades the test user');

select * from finish();

rollback;
