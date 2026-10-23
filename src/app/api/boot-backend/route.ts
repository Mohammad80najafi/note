import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { existsSync } from 'fs';

const BIN = '/home/z/my-project/mini-services/notion-server/target/debug/notion-server';
const HEALTH = 'http://127.0.0.1:3030/api/health';

// global guard so concurrent requests don't double-spawn
const g = globalThis as unknown as { __notionSpawning?: boolean };

async function isUp(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH, { signal: AbortSignal.timeout(700) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    if (await isUp()) {
      return NextResponse.json({ ok: true, spawned: false, alreadyRunning: true });
    }
    if (!existsSync(BIN)) {
      return NextResponse.json({ ok: false, error: 'binary missing' }, { status: 500 });
    }
    if (!g.__notionSpawning) {
      g.__notionSpawning = true;
      try {
        const child = spawn(BIN, [], {
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, NOTION_DB: '/home/z/my-project/db/notion.db', PORT: '3030' },
        });
        child.unref();
      } finally {
        setTimeout(() => {
          g.__notionSpawning = false;
        }, 3000);
      }
    }
    // wait for boot
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await isUp()) {
        return NextResponse.json({ ok: true, spawned: true });
      }
    }
    return NextResponse.json({ ok: false, error: 'did not come up' }, { status: 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
