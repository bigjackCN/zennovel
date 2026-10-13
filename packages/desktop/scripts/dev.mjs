// Desktop development: the editor from Vite's dev server (instant reload)
// inside the Electron window. Run with `pnpm desktop:dev` from the repo root.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const port = 5174;
const shell = process.platform === 'win32';

const tsc = spawnSync('pnpm', ['build:main'], { cwd: desktop, stdio: 'inherit', shell });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

const vite = spawn('pnpm', ['--filter', '@zennovel/editor', 'exec', 'vite', '--port', String(port), '--strictPort'], {
  cwd: desktop,
  stdio: 'inherit',
  shell,
});
const url = `http://localhost:${port}/`;
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {
    // not up yet
  }
  await new Promise((r) => setTimeout(r, 200));
}

const electron = createRequire(import.meta.url)('electron');
const app = spawn(electron, ['.'], { cwd: desktop, stdio: 'inherit', env: { ...process.env, ZN_DEV_URL: url } });
app.on('exit', (code) => {
  vite.kill();
  process.exit(code ?? 0);
});
