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

async function loaderOnlyProgress(row: Locator, message: string) {
  const status = row.locator('[role="status"].sr-only');
  await expect(status).toHaveText(message);
  expect(await status.evaluate(element => {
    const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
    return bounds.width <= 1 && bounds.height <= 1 && style.position === "absolute" && style.overflow === "hidden";
  })).toBe(true);
  await expect(row.locator("p").filter({ hasText: /^(Saving changes|Removing |Discarding quantity draft|Updating shopping status)/ })).toHaveCount(0);
}

async function toggleLoaderGeometry(row: Locator) {
  const loader = row.locator("[data-grocery-toggle-loader]");
  await expect(loader).toBeVisible();
  const bounds = (await row.boundingBox())!, spinner = (await loader.boundingBox())!;
  expect(spinner.width).toBe(16); expect(spinner.height).toBe(16);
  expect(spinner.x + spinner.width).toBeCloseTo(bounds.x + bounds.width - 6, 0);
  expect(spinner.y).toBeCloseTo(bounds.y + 6, 0);
  expect(spinner.x).toBeGreaterThanOrEqual(bounds.x); expect(spinner.x + spinner.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  expect(spinner.y).toBeGreaterThanOrEqual(bounds.y); expect(spinner.y + spinner.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  const category = await row.evaluate(element => {
    const bounds = element.parentElement!.parentElement!.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
  });
  expect(spinner.x).toBeGreaterThanOrEqual(category.left); expect(spinner.x + spinner.width).toBeLessThanOrEqual(category.right);
  expect(spinner.y).toBeGreaterThanOrEqual(category.top); expect(spinner.y + spinner.height).toBeLessThanOrEqual(category.bottom);
  // Check actual action icons as well as text and fields in adjacent rows.
  for (const control of await row.locator("..").locator("..").locator("button svg, input, select, p, h3").all()) {
    const box = await control.boundingBox();
    if (box) expect(box.x + box.width <= spinner.x || box.x >= spinner.x + spinner.width || box.y + box.height <= spinner.y || box.y >= spinner.y + spinner.height).toBe(true);
  }
}

async function groceryControlLayout(row: Locator) {
  return row.evaluate(element => {
    const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      width: round(bounds.width), height: round(bounds.height),
      leftPadding: style.paddingLeft, rightPadding: style.paddingRight,
      controls: [...element.querySelectorAll('button, input, select, [class*="tabular-nums"]')].map(control => {
        const box = control.getBoundingClientRect();
        return { x: round(box.x - bounds.x), y: round(box.y - bounds.y), width: round(box.width), height: round(box.height) };
      }),
    };
  });
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

test("grocery card checking and delete feedback preserve independent controls and failed drafts", async ({ browser }, info) => {
  test.setTimeout(240000);
  const account = await createLocalAccount("row-owner"), peerAccount = await createLocalAccount("row-peer");
  const owner = await onboard(account, "Row Alice"), peer = await onboard(peerAccount, "Row Bea");
  const weekOf = startOfWeek(todayKey(), 0);
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  const page = await context.newPage();
  try {
    for (const shared of [false, true]) {
      const scope = shared ? "shared" : "personal";
      if (shared) {
        const invite = await owner.group.command({ action: "invite", grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey: crypto.randomUUID() });
        const review = await peer.group.command({ action: "inspect-pin", pin: invite.pin! });
        await peer.group.command({ action: "join", grocerySharingAcknowledgment: "all-weeks-v1", pin: invite.pin!, groupRevision: review.group!.revision, idempotencyKey: crypto.randomUUID() });
      }
      const name = `Pork with an extraordinarily long grocery ingredient name ${scope}`;
      const normalName = `Pork normal delete ${scope}`, neighborName = `Pork neighbor ${scope}`;
      for (const itemName of [name, normalName, neighborName]) {
        if (shared) {
          const week = await owner.group.load(weekOf);
          await owner.group.command({ action: "grocery", groupId: week.group!.id, weekOf, revision: week.revision, operation: "add", name: itemName, quantity: 133, unit: "g", idempotencyKey: crypto.randomUUID() });
        } else {
          const current = nutritionWeekSnapshot((await owner.repository.load())!, await owner.repository.loadNutritionWeek(weekOf));
          await owner.repository.addCustomGrocery({ name: itemName, quantity: 133, unit: "g", currentSnapshot: { ...current, grocery: current.grocery ?? { id: `gl-${weekOf}`, weekOf, items: [] } }, idempotencyKey: crypto.randomUUID() });
        }
      }
      await page.goto("/grocery");
      const row = page.getByRole("listitem", { name, exact: true });
      const checkbox = row.getByRole("checkbox"), title = row.getByText(name, { exact: true });
      const edit = row.getByRole("button", { name: `Edit quantity for ${name}`, exact: true });
      const remove = row.getByRole("button", { name: `Remove ${name}`, exact: true });
      const input = row.getByRole("textbox", { name: `Quantity for ${name}`, exact: true });
      await expect(checkbox).toBeEnabled();

      const operations: string[] = [];
      let holdNext = false, failNext = false, release: (() => void) | undefined;
      const endpoint = shared ? "mutate_cooking_group_week" : "";
      const routePattern = /\/rest\/v1\/rpc\/(toggle_grocery_item|remove_grocery_item|set_grocery_quantity|mutate_cooking_group_week)$/;
      await page.route(routePattern, async route => {
        const rpc = new URL(route.request().url()).pathname.split("/").at(-1)!;
        const operation = shared && rpc === endpoint ? route.request().postDataJSON().p_payload.operation : rpc === "toggle_grocery_item" ? "toggle" : rpc === "remove_grocery_item" ? "remove" : rpc === "set_grocery_quantity" ? "quantity" : "other";
        if (!["toggle", "remove", "quantity"].includes(operation)) return route.continue();
        operations.push(operation);
        const fail = failNext; failNext = false;
        if (holdNext) {
          holdNext = false;
          await new Promise<void>(resolve => { release = resolve; });
          release = undefined;
        }
        if (fail) return route.fulfill({ status: 503, json: { code: "PGRST000", message: "Grocery test unavailable. Retry." } });
        await route.continue();
      });

      // The name and a delayed second click submit only one toggle.
      const idleBounds = (await row.boundingBox())!;
      const idleLayout = await groceryControlLayout(row);
      holdNext = true;
      await title.click();
      await expect(checkbox).toBeDisabled();
      await expect(checkbox).toHaveAttribute("aria-busy", "true");
      await loaderOnlyProgress(row, `Updating shopping status for ${name}…`);
      const pendingBounds = (await row.boundingBox())!;
      expect(pendingBounds.width).toBe(idleBounds.width); expect(pendingBounds.height).toBe(idleBounds.height);
      expect(await groceryControlLayout(row)).toEqual(idleLayout);
      await expect(page.locator("[data-grocery-toggle-loader]")).toHaveCount(1);
      const pendingLayouts: Array<{ percent: number; width: number; layout: Awaited<ReturnType<typeof groceryControlLayout>> }> = [];
      for (const percent of [100, 200]) {
        const style = await page.addStyleTag({ content: `html {font-size:${percent}% !important}` });
        for (const width of [393, 412, 428, 1440]) {
          await page.setViewportSize({ width, height: 930 });
          await toggleLoaderGeometry(row);
          const layout = await groceryControlLayout(row);
          expect(layout.leftPadding).toBe(layout.rightPadding);
          const rightmost = Math.max(...layout.controls.map(control => control.x + control.width));
          expect(layout.width - rightmost).toBeCloseTo(parseFloat(layout.rightPadding), 0);
          pendingLayouts.push({ percent, width, layout });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        }
        await style.evaluate(element => (element as HTMLStyleElement).remove());
      }
      await page.setViewportSize({ width: info.project.name === "mobile" ? 393 : 1440, height: 930 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(await row.locator("[data-grocery-toggle-loader] svg").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
      await row.evaluate(element => element.scrollIntoView({ block: "center" }));
      await page.screenshot({ path: `output/grocery-toggle-loader-${scope}-${info.project.name}.png` });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(remove).toHaveAttribute("aria-busy", "false");
      await expect(remove.locator(".lucide-loader-circle")).toHaveCount(0);
      await title.dispatchEvent("click");
      expect(operations).toEqual(["toggle"]);
      release!();
      await expect(checkbox).toBeChecked(); await expect(checkbox).toBeEnabled();
      await expect(row.locator("[data-grocery-toggle-loader]")).toHaveCount(0);
      await expect(checkbox).toHaveAttribute("aria-busy", "false");
      for (const percent of [100, 200]) {
        const style = await page.addStyleTag({ content: `html {font-size:${percent}% !important}` });
        for (const saved of pendingLayouts.filter(layout => layout.percent === percent)) {
          await page.setViewportSize({ width: saved.width, height: 930 });
          expect(await groceryControlLayout(row)).toEqual(saved.layout);
        }
        await style.evaluate(element => (element as HTMLStyleElement).remove());
      }
      await page.setViewportSize({ width: info.project.name === "mobile" ? 393 : 1440, height: 930 });

      // Displayed quantity, padding, checkbox label, and keyboard remain single actions.
      holdNext = true;
      await row.getByText("133", { exact: true }).click();
      await toggleLoaderGeometry(row);
      release!();
      await expect(checkbox).not.toBeChecked(); await expect(checkbox).toBeEnabled();
      await row.click({ position: { x: (await row.boundingBox())!.width / 2, y: 3 } });
      await expect(checkbox).toBeChecked(); await expect(checkbox).toBeEnabled();
      await checkbox.locator("..").click({ position: { x: 3, y: 3 } });
      await expect(checkbox).not.toBeChecked(); await expect(checkbox).toBeEnabled();
      await checkbox.focus(); await checkbox.press("Space");
      await expect(checkbox).toBeChecked(); await expect(checkbox).toBeEnabled();
      expect(operations).toHaveLength(5);

      // Selecting text does not mutate the item; a failed toggle keeps saved state.
      await title.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); });
      await title.dispatchEvent("click");
      expect(operations).toHaveLength(5);
      await page.evaluate(() => window.getSelection()?.removeAllRanges());
      failNext = true; holdNext = true;
      await title.click();
      await toggleLoaderGeometry(row);
      release!();
      await expect(page.getByText("Grocery test unavailable. Retry.", { exact: true }).first()).toBeVisible();
      await expect(checkbox).toBeChecked(); await expect(checkbox).toBeEnabled();
      await expect(row.locator("[data-grocery-toggle-loader]")).toHaveCount(0);
      await page.reload();
      await expect(checkbox).toBeChecked(); await expect(checkbox).toBeEnabled();

      await edit.click(); await expect(input).toBeFocused();
      await input.fill("141.5");
      await title.click();
      await row.click({ position: { x: (await row.boundingBox())!.width / 2, y: 3 } });
      await row.getByRole("button", { name: `Increase ${name}`, exact: true }).click();
      await row.getByRole("combobox", { name: "Category", exact: true }).selectOption("Pantry");
      await expect(input).toHaveValue("142.5");
      expect(operations.filter(operation => operation === "toggle")).toHaveLength(6);
      // The checkbox still works while editing. Return to the latest revision afterward.
      const editingLayout = await groceryControlLayout(row);
      holdNext = true;
      await checkbox.click(); await toggleLoaderGeometry(row);
      expect(await groceryControlLayout(row)).toEqual(editingLayout);
      release!();
      await expect(checkbox).not.toBeChecked(); await expect(checkbox).toBeEnabled();
      await expect(input).toHaveValue("142.5");
      // Hold a read transaction so cancellation must wait for local draft cleanup.
      await page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("calicoach-drafts", 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction("drafts", "readonly");
        let held = true;
        const read = () => { transaction.objectStore("drafts").get("loader-test").onsuccess = () => { if (held) read(); }; };
        read();
        (window as typeof window & { releaseGroceryDraftTest: () => void }).releaseGroceryDraftTest = () => { held = false; database.close(); };
      });
      const cancel = row.getByRole("button", { name: `Cancel quantity edit for ${name}`, exact: true });
      await cancel.click();
      await expect(cancel).toHaveAttribute("aria-busy", "true");
      await expect(cancel.locator(".lucide-loader-circle")).toBeVisible();
      await expect(row.locator("[data-grocery-toggle-loader]")).toHaveCount(0);
      await loaderOnlyProgress(row, "Discarding quantity draft…");
      await page.evaluate(() => (window as typeof window & { releaseGroceryDraftTest: () => void }).releaseGroceryDraftTest());
      await expect(edit).toBeFocused();
      await edit.click(); await input.fill("135");
      const save = row.getByRole("button", { name: `Save quantity for ${name}`, exact: true });
      holdNext = true; failNext = true;
      await save.click();
      await expect(save).toHaveAttribute("aria-busy", "true");
      await expect(save.locator(".lucide-loader-circle")).toBeVisible();
      await expect(row.locator("[data-grocery-toggle-loader]")).toHaveCount(0);
      await loaderOnlyProgress(row, "Saving changes…");
      release!();
      const retry = row.getByRole("button", { name: `Retry saving ${name}`, exact: true });
      await expect(retry).toBeEnabled(); await expect(retry).toHaveAttribute("aria-busy", "false");
      await expect(retry.locator(".lucide-loader-circle")).toHaveCount(0);
      await expect(input).toHaveValue("135");
      await retry.click();
      await expect(edit).toBeFocused(); await expect(checkbox).not.toBeChecked();
      expect(operations.filter(operation => operation === "toggle")).toHaveLength(7);
      await edit.click(); await input.fill("142.5");

      // Both layouts wrap at enlarged text without adding keyboard stops to the row.
      for (const percent of [100, 200]) {
        const style = await page.addStyleTag({ content: `html {font-size:${percent}% !important}` });
        for (const width of [393, 412, 428, 1440]) {
          await page.setViewportSize({ width, height: 930 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
          expect(await row.getAttribute("role")).toBeNull(); expect(await row.getAttribute("tabindex")).toBeNull();
          for (const control of [edit, remove, checkbox.locator("..")]) {
            if (await control.isVisible()) { const bounds = (await control.boundingBox())!; expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44); }
          }
        }
        await style.evaluate(element => (element as HTMLStyleElement).remove());
      }
      await page.setViewportSize({ width: info.project.name === "mobile" ? 393 : 1440, height: 930 });

      // Deleting from an editor keeps the draft on failure, then succeeds on retry.
      const before = (await remove.boundingBox())!;
      holdNext = true; failNext = true;
      await remove.click();
      await expect(remove).toHaveAttribute("aria-busy", "true"); await expect(remove).toBeDisabled();
      await loaderOnlyProgress(row, `Removing ${name}…`);
      await expect(row.locator("[data-grocery-toggle-loader]")).toHaveCount(0);
      await expect(input).toBeDisabled();
      const after = (await remove.boundingBox())!;
      expect(after.width).toBe(before.width); expect(after.height).toBe(before.height);
      await remove.dispatchEvent("click"); await title.dispatchEvent("click");
      expect(operations.filter(operation => operation === "remove")).toHaveLength(1);
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(await remove.locator(".lucide-loader-circle").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
      await row.screenshot({ path: `output/grocery-row-delete-${scope}-${info.project.name}.png` });
      release!();
      await expect(remove).toHaveAttribute("aria-busy", "false"); await expect(remove).toBeEnabled();
      await expect(row.getByRole("alert")).toContainText("Grocery test unavailable");
      await expect(input).toHaveValue("142.5");
      await expect(remove.locator(".lucide-trash")).toHaveCount(1);
      await remove.click(); await expect(row).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Edit quantity for ${normalName}`, exact: true })).toBeFocused();

      // Normal-mode Delete has the same busy/failure behavior and focus destination.
      const normal = page.getByRole("listitem", { name: normalName, exact: true });
      const normalRemove = normal.getByRole("button", { name: `Remove ${normalName}`, exact: true });
      holdNext = true; failNext = true;
      await normalRemove.click();
      await expect(normalRemove).toHaveAttribute("aria-busy", "true");
      await loaderOnlyProgress(normal, `Removing ${normalName}…`);
      release!();
      await expect(normalRemove).toBeEnabled(); await expect(normalRemove).toHaveAttribute("aria-busy", "false");
      await expect(normal.getByRole("checkbox")).not.toBeChecked();
      await normalRemove.click(); await expect(normal).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Edit quantity for ${neighborName}`, exact: true })).toBeFocused();
      await page.unroute(routePattern);
      await page.emulateMedia({ reducedMotion: "no-preference" });
    }
  } finally { await context.close(); await deleteLocalAccount(account); await deleteLocalAccount(peerAccount); }
});
