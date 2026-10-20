import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { planCookingGroup, type PlanningContext, type PlanningRequest } from "../_shared/cookingGroupPlanner.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Cache-Control": "private, no-store" };
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return Response.json({ message: "Use POST." }, { status: 405, headers });
  const bearer = request.headers.get("authorization") ?? "";
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false } });
  const { data: auth, error: authError } = await client.auth.getUser(bearer.replace(/^Bearer /i, ""));
  if (authError || !auth.user) return Response.json({ message: "Sign in to generate a group preview." }, { status: 401, headers });
  try {
    if (Number(request.headers.get("content-length")) > 524288) throw new Error("Planning request is too large.");
    const body = await request.text(); if (body.length > 524288) throw new Error("Planning request is too large.");
    const input = JSON.parse(body) as PlanningRequest & { groupId: string };
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    // This helper verifies membership again; the actor is derived exclusively from the verified token.
    const context = await service.rpc("get_group_planning_context", { p_actor: auth.user.id, p_input: input });
    if (context.error) throw new Error(context.error.message);
    const preview = planCookingGroup(context.data as PlanningContext, input);
    const saved = await service.rpc("store_group_planning_preview", { p_actor: auth.user.id, p_input: input, p_preview: preview });
    if (saved.error) throw new Error(saved.error.message);
    return Response.json(saved.data, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview unavailable. Your choices are retained.";
    return Response.json({ message }, { status: 409, headers });
  }
});
