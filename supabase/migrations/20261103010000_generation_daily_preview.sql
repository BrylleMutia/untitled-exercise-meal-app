-- Group membership permits presentation of selected-date planned facts, never actual intake.
create function private.cooking_resulting_meals(p_actor uuid, p_input jsonb, p_preview jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  gid uuid := private.cooking_group_for(p_actor);
  selected_week date;
  member text;
  day text;
  kept jsonb;
  added jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    perform private.raise_mutation_error('not_authenticated','Server planning only');
  end if;
  if gid is null or gid::text is distinct from p_input->>'groupId' then
    perform private.raise_mutation_error('not_found','Group not found');
  end if;
  perform private.lock_cooking_group(gid);
  perform private.assert_date_key(p_input->>'weekOf','weekOf');
  selected_week := (p_input->>'weekOf')::date;
  if jsonb_typeof(p_input->'memberIds') is distinct from 'array' or jsonb_typeof(p_input->'selectedDates') is distinct from 'array' then
    perform private.raise_mutation_error('validation_failed','Choose people and days');
  end if;
  if jsonb_array_length(p_input->'memberIds') not between 1 and 6 or jsonb_array_length(p_input->'selectedDates') not between 1 and 7
     or (select count(distinct value) from jsonb_array_elements_text(p_input->'memberIds')) <> jsonb_array_length(p_input->'memberIds')
     or (select count(distinct value) from jsonb_array_elements_text(p_input->'selectedDates')) <> jsonb_array_length(p_input->'selectedDates') then
    perform private.raise_mutation_error('validation_failed','Choose unique people and days');
  end if;
  for member in select jsonb_array_elements_text(p_input->'memberIds') loop
    if not exists(select 1 from public.cooking_group_members where group_id=gid and user_id::text=member) then
      perform private.raise_mutation_error('not_found','Group member not found');
    end if;
  end loop;
  for day in select jsonb_array_elements_text(p_input->'selectedDates') loop
    perform private.assert_date_key(day,'selectedDates');
    if day::date < selected_week or day::date >= selected_week+7 then
      perform private.raise_mutation_error('validation_failed','Choose days in this week');
    end if;
  end loop;
  if private.cooking_basis(gid,selected_week) is distinct from p_preview->>'basis' then
    perform private.raise_mutation_error('stale_version','Planning details changed. Refresh the preview.');
  end if;
  with active_plans as (
    select distinct on (user_id) row_id from public.meal_plans
    where calendar_active and week_of=selected_week and p_input->'memberIds' ? user_id::text
    order by user_id,version desc,row_id desc
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',pm.app_id,'memberId',pm.user_id,'date',pm.meal_date,'slot',pm.meal_slot,'label',pm.label,
    'servings',pm.servings,'status','kept','sortOrder',pm.sort_order,
    'mealId',m.app_id,'foodId',f.app_id,'source',pm.source,
    'expectedCalories',pm.expected_calories,'expectedProteinG',pm.expected_protein_g,
    'expectedCarbsG',pm.expected_carbs_g,'expectedFatG',pm.expected_fat_g,
    'image',case when m.image->>'kind' in ('asset','url') or m.owner_user_id=p_actor then m.image else null end
  )) order by pm.meal_date,pm.sort_order,pm.row_id),'[]'::jsonb) into kept
  from public.planned_meals pm join active_plans ap on ap.row_id=pm.meal_plan_row_id
  left join public.meals m on m.row_id=pm.meal_row_id
  left join public.foods f on f.row_id=pm.food_row_id
  where not pm.skipped and p_input->'selectedDates' ? pm.meal_date::text
    and not exists(select 1 from jsonb_array_elements(p_preview->'replacements') r
      where r->>'memberId'=pm.user_id::text and r->>'id'=pm.app_id);

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',a->>'id','memberId',a->>'memberId','date',a->>'date','slot',a->>'slot',
    'label',m.name,'mealId',m.app_id,'servings',(a->>'servings')::numeric,'status','new',
    'source',metadata->>'source','expectedCalories',metadata->'expectedCalories',
    'expectedProteinG',metadata->'expectedProteinG','expectedCarbsG',metadata->'expectedCarbsG',
    'expectedFatG',metadata->'expectedFatG',
    'image',case when m.image->>'kind' in ('asset','url') or m.owner_user_id=p_actor then m.image else null end
  ))),'[]'::jsonb) into added
  from jsonb_array_elements(p_preview->'assignments') a
  join public.meals m on m.app_id=a->>'recipeId' and (m.is_system or exists(
    select 1 from public.cooking_group_members gm where gm.group_id=gid and gm.user_id=m.owner_user_id))
  cross join lateral (select private.normalize_planned_meal_record(
    jsonb_build_object('mealId',m.app_id,'servings',(a->>'servings')::numeric),coalesce(m.owner_user_id,p_actor)) metadata) n
  where p_input->'memberIds' ? (a->>'memberId') and p_input->'selectedDates' ? (a->>'date');
  return kept || added;
end;
$$;
revoke all on function private.cooking_resulting_meals(uuid,jsonb,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.store_group_planning_preview(p_actor uuid, p_input jsonb, p_preview jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare gid uuid:=private.cooking_group_for(p_actor); saved private.cooking_previews; member uuid; reviews jsonb:='{}'::jsonb;
begin
 if (select auth.role()) is distinct from 'service_role' then perform private.raise_mutation_error('not_authenticated','Server planning only'); end if;
 if gid is null or gid::text is distinct from p_input->>'groupId' then perform private.raise_mutation_error('not_found','Group not found'); end if;
 perform private.lock_cooking_group(gid);
 if private.cooking_basis(gid,(p_input->>'weekOf')::date) is distinct from p_preview->>'basis' then perform private.raise_mutation_error('stale_version','Planning details changed. Refresh the preview.'); end if;
 delete from private.cooking_previews where expires_at<now();
 saved.id:=gen_random_uuid();
 p_preview:=jsonb_set(p_preview,'{assignments}',(select coalesce(jsonb_agg(a||jsonb_build_object('id',(a->>'id')||'-'||saved.id::text)),'[]'::jsonb) from jsonb_array_elements(p_preview->'assignments') a));
 for member in select jsonb_array_elements_text(p_input->'memberIds')::uuid loop
   reviews:=reviews||jsonb_build_object(member::text,private.planning_preference_review(member,p_input,p_preview));
 end loop;
 if not (p_input->'memberIds' ? p_actor::text) then reviews:=reviews||jsonb_build_object(p_actor::text,private.planning_preference_review(p_actor,p_input,p_preview)); end if;
 p_preview:=p_preview||jsonb_build_object('memberReviews',reviews);
 insert into private.cooking_previews(id,group_id,created_by,week_of,request,basis,preview) values(saved.id,gid,p_actor,(p_input->>'weekOf')::date,p_input,p_preview->>'basis',p_preview) returning * into saved;
 return (p_preview-'memberReviews')||jsonb_build_object('preferenceReview',reviews->p_actor::text,'id',saved.id,'expiresAt',saved.expires_at,'resultingMeals',private.cooking_resulting_meals(p_actor,p_input,p_preview));
end;
$function$
;

revoke all on function public.store_group_planning_preview(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.store_group_planning_preview(uuid,jsonb,jsonb) to service_role;
