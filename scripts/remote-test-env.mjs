import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedNames = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "USER_A_EMAIL",
  "USER_A_PASSWORD",
  "USER_B_EMAIL",
  "USER_B_PASSWORD",
  "SUPABASE_RPC_REMOTE_USER_A_EMAIL",
  "SUPABASE_RPC_REMOTE_USER_A_PASSWORD",
  "SUPABASE_RPC_REMOTE_USER_B_EMAIL",
  "SUPABASE_RPC_REMOTE_USER_B_PASSWORD",
]);

function parseValue(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function readRemoteTestEnv() {
  const values = {};
  const files = [".env.rc3.local", ".env.local"];
  for (const file of files) {
    let source;
    try {
      source = readFileSync(path.join(root, file), "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw new Error(`Could not read ${file} for guarded remote verification.`);
    }

    for (const line of source.split(/\r?\n/u)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|:)\s*(.*?)\s*$/u);
      if (match && allowedNames.has(match[1]) && values[match[1]] === undefined) {
        values[match[1]] = parseValue(match[2]);
      }
    }
  }

  for (const name of allowedNames) {
    if (process.env[name] !== undefined) values[name] = process.env[name];
  }
  return values;
}

export function remoteAccountCredentials(values) {
  return {
    a: {
      email: values.SUPABASE_RPC_REMOTE_USER_A_EMAIL ?? values.USER_A_EMAIL,
      password: values.SUPABASE_RPC_REMOTE_USER_A_PASSWORD ?? values.USER_A_PASSWORD,
    },
    b: {
      email: values.SUPABASE_RPC_REMOTE_USER_B_EMAIL ?? values.USER_B_EMAIL,
      password: values.SUPABASE_RPC_REMOTE_USER_B_PASSWORD ?? values.USER_B_PASSWORD,
    },
  };
}
