/**
 * Full local restart: stop whatever is listening on PORT, rebuild dist, serve it.
 *   npm run serve:restart
 * PORT defaults to 4173.
 */
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4173;

function listeners(port) {
  try {
    const out = execSync(`lsof -nP -tiTCP:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out
      ? out.split(/\n/).map((line) => Number(line.trim())).filter((pid) => pid && pid !== process.pid)
      : [];
  } catch {
    return [];
  }
}

function stopListeners() {
  const pids = listeners(PORT);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Stopped process ${pid} on port ${PORT}`);
    } catch (err) {
      console.warn(`Could not stop process ${pid}: ${err instanceof Error ? err.message : err}`);
    }
  }
  const deadline = Date.now() + 3000;
  while (listeners(PORT).length && Date.now() < deadline) {
    execSync('sleep 0.1');
  }
  for (const pid of listeners(PORT)) {
    try {
      process.kill(pid, 'SIGKILL');
      console.log(`Killed process ${pid} on port ${PORT}`);
    } catch {
      /* already gone */
    }
  }
}

stopListeners();
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

const child = spawn(process.execPath, ['scripts/serve.js'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, PORT: String(PORT) },
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
