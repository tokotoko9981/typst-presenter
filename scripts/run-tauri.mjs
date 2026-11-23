import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function ensureCargoInPath() {
  const cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo');
  const cargoBinDir = path.join(cargoHome, 'bin');
  if (!existsSync(cargoBinDir)) {
    return;
  }

  const currentPath = process.env.PATH || '';
  const delimiter = path.delimiter;
  const entries = currentPath.split(delimiter).filter(Boolean);
  const alreadyPresent =
    process.platform === 'win32'
      ? entries.some((p) => p.toLowerCase() === cargoBinDir.toLowerCase())
      : entries.includes(cargoBinDir);

  if (!alreadyPresent) {
    process.env.PATH = currentPath ? `${cargoBinDir}${delimiter}${currentPath}` : cargoBinDir;
  }
}

function resolveDevPort() {
  try {
    const confPath = path.join(projectRoot, 'src-tauri', 'tauri.conf.json');
    const conf = JSON.parse(readFileSync(confPath, 'utf8'));
    const devUrl = conf?.build?.devUrl;
    if (typeof devUrl === 'string' && devUrl.trim()) {
      const parsed = new URL(devUrl);
      if (parsed.port) {
        return Number.parseInt(parsed.port, 10);
      }
      return parsed.protocol === 'https:' ? 443 : 80;
    }
  } catch {
    // Fall back to default Vite port 5173
  }
  return 5173;
}

function checkPortFreeOnHost(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        resolve(false);
        return;
      }
      // Ignore unsupported address family (e.g. ::1 disabled)
      resolve(true);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen({ port, host, exclusive: true });
  });
}

async function isPortInUse(port) {
  const [v4Free, v6Free] = await Promise.all([
    checkPortFreeOnHost(port, '127.0.0.1'),
    checkPortFreeOnHost(port, '::1'),
  ]);
  return !v4Free || !v6Free;
}

function quoteWinArg(arg) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '\\"')}"`;
}

async function main() {
  ensureCargoInPath();
  const args = process.argv.slice(2);
  const subcommand = args[0] ?? 'dev';

  if (subcommand === 'dev') {
    const port = resolveDevPort();
    if (await isPortInUse(port)) {
      console.error(
        `[run-tauri] Port ${port} is already in use (another dev server or typst-presenter session may be running).`,
      );
      if (process.platform === 'win32') {
        console.error(
          `[run-tauri] Check & free port ${port} in PowerShell: Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object OwningProcess`,
        );
      } else {
        console.error(`[run-tauri] Check port ${port}: lsof -i :${port}`);
      }
      process.exit(1);
    }
  }

  try {
    execFileSync(process.platform === 'win32' ? 'cargo.exe' : 'cargo', ['--version'], {
      stdio: 'ignore',
      env: process.env,
    });
  } catch {
    console.error(
      '[run-tauri] Rust / Cargo was not found on PATH or in ~/.cargo/bin. Install Rustup from https://rustup.rs/ and reopen your terminal.',
    );
    process.exit(1);
  }

  const child =
    process.platform === 'win32'
      ? spawn(`npx --yes @tauri-apps/cli@2 ${args.map(quoteWinArg).join(' ')}`, {
          cwd: projectRoot,
          stdio: 'inherit',
          shell: true,
          env: process.env,
        })
      : spawn('npx', ['--yes', '@tauri-apps/cli@2', ...args], {
          cwd: projectRoot,
          stdio: 'inherit',
          env: process.env,
        });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    console.error(`[run-tauri] Failed to launch Tauri CLI: ${err.message}`);
    process.exit(1);
  });
}

void main();
