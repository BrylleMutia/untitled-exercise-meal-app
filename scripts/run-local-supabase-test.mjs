import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localUrl = "http://127.0.0.1:56321";
const mode = process.argv[2];
const extraArgs = process.argv.slice(3);

if (mode !== "repository" && mode !== "browser") {
  throw new Error("Expected either the repository or browser test mode.");
}

function localSupabaseConfig() {
  const cli = path.join(root, "node_modules", "supabase", "dist", "supabase.js");
  if (!existsSync(cli)) throw new Error("Install dependencies before running the local Supabase gate.");
  const result = spawnSync(process.execPath, [cli, "status", "--output", "json"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error("Local Supabase is unavailable. Start the local stack before running this gate.");
  }

  let status;
  try {
    status = JSON.parse(result.stdout);
  } catch {
    throw new Error("The pinned local Supabase CLI did not return its expected status data.");
  }
  const url = status.API_URL ?? status.api_url;
  const key = status.PUBLISHABLE_KEY ?? status.publishable_key ?? status.ANON_KEY ?? status.anon_key;
  if (url !== localUrl || typeof key !== "string" || key.length < 20) {
    throw new Error(`Refusing to run the release tests unless Supabase is local at ${localUrl}.`);
  }
  return { url, key };
}

const config = localSupabaseConfig();
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: config.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.key,
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  PLAYWRIGHT_LOCAL_TEST: "1",
};
const requestedProjects = extraArgs.filter((argument) => argument.startsWith("--project="));
const forwardedArgs = extraArgs.filter((argument) => !argument.startsWith("--project="));
const selectedProjects = requestedProjects.length ? requestedProjects : ["--project=desktop", "--project=mobile"];
const command = mode === "repository"
  ? [path.join(root, "node_modules", "vitest", "vitest.mjs"), "run", "--config", "vitest.integration.config.ts", ...forwardedArgs]
  : [path.join(root, "node_modules", "@playwright", "test", "cli.js"), "test", ...selectedProjects, ...forwardedArgs];

if (!existsSync(command[0])) throw new Error("Required local test runner is not installed.");
const result = spawnSync(process.execPath, command, {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
