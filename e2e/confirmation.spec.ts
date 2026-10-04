import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const mailpit = "http://127.0.0.1:56324";
test.use({ navigationTimeout: 60_000 });
const deliveredExpect = expect.configure({ timeout: 30_000 });
test.setTimeout(180_000);
type Message = { ID: string; To: Array<{ Address: string }> };
async function messages(email: string): Promise<Message[]> {
  const response = await fetch(`${mailpit}/api/v1/messages`);
  if (!response.ok) throw new Error("Local mail inbox is unavailable");
  const data = await response.json() as { messages: Message[] };
  return data.messages.filter((message) => message.To.some((recipient) => recipient.Address === email));
}

test("signup resend delivers real mail and the confirmation link works in a fresh browser", async ({ page, browser }) => {
  if (process.env.LOCAL_EMAIL_CONFIRMATION !== "1" || process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:56321" || !process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY) throw new Error("Run npm run test:email:local against the disposable local stack.");
  const email = `confirmation-${randomUUID()}@example.test`;
  const password = `Local-${randomUUID()}-Pass!`;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let userId: string | undefined;
  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" });
  try {
    await page.goto("/auth/sign-up");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await deliveredExpect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await deliveredExpect.poll(async () => (await messages(email)).length).toBe(1);
    const users = await admin.auth.admin.listUsers();
    userId = users.data.users.find((user) => user.email === email)?.id;
    expect(userId).toBeTruthy();
    // Delivery is checked through Mailpit, never a mocked resend response.
    await page.getByLabel("Signup email").fill(email);
    await page.getByRole("button", { name: "Resend confirmation", exact: true }).click();
    await deliveredExpect(page.getByText("If this account needs confirmation, a new link is on its way.")).toBeVisible();
    await deliveredExpect.poll(async () => (await messages(email)).length).toBe(2);
    const latest = (await messages(email))[0];
    const delivered = await (await fetch(`${mailpit}/api/v1/message/${latest.ID}`)).json() as { HTML: string };
    const match = delivered.HTML.match(/href="([^"]*token_hash[^"]*)"/);
    expect(Boolean(match)).toBe(true);
    const link = match![1].replaceAll("&amp;", "&");
    expect(new URL(link).origin).toBe("http://localhost:3000");
    const confirmation = await fresh.newPage();
    await confirmation.goto(link);
    await expect(confirmation).toHaveURL(/\/onboarding$/);
    await expect(confirmation.getByText(/Onboarding · step 1 of 5/)).toBeVisible();
    expect((await admin.auth.admin.getUserById(userId!)).data.user?.email_confirmed_at).toBeTruthy();
    await confirmation.goto(link);
    await expect(confirmation.getByRole("heading", { name: "That link is no longer valid" })).toBeVisible();
    await confirmation.goto("/auth/confirm?token_hash=invalid&type=email&next=//example.com");
    await expect(confirmation.getByRole("heading", { name: "That link is no longer valid" })).toBeVisible();
    expect(new URL(confirmation.url()).origin).toBe("http://localhost:3000");
  } finally {
    await fresh.close();
    userId ??= (await admin.auth.admin.listUsers()).data.users.find((user) => user.email === email)?.id;
    if (userId) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) throw new Error("Local confirmation account cleanup failed");
    }
  }
});
