import { createSignedInSession, runRpcSmoke } from "./supabase-rpc-smoke-runner.mjs";
import { readRemoteTestEnv, remoteAccountCredentials } from "./remote-test-env.mjs";

const PROJECT_REF = "ifunkhvbvkdxolhpxjvk";
const EXPECTED_URL = `https://${PROJECT_REF}.supabase.co`;

const clientEnv = readRemoteTestEnv();
const remoteUrl = clientEnv.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (process.env.SUPABASE_RPC_REMOTE_CONFIRM !== PROJECT_REF) {
  throw new Error(
    `Refusing remote RPC smoke tests: set SUPABASE_RPC_REMOTE_CONFIRM=${PROJECT_REF} for this exact project.`
  );
}

if (remoteUrl !== EXPECTED_URL) {
  throw new Error(`Refusing remote RPC smoke tests: .env.local must target ${EXPECTED_URL}.`);
}

if (!publishableKey) {
  throw new Error("Remote RPC smoke requires NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.");
}

const normalizedKey = publishableKey.toLowerCase();
if (normalizedKey.includes("service_role") || normalizedKey.startsWith("sb_secret_")) {
  throw new Error("Refusing remote RPC smoke tests with a service or secret key.");
}

const credentials = {
  ...remoteAccountCredentials(clientEnv),
};

for (const [label, value] of Object.entries(credentials)) {
  if (!value.email || !value.password) {
    throw new Error(
      `Remote RPC smoke requires confirmed disposable User ${label.toUpperCase()} credentials in the current process environment.`
    );
  }
}

runRpcSmoke({
  url: remoteUrl,
  key: publishableKey,
  createSession: (label, url, key) =>
    createSignedInSession(label, url, key, credentials[label]),
  label: "remote",
}).catch((error) => {
  console.error(`Supabase remote RPC smoke failed: ${error.message}`);
  process.exitCode = 1;
});
