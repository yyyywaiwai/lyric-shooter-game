import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

process.env.LS_OPERATION_MODE = process.env.LS_OPERATION_MODE || 'integrated';

const viteBin = path.resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [viteBin, 'build', '--mode', 'integrated'], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    // eslint-disable-next-line no-console
    console.error(`vite build exited due to signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start vite build', err);
  process.exit(1);
});
