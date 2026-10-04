import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chromium, expect as baseExpect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

const baseURL = 'http://localhost:3000';
const expect = baseExpect.configure({ timeout: 30_000 });
const output = path.resolve('test-results/demo');
await fs.mkdir(output, { recursive: true });
await fs.mkdir('playwright/.auth', { recursive: true });
const result = spawnSync(process.execPath, [path.resolve('node_modules/supabase/dist/supabase.js'), 'status', '--output', 'json'], { encoding: 'utf8', windowsHide: true });
if (result.status !== 0) throw new Error('Local Supabase is unavailable.');
const config = JSON.parse(result.stdout);
if (config.API_URL !== 'http://127.0.0.1:56321') throw new Error('Refusing to record against a shared backend.');
const key = config.PUBLISHABLE_KEY ?? config.ANON_KEY;
const client = createClient(config.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const accountPath = 'playwright/.auth/demo-account.json';
let account;
try {
  if (process.argv.includes('--fresh')) throw new Error('Create a new demo account.');
  account = JSON.parse(await fs.readFile(accountPath, 'utf8'));
}
catch { account = { email: `alex-demo-${randomUUID().slice(0,8)}@example.test`, password: 'Cali-Demo-Only-2026!' }; }
let login = await client.auth.signInWithPassword(account);
if (login.error) {
  const signup = await client.auth.signUp(account);
  if (signup.error) throw signup.error;
  login = await client.auth.signInWithPassword(account);
}
if (login.error || !login.data.session) throw login.error ?? new Error('No local demo session.');
await fs.writeFile(accountPath, JSON.stringify(account));
const jar = new Map();
const ssr = createBrowserClient(config.API_URL, key, { isSingleton: false, cookies: { getAll: () => [...jar].map(([name,value]) => ({name,value})), setAll: items => items.forEach(i => jar.set(i.name, i.value)) }, auth: { autoRefreshToken: false } });
await ssr.auth.setSession(login.data.session);
const cookies = [...jar].map(([name,value]) => ({ name, value, url: baseURL }));
const browser = await chromium.launch({ headless: true });
const manifestPath = path.join(output, 'chapters.json');
let manifest = [];
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch {}
const resume = Number(process.argv.find(a => a.startsWith('--resume='))?.split('=')[1] ?? 0);
const only = Number(process.argv.find(a => a.startsWith('--only='))?.split('=')[1] ?? 0);
const pause = (page, ms = 1300) => page.waitForTimeout(ms);
async function click(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await pause(page, 450);
  await locator.click();
  await pause(page);
}
async function fill(page, locator, value) { await locator.scrollIntoViewIfNeeded(); await locator.fill(value); await pause(page, 650); }
async function scroll(page, y) { await page.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), y); await pause(page, 1600); }
let sceneNumber = 0;
async function scene(title, caption, route, action, { mobile = false, minimum = 12, anonymous = false } = {}) {
  const index = ++sceneNumber;
  if (index < resume || (only && index !== only)) return;
  const id = String(index).padStart(2, '0');
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 810 };
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', recordVideo: { dir: path.join(output, 'raw'), size: viewport } });
  if (!anonymous) await context.addCookies(cookies);
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal{display:none!important}';
      document.head.append(style);
      const dot = document.createElement('div');
      Object.assign(dot.style, { position: 'fixed', zIndex: '2147483647', width: '20px', height: '20px', border: '2px solid #7862ac', borderRadius: '50%', background: '#b4a1df44', pointerEvents: 'none', transform: 'translate(-50%,-50%)', display: 'none' });
      document.body.append(dot);
      document.addEventListener('mousemove', e => { dot.style.display = 'block'; dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; });
    });
  });
  const createdAt = Date.now();
  const page = await context.newPage();
  page.setDefaultTimeout(40_000);
  page.setDefaultNavigationTimeout(90_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let start = 0, duration = 0;
  console.log(`Recording ${id}: ${title}`);
  try {
    await page.goto(baseURL + route, { waitUntil: 'networkidle' });
    await expect(page.getByText('Loading your account…', { exact: true })).toBeHidden();
    await pause(page, 1800);
    start = (Date.now() - createdAt) / 1000;
    await action(page);
    duration = (Date.now() - createdAt) / 1000 - start;
    await pause(page, Math.max(3500, (minimum - duration) * 1000));
    duration = (Date.now() - createdAt) / 1000 - start;
    await page.mouse.move(20, 20);
    await page.screenshot({ path: path.join(output, `${id}.png`) });
    if (errors.length) throw new Error(errors.join('\n'));
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${id}-error.png`), fullPage: true });
    await fs.writeFile(path.join(output, `${id}-error.txt`), await page.locator('body').innerText());
    throw error;
  } finally { await context.close(); }
  const raw = path.join(output, `raw/${id}.webm`);
  await page.video().saveAs(raw);
  const chapter = { index, title, caption, raw, start: Math.max(0, start - 0.15), duration, mobile };
  manifest = [...manifest.filter(c => c.index !== index), chapter].sort((a,b) => a.index-b.index);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

try {
  if (process.argv.includes('--probe')) {
    const context = await browser.newContext({ viewport: { width:1440,height:810 } });
    await context.addCookies(cookies);
    const page = await context.newPage();
    await page.goto(baseURL + '/onboarding', { waitUntil: 'networkidle', timeout: 90_000 });
    await page.screenshot({ path: path.join(output, 'probe.png') });
    console.log((await page.locator('body').innerText()).slice(0,5000));
    await context.close();
  } else {
    await scene('A plan that starts with you', 'Set your basics, movement, food preferences and goal in five simple steps.', '/onboarding', async page => {
      await fill(page, page.getByLabel('What should we call you?'), 'Alex');
      await fill(page, page.getByLabel('Age', { exact: true }), '30');
      await click(page, page.getByText('None of the situations below apply to me', { exact: true }));
      await fill(page, page.getByLabel('Height (cm)'), '168');
      await fill(page, page.getByLabel('Weight (kg)'), '68');
      await click(page, page.getByRole('button', { name: /Continue/ }));
      await page.getByLabel('Days per week').selectOption('3');
      await page.getByLabel('Typical duration').selectOption('30');
      await pause(page, 2500);
      await click(page, page.getByRole('button', { name: /Continue/ }));
      await page.getByLabel('Eating style').selectOption('Keto-style');
      await pause(page, 2500);
      await page.getByLabel('Eating style').selectOption('Low-carb');
      await page.getByLabel('Meal cost preference').selectOption('7');
      await pause(page, 3000);
      await click(page, page.getByRole('button', { name: /Continue/ }));
      await click(page, page.getByText('Maintain weight', { exact: true }));
      await click(page, page.getByRole('button', { name: /Continue/ }));
      await pause(page, 3500);
      await click(page, page.getByRole('button', { name: 'Create my plan', exact: true }));
      await expect(page.getByRole('heading', { name: 'Hello, Alex!' })).toBeVisible();
    });
    await scene('Your day, at a glance', 'See your food budget, today’s plan and quick actions in one calm dashboard.', '/', async page => { await pause(page,3000); await scroll(page,500); await scroll(page,0); });
    await scene('Meal planning with choice', 'Low-carb plans use a 130 g total-carb limit. Open slots stay clearly unresolved.', '/nutrition', async page => { await scroll(page,300); await pause(page,4000); await scroll(page,650); });
    await scene('Log what you actually ate', 'Search foods, check the source and serving size, then confirm before saving.', '/nutrition', async page => {
      await click(page, page.getByRole('heading', { name:'Breakfast',exact:true }).locator('..').getByRole('button',{name:'Add',exact:true}));
      await fill(page, page.getByRole('textbox',{name:'Search for a food or describe a meal'}),'egg');
      await click(page, page.getByRole('button',{name:/^Egg/}).first());
      await expect(page.getByRole('group',{name:'Review food quantity'})).toBeVisible();
      await pause(page,3500);
      await click(page,page.getByRole('button',{name:'Confirm food',exact:true}));
      await scroll(page,0);
    });
    await scene('A clearer calorie budget', 'The ring reduces as food is logged. Estimates and incomplete logging remain visible.', '/', async page => { await pause(page,4000); await scroll(page,320); await scroll(page,0); });
    await scene('Save meals you enjoy', 'Create reusable recipes from catalog ingredients without rewriting previous food logs.', '/nutrition', async page => {
      const card = page.getByRole('heading',{name:'Saved meals',exact:true}).locator('..').locator('..');
      await click(page,card.getByRole('button',{name:'Create',exact:true}));
      await fill(page,page.getByLabel('Recipe name'),'Easy breakfast bowl');
      await page.getByLabel('Ingredient 1', {exact:true}).selectOption('food-greek-yogurt');
      await click(page,page.getByRole('button',{name:'Ingredient',exact:true}));
      await page.getByLabel('Ingredient 2',{exact:true}).selectOption('food-mvp3-170567');
      await fill(page,page.getByLabel('Ingredient 2 quantity',{exact:true}),'0.25');
      await pause(page,2500);
      await click(page,page.getByRole('button',{name:'Save recipe',exact:true}));
      const recipe=page.locator('li').filter({hasText:'Easy breakfast bowl'});
      await expect(recipe).toBeVisible();
      await click(page,recipe.getByRole('button',{name:'Log it',exact:true}));
      await pause(page,2000);
    });
    await scene('Move in ways that fit your day', 'Log daily steps and optional walking minutes. Walking energy stays a separate estimate.', '/activity', async page => {
      await fill(page,page.getByLabel('Steps',{exact:true}),'6500');
      await fill(page,page.getByLabel('Walking minutes (optional)'),'35');
      await click(page,page.getByRole('button',{name:'Save steps',exact:true}));
      await expect(page.getByRole('heading',{name:'6,500 steps saved'})).toBeVisible();
    });
    await scene('An editable weekly workout plan', 'Your plan respects equipment, experience, available days and session length.', '/workouts', async page => {
      await scroll(page,400);
      await click(page,page.getByRole('button',{name:/^Edit /}).first());
      await fill(page,page.getByRole('textbox',{name:'Sets'}).first(),'3');
      await click(page,page.getByRole('button',{name:'Save',exact:true}).first());
      await scroll(page,550);
    });
    await scene('Guidance while you train', 'Follow exercise guides, record effort and keep planned work separate from actual work.', '/workouts', async page => {
      await click(page,page.locator('a[href^="/workouts/session/"]').first());
      await expect(page.getByRole('group',{name:'Rate of perceived exertion'})).toBeVisible();
      await pause(page,4000);
      for (let step=0;step<24;step++) {
        const saved = page.waitForResponse(r=>r.url().includes('/rpc/save_workout_session') && r.request().method()==='POST');
        await click(page,page.getByRole('group',{name:'Rate of perceived exertion'}).getByRole('button',{name:'5',exact:true}));
        if (!(await saved).ok()) throw new Error('Workout effort did not save.');
        const finish = page.getByRole('button',{name:/Finish/});
        if (await finish.isVisible()) { await click(page,finish); await expect(page).toHaveURL(/\/workouts$/); break; }
        await click(page,page.getByRole('button',{name:'Next exercise',exact:true}));
      }
    });
    await scene('Choose Pilates foundations', 'Switch to gentle mat practice. Earlier sessions keep the plan you followed.', '/workouts', async page => {
      await page.getByLabel('Workout program').selectOption('pilates');
      await pause(page,1600);
      await click(page,page.getByRole('button',{name:'Save program choice',exact:true}));
      await expect(page.getByRole('heading',{name:/Pilates foundations/}).first()).toBeVisible();
      await scroll(page,550);
    });
    await scene('Make a routine your own', 'Build reusable workouts with guided catalog exercises or familiar named movements.', '/workouts/custom', async page => {
      await click(page,page.getByRole('button',{name:'Create a routine',exact:true}));
      await fill(page,page.getByLabel('Routine name'),'Evening mobility');
      await fill(page,page.getByLabel('Movement name',{exact:true}),'Gentle reach');
      await click(page,page.getByRole('button',{name:'Add movement',exact:true}));
      await click(page,page.getByRole('button',{name:'Save routine',exact:true}));
      await expect(page.getByText(/Version 1 ·/)).toBeVisible();
    });
    await scene('Pause, finish and preserve history', 'Record actual work and notes. Editing a routine creates a new version for future sessions.', '/workouts/custom', async page => {
      await click(page,page.getByRole('button',{name:'Start routine',exact:true}));
      await expect(page.getByRole('heading',{name:/· In progress/})).toBeVisible();
      await click(page,page.getByRole('button',{name:'Mark complete',exact:true}));
      await fill(page,page.getByLabel('Note (optional)'),'Comfortable evening practice');
      await click(page,page.getByRole('button',{name:'Save progress & pause'}));
      await expect(page.getByRole('heading',{name:/· Paused/})).toBeVisible();
      await click(page,page.getByRole('button',{name:'Resume',exact:true}));
      await click(page,page.getByRole('button',{name:'Finish workout',exact:true}));
      await expect(page.getByRole('region',{name:'Custom workout history'})).toContainText('completed');
      await click(page,page.getByRole('button',{name:'Edit routine',exact:true}));
      await fill(page,page.getByLabel('Reps',{exact:true}),'8');
      await click(page,page.getByRole('button',{name:'Save routine',exact:true}));
      await click(page,page.getByText('Planned and recorded work',{exact:true}));
    });
    await scene('From meal plan to shopping list', 'Adjust quantities, check off groceries and add your own extras.', '/grocery', async page => {
      await fill(page,page.getByRole('textbox',{name:'Extra grocery item name'}),'Fresh strawberries');
      await click(page,page.getByRole('button',{name:'Add custom grocery item',exact:true}));
      await expect(page.getByLabel('Mark Fresh strawberries as done',{exact:true})).toBeAttached();
      await click(page,page.getByRole('button',{name:'Increase Fresh strawberries',exact:true}));
      await click(page,page.getByLabel('Mark Fresh strawberries as done',{exact:true}));
      await scroll(page,600);
    });
    if (resume <= 14 && (!only || only === 14)) {
      const dateKey = day => `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
      for (let i=6;i>=1;i--) {
        const day=new Date();day.setDate(day.getDate()-i);
        const saved=await client.rpc('save_weight_entry',{p_payload:{entry:{id:`demo-weight-${i}`,date:dateKey(day),weightKg:[68.1,68.0,68.2,68.0,67.9,68.0][6-i]},idempotencyKey:`demo-weight-${i}`}});
        if(saved.error) throw saved.error;
      }
    }
    await scene('Progress without pressure', 'Review your observations and activity history. Rest days and unlogged meals are clearly labeled.', '/progress', async page => { await pause(page,4000); await scroll(page,480); });
    await scene('Small milestones, on your terms', 'Optional celebrations recognize saved firsts and participation without penalizing missed days.', '/settings', async page => {
      const toggle=page.getByRole('switch',{name:/Milestones/});
      if(await toggle.getAttribute('aria-checked')==='false') await click(page,toggle);
      await fill(page,page.getByLabel('New weight entry'),'68');
      await click(page,page.getByRole('button',{name:/^Log \(/}));
      await page.goto(baseURL+'/',{waitUntil:'networkidle'});
      await scroll(page,300);
    });
    await scene('Your information stays in your control', 'Choose metric or imperial units and export your saved information as JSON or CSV.', '/settings', async page => {
      await scroll(page,700);
      const downloaded=page.waitForEvent('download');
      await click(page,page.getByRole('button',{name:'Export JSON',exact:true}));
      const download=await downloaded;
      await download.saveAs(path.join(output,'demo-account-export.json'));
      await pause(page,3000);
    });
    await scene('Made for everyday use on mobile', 'Quick actions, readable cards and reachable controls carry the same plan into your day.', '/', async page => {
      await scroll(page,400); await scroll(page,900); await scroll(page,0);
      await click(page,page.getByRole('link',{name:'Nutrition',exact:true}).first());
      await scroll(page,500);
    }, {mobile:true,minimum:18});
    await scene('Your saved plan stays with you', 'Sign in from a fresh browser and return to your saved plan, food logs and activity.', '/auth/sign-in', async page => {
      await fill(page,page.getByRole('textbox',{name:'Email address'}),account.email);
      await fill(page,page.getByLabel('Password',{exact:true}),account.password);
      await click(page,page.getByRole('button',{name:'Sign in',exact:true}));
      await expect(page.getByRole('heading',{name:'Hello, Alex!'})).toBeVisible();
      await pause(page,4000);
    }, {anonymous:true,minimum:14});
    console.log('Recorded all chapters successfully. Demo account remains available locally.');
  }
} finally { await browser.close(); }
