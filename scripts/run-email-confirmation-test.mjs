import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'supabase/config.toml');
const cli = path.join(root, 'node_modules/supabase/dist/supabase.js');
const original = readFileSync(configPath, 'utf8');
const startArgs = ['start', '--exclude', 'realtime,storage-api,imgproxy,studio,postgres-meta,edge-runtime,logflare,vector'];
function cliCommand(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
  if (result.status !== 0) throw new Error(`Local Supabase ${args[0]} failed; no credentials or mail tokens were printed.`);
  return result.stdout;
}
function localStatus() {
  const status = JSON.parse(cliCommand(['status', '--output', 'json']));
  if (status.API_URL !== 'http://127.0.0.1:56321') throw new Error('Email tests require the disposable local Supabase project.');
  return status;
}
localStatus();
const enabled = original.replace(/(\[auth\.email\][\s\S]*?enable_confirmations\s*=\s*)false/, '$1true');
if (enabled === original) throw new Error('Expected the normal local stack to have email auto-confirmation enabled.');
try {
  writeFileSync(configPath, enabled);
  process.stdout.write('Restarting the local stack with signup confirmation required.\n');
  cliCommand(['stop']);
  cliCommand(startArgs);
  const status = localStatus();
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--project=confirmation'], {
    cwd: root, windowsHide: true, stdio: 'inherit',
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000', PLAYWRIGHT_LOCAL_TEST: '1', LOCAL_EMAIL_CONFIRMATION: '1',
      SUPABASE_LOCAL_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  writeFileSync(configPath, original);
  process.stdout.write('Restoring the normal local auth configuration.\n');
  cliCommand(['stop']);
  cliCommand(startArgs);
}
