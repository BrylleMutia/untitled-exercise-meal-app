import { execFileSync } from "node:child_process";
import { createLocalSession, runRpcSmoke } from "./supabase-rpc-smoke-runner.mjs";

const LOCAL_URL = "http://127.0.0.1:56321";
const configuredUrl = process.env.SUPABASE_LOCAL_URL ?? LOCAL_URL;

if (configuredUrl !== LOCAL_URL) {
  throw new Error(
    `Refusing RPC smoke tests: SUPABASE_LOCAL_URL must be exactly ${LOCAL_URL}. ` +
      "This runner never falls back to NEXT_PUBLIC_SUPABASE_URL."
  );
}

function localKey() {
  const configuredKey =
    process.env.SUPABASE_LOCAL_PUBLISHABLE_KEY ??
    process.env.SUPABASE_LOCAL_ANON_KEY;
  if (configuredKey) return configuredKey;

  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npx";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx --yes supabase@latest status"]
      : ["--yes", "supabase@latest", "status"];
  let output;
  try {
    output = execFileSync(command, commandArgs, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error(
      "Set SUPABASE_LOCAL_PUBLISHABLE_KEY (or SUPABASE_LOCAL_ANON_KEY), " +
        "or start Supabase and make its local status available."
    );
  }

  const match =
    output.match(/"(?:ANON_KEY|SUPABASE_ANON_KEY)"\s*:\s*"([^"]+)"/) ??
    output.match(/^(?:ANON_KEY|SUPABASE_ANON_KEY)=(?:"([^"]+)"|'([^']+)'|([^\r\n]+))/m) ??
    output.match(/"PUBLISHABLE_KEY"\s*:\s*"([^"]+)"/) ??
    output.match(/^PUBLISHABLE_KEY=(?:"([^"]+)"|'([^']+)'|([^\r\n]+))/m);
  const key = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!key) {
    throw new Error(
      "Local Supabase status did not expose an anon/publishable key. " +
        "Set SUPABASE_LOCAL_PUBLISHABLE_KEY explicitly."
    );
  }
  return key.trim();
}

runRpcSmoke({
  url: LOCAL_URL,
  key: localKey(),
  createSession: createLocalSession,
  label: "local",
}).catch((error) => {
  console.error(`Supabase local RPC smoke failed: ${error.message}`);
  process.exitCode = 1;
});
