import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const cli = path.resolve('node_modules/supabase/dist/supabase.js');
const status = spawnSync(process.execPath, [cli, 'status', '--output', 'json'], { encoding: 'utf8', windowsHide: true });
if (status.status !== 0) throw new Error('Start the local Supabase stack before running the demo.');
const config = JSON.parse(status.stdout);
if (config.API_URL !== 'http://127.0.0.1:56321') throw new Error('The demo requires the disposable local backend.');
const server = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'dev', '--port', '3000'], {
  windowsHide: true,
  stdio: 'inherit',
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: config.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.PUBLISHABLE_KEY ?? config.ANON_KEY, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' },
});
server.on('exit', code => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => server.kill('SIGINT'));
