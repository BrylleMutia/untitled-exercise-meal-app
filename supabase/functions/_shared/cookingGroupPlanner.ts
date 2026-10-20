// No framework imports: the same deterministic allocator runs in Edge and tests.
export type Slot = "breakfast" | "lunch" | "dinner" | "snack";
export type PlannerRecipe = { id: string; name: string; revision: number; yield: number; calories: number; carbs: number; slots: Slot[]; image?: unknown };
export type PlannerAssignment = { id: string; memberId: string; recipeId: string; recipeRevision?: number; date: string; slot: Slot; servings: number; skipped?: boolean; protected?: boolean };
export type PlannerMember = { id: string; allowed: string[]; days: Array<{ date: string; calories: number; remainingCalories: number; remainingCarbs: number | null; eligible: boolean }>; occupied: Array<{ id: string; date: string; slot: Slot; name: string; protected: boolean; calories: number; carbs: number }> };
export type PlanningContext = { basis: string; recipes: PlannerRecipe[]; members: PlannerMember[]; retained: PlannerAssignment[] };
export type PlanningRequest = { weekOf: string; memberIds: string[]; selectedDates: string[]; mode: "fill" | "replace"; recipes: Array<{ id: string; revision: number; maxBatches: number }>; seed: string; overrides: Record<string, number> };
const slots: Slot[] = ["breakfast", "lunch", "dinner", "snack"];
const shares = { breakfast: .25, lunch: .30, dinner: .30, snack: .15 };
const nutrientCost = (perServing: number, servings: number) => Math.ceil(perServing * servings * 100 - 1e-7) / 100;
function rank(seed: string, key: string) { let h = 2166136261; for (const c of seed + key) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function dates(week: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error("Choose a valid week.");
  const d = new Date(`${week}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== week) throw new Error("Choose a valid week.");
  return Array.from({ length: 7 }, (_, i) => new Date(d.getTime() + i * 86400000).toISOString().slice(0, 10));
}
export function planCookingGroup(context: PlanningContext, input: PlanningRequest) {
  const week = dates(input.weekOf);
  if (!input.memberIds.length || input.memberIds.length > 6 || new Set(input.memberIds).size !== input.memberIds.length || input.memberIds.some(id => !context.members.some(m => m.id === id))) throw new Error("Choose current group members.");
  if (!input.selectedDates.length || new Set(input.selectedDates).size !== input.selectedDates.length || input.selectedDates.some(d => !week.includes(d))) throw new Error("Choose unique days in this week.");
  if (!["fill", "replace"].includes(input.mode) || !input.seed || input.seed.length > 128 || !input.recipes.length || input.recipes.length > 1000 || new Set(input.recipes.map(r => r.id)).size !== input.recipes.length) throw new Error("Review the planning choices.");
  const recipes = input.recipes.map(r => {
    const recipe = context.recipes.find(c => c.id === r.id && c.revision === r.revision);
    if (!recipe || !Number.isInteger(r.maxBatches) || r.maxBatches < 1 || r.maxBatches > 100 || !Number.isFinite(recipe.yield) || recipe.yield < 1 || !Number.isFinite(recipe.calories) || recipe.calories <= 0) throw new Error("Refresh recipes and review batch counts.");
    return { ...recipe, capacity: r.maxBatches * recipe.yield };
  });
  const replacements = input.mode === "replace" ? context.members.filter(m => input.memberIds.includes(m.id)).flatMap(m => m.occupied.filter(o => input.selectedDates.includes(o.date) && !o.protected).map(o => ({ memberId: m.id, date: o.date, slot: o.slot, name: o.name, id: o.id }))) : [];
  const removed = new Set(replacements.map(r => `${r.memberId}:${r.id}`));
  const retained = context.retained.filter(a => !removed.has(`${a.memberId}:${a.id}`));
  const used = new Map<string, number>();
  const recipeKey = (id: string, revision: number) => `${id}:${revision}`;
  for (const a of retained) if (!a.skipped) { const key = recipeKey(a.recipeId, a.recipeRevision ?? context.recipes.find(r => r.id === a.recipeId)?.revision ?? 1); used.set(key, (used.get(key) ?? 0) + a.servings); }
  const budgets = new Map<string, { calories: number; carbs: number | null }>();
  for (const m of context.members) for (const day of m.days) {
    const released = m.occupied.filter(o => o.date === day.date && removed.has(`${m.id}:${o.id}`));
    budgets.set(`${m.id}:${day.date}`, { calories: day.remainingCalories + released.reduce((n, o) => n + o.calories, 0), carbs: day.remainingCarbs === null ? null : day.remainingCarbs + released.reduce((n, o) => n + o.carbs, 0) });
  }
  const assignments: PlannerAssignment[] = [];
  const warnings: string[] = [];
  for (const date of [...input.selectedDates].sort()) for (const slot of slots) {
    const people = context.members.filter(m => input.memberIds.includes(m.id) && !m.occupied.some(o => o.date === date && o.slot === slot && !removed.has(`${m.id}:${o.id}`)));
    if (!people.length) continue;
    const candidates = [...recipes].sort((a, b) => rank(input.seed, date + slot + a.id) - rank(input.seed, date + slot + b.id));
    let chosen: Array<{ member: PlannerMember; servings: number }> = []; let recipe = candidates[0];
    for (const candidate of candidates) {
      if (!candidate.slots.includes(slot)) continue;
      let available = candidate.capacity - (used.get(recipeKey(candidate.id, candidate.revision)) ?? 0);
      const portions = people.flatMap(member => {
        const day = member.days.find(d => d.date === date); const budget = budgets.get(`${member.id}:${date}`)!;
        if (!day?.eligible || !member.allowed.includes(candidate.id)) return [];
        const key = `${member.id}:${date}:${slot}`; const explicit = input.overrides[key];
        if (explicit !== undefined && (!Number.isFinite(explicit) || explicit < .25 || explicit > 4 || explicit * 4 !== Math.round(explicit * 4))) throw new Error("Portions must be quarter servings between 0.25 and 4.");
        const suggested = Math.min(4, Math.max(.25, Math.round(day.calories * shares[slot] / candidate.calories * 4) / 4));
        let servings = explicit ?? suggested;
        if (explicit === undefined) servings = Math.floor(Math.min(servings, budget.calories / candidate.calories, budget.carbs === null || candidate.carbs === 0 ? Infinity : budget.carbs / candidate.carbs, available) * 4 + 1e-7) / 4;
        if (servings < .25 || servings > available + 1e-7 || nutrientCost(candidate.calories, servings) > budget.calories + 1e-7 || budget.carbs !== null && nutrientCost(candidate.carbs, servings) > budget.carbs + 1e-7) return [];
        available -= servings; return [{ member, servings }];
      });
      if (portions.length > chosen.length) { chosen = portions; recipe = candidate; }
      if (chosen.length === people.length) break;
    }
    for (const { member, servings } of chosen) {
      const budget = budgets.get(`${member.id}:${date}`)!;
      budget.calories -= nutrientCost(recipe.calories, servings); if (budget.carbs !== null) budget.carbs -= nutrientCost(recipe.carbs, servings);
      const key = recipeKey(recipe.id, recipe.revision);
      used.set(key, (used.get(key) ?? 0) + servings);
      assignments.push({ id: `gp-${rank(input.seed, member.id + date + slot)}-${date}-${slot}`, memberId: member.id, recipeId: recipe.id, recipeRevision: recipe.revision, date, slot, servings });
    }
    if (chosen.length !== people.length) warnings.push(`${date} · ${slot}: some members have no eligible assignment within their available portions and planning limits.`);
  }
  const batches = context.recipes.flatMap(r => {
    const portions = used.get(recipeKey(r.id, r.revision)) ?? 0; if (!portions) return [];
    const batches = Math.ceil((portions - 1e-8) / r.yield);
    return [{ recipeId: r.id, recipeRevision: r.revision, name: r.name, yield: r.yield, portions, batches, leftovers: Math.round((batches * r.yield - portions) * 100) / 100, ...(r.image ? { image: r.image } : {}) }];
  });
  if (!assignments.length) warnings.push("No meals fit these people, days, recipes, and available planning limits.");
  return { assignments, batches, replacements, warnings, basis: context.basis };
}
