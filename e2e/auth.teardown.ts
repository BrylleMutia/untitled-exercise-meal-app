import { test as teardown } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { deleteLocalAccount, type LocalAccount } from "./local-account";

const authDirectory = path.resolve("playwright/.auth");
const accountsFile = path.join(authDirectory, "test-accounts.json");

function isLocalAccount(value: unknown): value is LocalAccount {
  return value !== null && typeof value === "object"
    && "email" in value && typeof value.email === "string"
    && "password" in value && typeof value.password === "string";
}

teardown("delete fresh local authenticated fixtures", async () => {
  const parsed: unknown = JSON.parse(await fs.readFile(accountsFile, "utf8"));
  if (!Array.isArray(parsed) || parsed.length !== 2 || !parsed.every(isLocalAccount)) {
    throw new Error("The authenticated fixture manifest is missing or invalid; refusing to pass cleanup without two accounts.");
  }
  const accounts = parsed as LocalAccount[];

  const failures: unknown[] = [];
  for (const account of accounts.reverse()) {
    try {
      await deleteLocalAccount(account);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "One or more Playwright local accounts could not be deleted.");
  await Promise.all([
    fs.rm(accountsFile, { force: true }),
    fs.rm(path.join(authDirectory, "user-a.json"), { force: true }),
    fs.rm(path.join(authDirectory, "user-b.json"), { force: true }),
  ]);
});
