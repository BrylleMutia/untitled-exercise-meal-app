-- Original grocery authorship is assigned by the authenticated authority.
CREATE OR REPLACE FUNCTION private.mutate_cooking_group_week(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=private.require_authenticated(); gid uuid:=private.cooking_group_for(caller); week date; state public.cooking_group_weeks;
 claim record; items jsonb; item jsonb; amount numeric; quantity numeric; result jsonb; assignment public.cooking_assignments; pm public.planned_meals; plan public.meal_plans; next_plan bigint; normalized jsonb; chosen public.meals; recipe_to_use bigint; saved_item jsonb; previous_category text;
begin
 if gid is null or gid::text is distinct from p_payload->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 select * into claim from private.claim_mutation(caller,'mutate_cooking_group_week',p_payload->>'idempotencyKey',p_payload);
 if claim.replay then return claim.result_refs; end if;
 perform private.assert_date_key(p_payload->>'weekOf','weekOf'); week:=(p_payload->>'weekOf')::date;
 if private.calendar_week(week,private.account_week_start(caller))<>week then perform private.raise_mutation_error('stale_version','Calendar changed. Return to the newly grouped list.'); end if;
 insert into public.cooking_group_weeks(group_id,week_of) values(gid,week) on conflict do nothing;
 select * into state from public.cooking_group_weeks where group_id=gid and week_of=week for update;
 if state.revision is distinct from (p_payload->>'revision')::integer then perform private.raise_mutation_error('stale_version','Shared list changed. Refresh and review the latest value.'); end if;
 if p_payload->>'action'='edit-assignment' then
   perform set_config('app.cooking_edit',gid::text,true);
   select * into assignment from public.cooking_assignments where group_id=gid and id=p_payload->>'assignmentId';
   if assignment.id is null or private.cooking_group_for(assignment.user_id) is distinct from gid then perform private.raise_mutation_error('not_found','Assignment not found'); end if;
   select * into plan from public.meal_plans where user_id=assignment.user_id and week_of=week and calendar_active order by version desc,row_id desc limit 1 for update;
   select * into pm from public.planned_meals where meal_plan_row_id=plan.row_id and app_id=assignment.id;
   if pm.row_id is null then perform private.raise_mutation_error('stale_version','Assignment changed. Refresh and review.'); end if;
   if exists(select 1 from public.nutrition_logs where user_id=assignment.user_id and planned_meal_app_id=assignment.id) then perform private.raise_mutation_error('conflict','This saved assignment is protected. Refresh your plan or choose another meal.'); end if;
   perform private.assert_finite_number(p_payload->>'servings','servings',.25,4);
   if (p_payload->>'servings')::numeric*4<>trunc((p_payload->>'servings')::numeric*4) then perform private.raise_mutation_error('validation_failed','Choose quarter servings'); end if;
   recipe_to_use:=pm.meal_row_id;
   if nullif(p_payload->>'recipeId','') is not null and p_payload->>'recipeId'<>assignment.recipe_id then
     select * into chosen from public.meals where app_id=p_payload->>'recipeId' and archived_at is null and (is_system or owner_user_id in(select user_id from public.cooking_group_members where group_id=gid));
     if chosen.row_id is null or not(pm.meal_slot=any(chosen.meal_slots)) then perform private.raise_mutation_error('validation_failed','Choose an available recipe for this meal'); end if;
          if plan.preference_policy='advisory_v1' then perform private.assert_generation_recipe(chosen,(select p from public.profiles p where id=assignment.user_id)); else perform private.assert_enforced_generation_recipe(chosen,(select p from public.profiles p where id=assignment.user_id)); end if;
     recipe_to_use:=private.cooking_copy_recipe(chosen.row_id,assignment.user_id);
     update public.cooking_assignments set recipe_id=chosen.app_id,recipe_snapshot_row_id=recipe_to_use where user_id=assignment.user_id and id=assignment.id;
   end if;
   normalized:=private.normalize_planned_meal_record(jsonb_build_object('mealId',(select app_id from public.meals where row_id=recipe_to_use),'servings',p_payload->'servings'),assignment.user_id);
   if plan.preference_policy<>'advisory_v1' and private.total_carb_limit((select dietary_pattern from public.profiles where id=assignment.user_id)) is not null and (normalized->>'expectedCarbsG')::numeric+coalesce((select sum(expected_carbs_g) from public.planned_meals where meal_plan_row_id=plan.row_id and meal_date=pm.meal_date and not skipped and row_id<>pm.row_id),0)>private.total_carb_limit((select dietary_pattern from public.profiles where id=assignment.user_id)) then perform private.raise_mutation_error('validation_failed','Portion exceeds this memberâ€™s planning limits'); end if;
   next_plan:=private.cooking_copy_row('meal_plans',plan.row_id,jsonb_build_object('version',plan.version+1,'supersedes_plan_row_id',plan.row_id,'created_at',now()));
   for item in select to_jsonb(p) from public.planned_meals p where meal_plan_row_id=plan.row_id loop
     perform private.cooking_copy_row('planned_meals',(item->>'row_id')::bigint,jsonb_build_object('meal_plan_row_id',next_plan)||case when item->>'app_id'=assignment.id then jsonb_build_object('meal_row_id',recipe_to_use,'label',normalized->'label','source',normalized->'source','source_version',normalized->'sourceVersion','assumptions',normalized->'assumptions','servings',p_payload->'servings','skipped',(p_payload->>'skipped')::boolean,'expected_calories',normalized->'expectedCalories','expected_protein_g',normalized->'expectedProteinG','expected_carbs_g',normalized->'expectedCarbsG','expected_fat_g',normalized->'expectedFatG') else '{}'::jsonb end);
   end loop;
   perform private.reconcile_cooking_grocery(gid,week);
 elsif p_payload->>'operation'='refresh' then perform private.reconcile_cooking_grocery(gid,week);
 elsif p_payload->>'operation'='amount' then
   if jsonb_typeof(p_payload->'amount') is distinct from 'null' then
     perform private.assert_finite_number(p_payload->>'amount','amount',0,9007199254740991);
     amount:=(p_payload->>'amount')::numeric;
     if amount<>trunc(amount) then perform private.raise_mutation_error('validation_failed','Use integer centavos'); end if;
   end if;
   update public.cooking_group_weeks set grocery=grocery||jsonb_build_object('totalAmountCentavos',amount,'totalAmountCarriedFromWeek',null),revision=revision+1 where group_id=gid and week_of=week;
 else
   items:='[]';
   if p_payload->>'operation'='add' then
     perform private.assert_nonblank(p_payload->>'name','name',256); perform private.assert_nonblank(p_payload->>'unit','unit',32);
     perform private.assert_finite_number(p_payload->>'quantity','quantity',0,1000000);
     perform private.save_grocery_category_preference(gid,p_payload->>'name',coalesce(p_payload->>'category','Other'),p_payload->'categoryPreference');
     saved_item:=jsonb_build_object('id','custom-'||gen_random_uuid()::text,'name',btrim(p_payload->>'name'),'unit',p_payload->>'unit','category',coalesce(p_payload->>'category','Other'),'quantity',(p_payload->>'quantity')::numeric,'generatedQuantity',0,'custom',true,'checked',false,'addedByUserId',caller::text);
     items:=state.grocery->'items'||jsonb_build_array(saved_item);
   else
     if not exists(select 1 from jsonb_array_elements(state.grocery->'items') i where i->>'id'=p_payload->>'itemId') then perform private.raise_mutation_error('not_found','Item not found'); end if;
     for item in select value from jsonb_array_elements(state.grocery->'items') loop
       if item->>'id'=p_payload->>'itemId' then
         case p_payload->>'operation'
         when 'quantity' then
           perform private.assert_finite_number(p_payload->>'quantity','quantity',0,1000000); quantity:=(p_payload->>'quantity')::numeric;
           previous_category:=item->>'category';
           if p_payload ? 'category' then
             if (case when jsonb_typeof(item->'personalGenerated')='boolean' then (item->>'personalGenerated')::boolean else not coalesce((item->>'custom')::boolean,false) end) then perform private.raise_mutation_error('validation_failed','Only manually added items can change category'); end if;
             perform private.save_grocery_category_preference(gid,item->>'name',p_payload->>'category',p_payload->'categoryPreference');
             item:=item||jsonb_build_object('category',p_payload->>'category');
           elsif p_payload ? 'categoryPreference' then perform private.raise_mutation_error('validation_failed','Category is required'); end if;
           item:=item||jsonb_build_object('quantity',quantity); saved_item:=item;
         when 'toggle' then item:=item||jsonb_build_object('checked',not coalesce((item->>'checked')::boolean,false));
         when 'remove' then item:=item||'{"removed":true}'::jsonb;
         else perform private.raise_mutation_error('validation_failed','Choose a grocery action'); end case;
       end if;
       items:=items||jsonb_build_array(item);
     end loop;
   end if;
   update public.cooking_group_weeks set grocery=grocery||jsonb_build_object('items',items),revision=revision+1 where group_id=gid and week_of=week;
 end if;
 result:='{"success":true}'::jsonb||case when saved_item is not null then jsonb_build_object('groceryItem',saved_item,'previousCategory',previous_category) else '{}'::jsonb end; perform private.complete_mutation(claim.mutation_row_id,result); return result;
end;
$function$;

-- Only completed Add receipts return a custom item with a zero generated basis
-- and an explicit null previous category. Quantity-edit receipts have a prior
-- category. Multiple recorded actors leave attribution unknown.
create or replace function private.backfill_shared_grocery_item_authors()
returns bigint language sql set search_path = '' as $backfill$
with verified_adds as materialized (
  select result_refs #>> '{groceryItem,id}' as item_id,
         min(user_id::text) as added_by
  from public.mutation_idempotency
  where operation = 'mutate_cooking_group_week' and status = 'completed'
    and result_refs->'previousCategory' = 'null'::jsonb
    and result_refs #>> '{groceryItem,id}' like 'custom-%'
    and result_refs #>> '{groceryItem,custom}' = 'true'
    and result_refs #> '{groceryItem,generatedQuantity}' = '0'::jsonb
    and coalesce(result_refs #>> '{groceryItem,personalGenerated}', 'false') = 'false'
    and nullif(result_refs #>> '{groceryItem,category}', '') is not null
  group by result_refs #>> '{groceryItem,id}'
  having count(distinct user_id) = 1
), updated as (
update public.cooking_group_weeks w
set grocery = jsonb_set(w.grocery, '{items}', (
    select jsonb_agg(case when nullif(item->>'addedByUserId', '') is null
      and coalesce(item->>'personalGenerated', case when item->>'custom' = 'true' then 'false' else 'true' end) = 'false'
      and a.added_by is not null
      then item || jsonb_build_object('addedByUserId', a.added_by)
      else item end order by position)
  from jsonb_array_elements(coalesce(w.grocery->'items', '[]'::jsonb)) with ordinality as entries(item, position)
  left join verified_adds a on a.item_id = item->>'id'
)), revision = w.revision + 1
where exists (
  select 1 from jsonb_array_elements(coalesce(w.grocery->'items', '[]'::jsonb)) item
  join verified_adds a on a.item_id = item->>'id'
  where nullif(item->>'addedByUserId', '') is null
    and coalesce(item->>'personalGenerated', case when item->>'custom' = 'true' then 'false' else 'true' end) = 'false'
)
returning 1
)
select count(*) from updated;
$backfill$;

revoke all on function private.backfill_shared_grocery_item_authors() from public, anon, authenticated;
do $$ begin perform private.backfill_shared_grocery_item_authors(); end $$;

revoke all on function private.mutate_cooking_group_week(jsonb) from public, anon, authenticated;
revoke all on function public.mutate_cooking_group_week(jsonb) from public, anon;
grant execute on function public.mutate_cooking_group_week(jsonb) to authenticated;
