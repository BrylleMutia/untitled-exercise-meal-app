import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createLocalAccount, createAuthenticatedContext, deleteLocalAccount, type LocalAccount } from "./local-account";
import { createSupabaseRepository } from "../src/services/supabaseRepository";
import { cookingGroupRepository } from "../src/services/cookingGroupRepository";
import { nutritionWeekSnapshot } from "../src/utility/nutritionWeek";
import { addDays, startOfWeek, todayKey } from "../src/utility/dates";
import type { Database } from "../src/types/database.generated";
import type { UserProfile } from "../src/types/domain";

async function onboard(account: LocalAccount, name: string) {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
  const login = await client.auth.signInWithPassword(account);
  if (login.error || !login.data.user) throw login.error;
  const repository = createSupabaseRepository(client);
  const profile: UserProfile = { id:login.data.user.id,name,age:30,sex:"female",heightCm:165,weightKg:65,units:"metric",weekStartsOn:0,experience:"beginner",equipment:["none"],daysPerWeek:3,sessionMinutes:30,goal:"maintain",dietaryPattern:"No restrictions",allergies:[],notificationsEnabled:false,targetEligibility:"eligible",createdAt:new Date().toISOString() };
  await repository.completeOnboarding({profile,currentSnapshot:(await repository.load())!,idempotencyKey:crypto.randomUUID()});
  return {repository,group:cookingGroupRepository(client),id:profile.id};
}

test("one grocery list shares owner history once, retains drafts, and recovers a lost transfer response",async ({browser},info) => {
  test.setTimeout(240000);
  const a=await createLocalAccount("unified-grocery-a"),b=await createLocalAccount("unified-grocery-b");
  const owner=await onboard(a,"Grocery Alice"),member=await onboard(b,"Grocery Bea");
  const current=startOfWeek(todayKey(),0),past=addDays(current,-7);
  for (const weekOf of [past,current]) {
    const snapshot=nutritionWeekSnapshot((await owner.repository.load())!,await owner.repository.loadNutritionWeek(weekOf));
    await owner.repository.addCustomGrocery({name:weekOf===current?"Extra rice":"Previous groceries",quantity:2,unit:"kg",currentSnapshot:{...snapshot,grocery:snapshot.grocery??{id:`gl-${weekOf}`,weekOf,items:[]}},idempotencyKey:crypto.randomUUID()});
  }
  const snapshot=nutritionWeekSnapshot((await owner.repository.load())!,await owner.repository.loadNutritionWeek(current));
  await owner.repository.setGroceryTotalAmount({weekOf:current,totalAmountCentavos:125050,calendarRevision:snapshot.profile!.calendarRevision!,expectedVersions:{groceryRevision:snapshot.grocery!.revision},currentSnapshot:snapshot,idempotencyKey:crypto.randomUUID()});
  const invite=await owner.group.command({action:"invite",grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey:crypto.randomUUID()});
  const review=await member.group.command({action:"inspect-pin",pin:invite.pin!});
  await member.group.command({action:"join",grocerySharingAcknowledgment: "all-weeks-v1", pin:invite.pin!,groupRevision:review.group!.revision,idempotencyKey:crypto.randomUUID()});
  let week=await member.group.load(current);
  await member.group.command({action:"grocery",groupId:week.group!.id,weekOf:current,revision:week.revision,operation:"add",name:"Extra rice",quantity:1,unit:"kg",idempotencyKey:crypto.randomUUID()});
  // A local-only fixture represents membership created before consent existed.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:56321" || !/^[a-f0-9-]{36}$/.test(owner.id)) throw Error("Local consent fixture required");
  execFileSync(process.execPath,[path.resolve("node_modules/supabase/dist/supabase.js"),"db","query","--local", "delete from private.grocery_sharing where user_id='"+owner.id+"'"],{windowsHide:true,stdio:"pipe"});
  const context=await createAuthenticatedContext(browser,process.env.PLAYWRIGHT_BASE_URL!,a),page=await context.newPage();
  try {
    await page.goto("/grocery");
    await expect(page.getByRole("region",{name:"Private extras — only you",exact:true})).toHaveCount(0);
    const consent=page.getByRole("dialog",{name:"Share groceries with your group",exact:true});
    await expect(consent).toBeVisible();
    await expect(consent.getByRole("checkbox")).toHaveCount(0);
    await expect(consent.getByRole("button",{name:"Share groceries",exact:true})).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(consent).toHaveCount(0);
    await expect(page.getByRole("heading",{name:"Grocery list",exact:true})).toBeFocused();
    await page.reload();
    await expect(page.getByRole("heading",{name:"Grocery list",exact:true})).toBeVisible();
    await expect(consent).toHaveCount(0);
    await page.goto("/settings");
    await page.getByRole("button",{name:"Enable grocery sharing",exact:true}).click();
    await expect(consent).toBeVisible();
    let dropped=false;
    await page.route("**/rest/v1/rpc/share_cooking_groceries",async route=>{
      const payload=route.request().postDataJSON();
      if (!dropped && payload.p_payload?.action==="transfer-grocery-week") { dropped=true; await route.fetch(); await route.abort("failed"); } else await route.continue();
    });
    await consent.getByRole("button",{name:"Share groceries",exact:true}).click();
    await expect(page.getByRole("button",{name:"Retry sharing groceries",exact:true})).toBeEnabled();
    await page.getByRole("button",{name:"Retry sharing groceries",exact:true}).click();
    await expect(page.getByLabel("Grocery transfer",{exact:true})).toHaveCount(0,{timeout:30000});
    await expect(page.getByRole("heading",{name:"Cooking group",exact:true})).toBeFocused();
    await page.goto("/grocery");
    expect(dropped).toBe(true);
    await expect(page.getByRole("listitem",{name:"Extra rice",exact:true})).toHaveCount(2);
    await expect(page.getByText("₱1,250.50",{exact:true})).toBeVisible();
    await expect(page.getByRole("group",{name:"Choose a grocery week",exact:true})).toHaveCount(1);
    week=await member.group.load(current);
    expect(week.grocery?.totalAmountCentavos).toBe(125050);
    expect(week.grocery?.items.filter(item=>item.name==="Extra rice")).toHaveLength(2);
    // Recover an existing personal draft without publishing it during transfer.
    await page.evaluate(({userId,weekOf})=>{
      const draft={schemaVersion:1,userId,draftType:`grocery-custom:${weekOf}`,payload:{name:"Recovered soap",quantity:"2",unit:"pcs"},baseVersions:{},updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};
      localStorage.setItem(`calicoach:draft:v1:${encodeURIComponent(userId)}:${encodeURIComponent(draft.draftType)}`,JSON.stringify(draft));
    },{userId:owner.id,weekOf:current});
    await page.reload();
    await page.getByRole("button",{name:"Review extra item draft",exact:true}).click();
    await expect(page.getByRole("textbox",{name:"Item",exact:true})).toHaveValue("Recovered soap");
    await page.getByRole("button",{name:"Save to shared list",exact:true}).click();
    await expect(page.getByRole("listitem",{name:"Recovered soap",exact:true})).toBeVisible();
    for (const width of [320,385,408,445,639,640,1440]) {
      await page.setViewportSize({width,height:930});
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    }
    await page.setViewportSize({width:445,height:930});
    await page.screenshot({path:`output/grocery-sharing-${info.project.name}.png`,fullPage:true});
    await page.addStyleTag({content:"html { font-size:200% !important; }"});
    await page.setViewportSize({width:320,height:930});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    await page.getByRole("button",{name:"Previous grocery week",exact:true}).click();
    await expect(page.getByRole("listitem",{name:"Previous groceries",exact:true})).toBeVisible();
  } finally { await context.close(); await deleteLocalAccount(a); await deleteLocalAccount(b); }
});


test("PIN generation and connection accept the concise grocery notice", async ({browser},info) => {
  test.setTimeout(180000);
  const a=await createLocalAccount("pin-grocery-a"), b=await createLocalAccount("pin-grocery-b");
  const owner=await onboard(a,"PIN Alice"), member=await onboard(b,"PIN Bea");
  const ca=await createAuthenticatedContext(browser,process.env.PLAYWRIGHT_BASE_URL!,a), cb=await createAuthenticatedContext(browser,process.env.PLAYWRIGHT_BASE_URL!,b);
  const pa=await ca.newPage(),pb=await cb.newPage();
  try {
    await pa.goto("/settings");
    await expect(pa.getByText(/Generating a PIN shares all your saved and future groceries/)).toBeVisible();
    await pa.getByRole("button",{name:"Generate PIN",exact:true}).click();
    const invitation=pa.getByRole("status").filter({hasText:"Your connection PIN"});
    await expect(invitation).toBeVisible();
    const pin=await invitation.locator("p").nth(1).innerText();
    await expect.poll(async()=> (await owner.group.load(startOfWeek(todayKey(),0))).grocerySharing?.status).toBe("enabled");
    await pb.goto("/settings");
    await pb.getByRole("textbox",{name:"Connection PIN",exact:true}).fill(pin);
    await pb.getByRole("button",{name:"Review connection",exact:true}).click();
    const review=pb.getByRole("dialog",{name:"Connect cooking accounts",exact:true});
    await expect(review.getByText(/This shares all your saved and future groceries/)).toBeVisible();
    await expect(review.getByText("PIN Alice",{exact:true})).toBeVisible();
    await review.getByRole("button",{name:"Cancel",exact:true}).click();
    expect((await member.group.load(startOfWeek(todayKey(),0))).group).toBeNull();
    await pb.getByRole("button",{name:"Review connection",exact:true}).click();
    for(const width of [320,445,640,1440]) {
      await pb.setViewportSize({width,height:930});
      await expect.poll(()=>pb.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    }
    await pb.setViewportSize({width:445,height:930});
    await pb.screenshot({path:"output/grocery-pin-notice-"+info.project.name+".png",fullPage:true});
    await pb.addStyleTag({content:"html {font-size:200% !important}"});
    await pb.setViewportSize({width:320,height:930});
    await expect.poll(()=>pb.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    const connect=review.getByRole("button",{name:"Connect and share",exact:true});
    const box=await connect.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);
    await connect.click();
    await expect(pb.getByRole("dialog",{name:"Accounts connected",exact:true})).toBeVisible();
    await expect.poll(async()=> (await member.group.load(startOfWeek(todayKey(),0))).grocerySharing?.status).toBe("enabled");
    await pb.getByRole("button",{name:"Done",exact:true}).click();
    await pb.goto("/grocery");
    await expect(pb.getByRole("heading",{name:"Grocery list",exact:true})).toBeVisible();
    await expect(pb.getByRole("dialog",{name:"Share groceries with your group",exact:true})).toHaveCount(0);
    await expect(pb.getByText("One grocery list for your group",{exact:true})).toHaveCount(0);
  } finally { await ca.close();await cb.close();await deleteLocalAccount(a);await deleteLocalAccount(b); }
});
