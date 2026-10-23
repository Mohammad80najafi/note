/* Windows-app build: produce a pure-static frontend in out/ for the Rust
   server to serve on a single port.

   `next build` with output:"export" refuses to compile API route handlers,
   and this project keeps a couple under src/app/api (dev helpers only).
   So: temporarily move that folder away, build, then always restore it. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiDir = path.join(root, 'src', 'app', 'api');
// must move OUTSIDE src/app — Next still scans dot/underscore folders inside it
const hiddenDir = path.join(root, '.api-backup-build-app');
const moved = fs.existsSync(apiDir);

function restore() {
  if (moved && fs.existsSync(hiddenDir)) {
    try {
      fs.renameSync(hiddenDir, apiDir);
      console.log('[build-app] restored src/app/api');
    } catch (e) {
      console.error('[build-app] FAILED to restore src/app/api — restore it manually:', e.message);
      process.exitCode = 1;
    }
  }
}

(async () => {
  if (moved) {
    fs.renameSync(apiDir, hiddenDir);
    console.log('[build-app] src/app/api temporarily moved aside');
  }
  try {
    const r = spawnSync('npx', ['next', 'build'], {
      stdio: 'inherit',
      cwd: root,
      shell: process.platform === 'win32',
      env: { ...process.env, STATIC_EXPORT: '1' },
    });
    if (r.status !== 0) {
      process.exitCode = r.status || 1;
      return;
    }
    const out = path.join(root, 'out');
    console.log(
      fs.existsSync(out)
        ? `[build-app] static UI ready → ${out}`
        : '[build-app] warning: out/ not found',
    );
  } finally {
    restore();
  }
})();
