import { test, expect, type Page, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createLocalAccount, createAuthenticatedContext, deleteLocalAccount, type LocalAccount } from "./local-account";
import { createSupabaseRepository } from "../src/services/supabaseRepository";
import { cookingGroupRepository } from "../src/services/cookingGroupRepository";
import { nutritionWeekSnapshot } from "../src/utility/nutritionWeek";
import { startOfWeek, todayKey } from "../src/utility/dates";
import type { Database } from "../src/types/database.generated";
import type { UserProfile } from "../src/types/domain";

async function onboard(account: LocalAccount, name: string) {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword(account);
  if (login.error || !login.data.user) throw login.error;
  const repository = createSupabaseRepository(client);
  const profile: UserProfile = { id:login.data.user.id,name,age:30,sex:"female",heightCm:165,weightKg:65,units:"metric",weekStartsOn:0,experience:"beginner",equipment:["none"],daysPerWeek:3,sessionMinutes:30,goal:"maintain",dietaryPattern:"No restrictions",allergies:[],notificationsEnabled:false,targetEligibility:"eligible",createdAt:new Date().toISOString() };
  await repository.completeOnboarding({ profile, currentSnapshot:(await repository.load())!, idempotencyKey:crypto.randomUUID() });
  return { repository, group:cookingGroupRepository(client) };
}

async function geometry(page: Page, input: Locator) {
  const result = await input.evaluate(element => {
    const input = element as HTMLInputElement;
    const white = input.parentElement!.parentElement!.parentElement!;
    const buttons = [...white.querySelectorAll("button")].map(button => button.getBoundingClientRect());
    const bounds = white.getBoundingClientRect(), number = input.getBoundingClientRect();
    const description = document.getElementById(input.getAttribute("aria-describedby")!.split(" ")[0])!;
    const unit = (description.classList.contains("sr-only") ? description.nextElementSibling! : description).getBoundingClientRect();
    return {
      inside:buttons.every(button => button.left >= bounds.left-1 && button.right <= bounds.right+1 && button.top >= bounds.top-1 && button.bottom <= bounds.bottom+1),
      targets:buttons.every(button => button.width >= 44 && button.height >= 44),
      right:unit.left >= bounds.right-1,
      aligned:Math.abs(unit.top + unit.height/2 - number.top - number.height/2) <= 1,
      overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth,
      bounds:{numberTop:number.top,numberHeight:number.height,unitTop:unit.top,unitHeight:unit.height,width:document.documentElement.clientWidth,font:getComputedStyle(document.documentElement).fontSize},
    };
  });
  if (!result.aligned || result.overflow) console.log("Quantity geometry",JSON.stringify(result));
  expect(result).toMatchObject({inside:true,targets:true,right:true,aligned:true,overflow:false});
  for (const button of await page.getByRole("button").all()) {
    if (await button.isVisible() && /Save quantity|Cancel quantity|Remove Stepper/.test(await button.getAttribute("aria-label") ?? "")) {
      const bounds = await button.boundingBox(); expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
  }
}

test("inset grocery steppers preserve drafts, units, validation and shared retries", async ({browser}, info) => {
  test.setTimeout(240000);
  const account=await createLocalAccount("quantity-owner"), peerAccount=await createLocalAccount("quantity-peer");
  const owner=await onboard(account,"Quantity Alice"), peer=await onboard(peerAccount,"Quantity Bea");
  const weekOf=startOfWeek(todayKey(),0), name="Stepper extraordinarilylongingredientnamethatmustwrap rice";
  const current=nutritionWeekSnapshot((await owner.repository.load())!,await owner.repository.loadNutritionWeek(weekOf));
  await owner.repository.addCustomGrocery({name,quantity:2.5,unit:"pcs",currentSnapshot:{...current,grocery:current.grocery??{id:`gl-${weekOf}`,weekOf,items:[]}},idempotencyKey:crypto.randomUUID()});
  const context=await createAuthenticatedContext(browser,process.env.PLAYWRIGHT_BASE_URL!,account),page=await context.newPage();
  try {
    await page.goto("/grocery");
    const row=page.getByRole("listitem",{name,exact:true}), input=row.getByRole("textbox",{name:`Quantity for ${name}`,exact:true});
    await expect(row.getByRole("button",{name:`Increase ${name}`,exact:true})).toHaveCount(0);
    await row.getByRole("button",{name:`Edit quantity for ${name}`,exact:true}).click();
    await expect(input).toBeFocused();
    await row.getByRole("button",{name:`Decrease ${name}`,exact:true}).click();
    await expect(input).toHaveValue("1.5");
    expect((await owner.repository.loadNutritionWeek(weekOf)).grocery!.items.find(item=>item.name===name)!.quantity).toBe(2.5);
    await input.fill("1.1"); await row.getByRole("button",{name:`Increase ${name}`,exact:true}).click(); await expect(input).toHaveValue("2.1");
    await input.fill("");
    await expect(row.getByRole("button",{name:`Increase ${name}`,exact:true})).toBeDisabled();
    await expect(row.getByRole("button",{name:`Save quantity for ${name}`,exact:true})).toBeDisabled();
    await input.fill("0"); await expect(row.getByRole("button",{name:`Decrease ${name}`,exact:true})).toBeDisabled();
    await input.fill("1000000"); await expect(row.getByRole("button",{name:`Increase ${name}`,exact:true})).toBeDisabled();
    await input.fill("2.1");
    for (const size of [100,200]) {
      const style=await page.addStyleTag({content:`html {font-size:${size}% !important}`});
      for (const width of [320,385,445,640,1440]) { await page.setViewportSize({width,height:930}); await geometry(page,input); }
      await style.evaluate(element=>(element as HTMLStyleElement).remove());
    }
    await page.setViewportSize({width:445,height:930});
    await row.screenshot({path:`output/grocery-quantity-personal-${info.project.name}.png`});
    await input.press("Enter");
    await expect(row.getByRole("button",{name:`Edit quantity for ${name}`,exact:true})).toBeFocused();
    expect((await owner.repository.loadNutritionWeek(weekOf)).grocery!.items.find(item=>item.name===name)!.quantity).toBe(2.1);

    const extra=page.getByRole("textbox",{name:"Quantity",exact:true});
    await page.getByRole("combobox",{name:"Extra grocery item name",exact:true}).fill("Stepper added");
    await expect(page.getByRole("button",{name:"Decrease extra item quantity",exact:true})).toBeDisabled();
    await page.getByRole("button",{name:"Increase extra item quantity",exact:true}).click(); await expect(extra).toHaveValue("2");
    await expect(page.getByRole("listitem",{name:"Stepper added",exact:true})).toHaveCount(0);
    await extra.fill("0.5"); await expect(page.getByRole("button",{name:"Add custom grocery item",exact:true})).toBeDisabled();
    await extra.fill("1.5");
    for (const size of [100,200]) {
      const style=await page.addStyleTag({content:`html {font-size:${size}% !important}`});
      for (const width of [320,385,445,640,1440]) {await page.setViewportSize({width,height:930});await geometry(page,extra);}
      await style.evaluate(element=>(element as HTMLStyleElement).remove());
    }
    await page.getByRole("button",{name:"Add custom grocery item",exact:true}).click();
    await expect(page.getByRole("listitem",{name:"Stepper added",exact:true})).toBeVisible();

    const invite=await owner.group.command({action:"invite",grocerySharingAcknowledgment:"all-weeks-v1",idempotencyKey:crypto.randomUUID()});
    const review=await peer.group.command({action:"inspect-pin",pin:invite.pin!});
    await peer.group.command({action:"join",grocerySharingAcknowledgment:"all-weeks-v1",pin:invite.pin!,groupRevision:review.group!.revision,idempotencyKey:crypto.randomUUID()});
    await page.reload();
    await expect(row).toBeVisible();
    await row.getByRole("button",{name:`Edit quantity for ${name}`,exact:true}).click();
    await input.fill("3.25");
    await page.reload();
    await expect(input).toHaveValue("3.25");
    await expect(row.getByText("Quantity draft restored. Review before saving.",{exact:true})).toBeVisible();
    await input.press("Escape");
    await expect(row.getByRole("button",{name:`Edit quantity for ${name}`,exact:true})).toBeFocused();
    await row.getByRole("button",{name:`Edit quantity for ${name}`,exact:true}).click(); await input.fill("3.25");
    let fail=true; const keys:string[]=[];
    await page.route("**/rest/v1/rpc/mutate_cooking_group_week",async route=>{
      const payload=route.request().postDataJSON().p_payload;
      if(payload.operation==="quantity") {keys.push(payload.idempotencyKey); if(fail){fail=false;return route.fulfill({status:503,json:{code:"PGRST000",message:"Quantity save unavailable. Retry."}});} }
      await route.continue();
    });
    await row.getByRole("button",{name:`Save quantity for ${name}`,exact:true}).click();
    await expect(input).toHaveValue("3.25");
    await row.getByRole("button",{name:`Retry saving ${name}`,exact:true}).click();
    await expect(row.getByRole("button",{name:`Edit quantity for ${name}`,exact:true})).toBeFocused();
    expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
    const saved=await peer.group.load(weekOf); expect(saved.grocery!.items.find(item=>item.name===name)!.quantity).toBe(3.25);

    await row.getByRole("button",{name:`Edit quantity for ${name}`,exact:true}).click(); await input.fill("4.5");
    await peer.group.command({action:"grocery",groupId:saved.group!.id,weekOf,revision:saved.revision,operation:"add",name:"Concurrent extra",quantity:1,unit:"pcs",idempotencyKey:crypto.randomUUID()});
    await page.reload();
    await expect(row.getByRole("button",{name:"Review latest quantity",exact:true})).toBeVisible();
    await expect(input).toHaveValue("4.5");
    await row.getByRole("button",{name:"Review latest quantity",exact:true}).click();
    await row.getByRole("button",{name:`Save quantity for ${name}`,exact:true}).click();
    await expect(row.getByRole("button",{name:`Edit quantity for ${name}`,exact:true})).toBeFocused();
    await row.getByRole("button",{name:`Edit quantity for ${name}`,exact:true}).click();
    for (const size of [100,200]) {
      const style=await page.addStyleTag({content:`html {font-size:${size}% !important}`});
      for (const width of [320,385,445,640,1440]) { await page.setViewportSize({width,height:930}); await geometry(page,input); }
      await style.evaluate(element=>(element as HTMLStyleElement).remove());
    }
    await page.setViewportSize({width:445,height:930});
    await row.screenshot({path:`output/grocery-quantity-shared-${info.project.name}.png`});
    await input.press("Escape");
    await page.getByRole("combobox",{name:"Extra grocery item",exact:true}).fill("Zero shared extra");
    const sharedExtra=page.getByRole("textbox",{name:"Extra item quantity",exact:true});
    await sharedExtra.fill("0");
    for (const size of [100,200]) {
      const style=await page.addStyleTag({content:`html {font-size:${size}% !important}`});
      for (const width of [320,385,445,640,1440]) {await page.setViewportSize({width,height:930});await geometry(page,sharedExtra);}
      await style.evaluate(element=>(element as HTMLStyleElement).remove());
    }
    await expect(page.getByRole("button",{name:"Decrease extra item quantity",exact:true})).toBeDisabled();
    await page.getByRole("button",{name:"Add extra item",exact:true}).click();
    await expect(page.getByRole("listitem",{name:"Zero shared extra",exact:true})).toBeVisible();
    expect((await peer.group.load(weekOf)).grocery!.items.find(item=>item.name==="Zero shared extra")!.quantity).toBe(0);
  } finally {await context.close();await deleteLocalAccount(account);await deleteLocalAccount(peerAccount);}
});
