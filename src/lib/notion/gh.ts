/* ================================================================
   GitHub cloud sync — push/pull the full workspace snapshot to a
   PRIVATE GitHub repo through the REST API, straight from the browser
   (api.github.com allows CORS). Manual, snapshot-style sync:
   every push = one commit → the repo history is a versioned backup.
   The token stays in this browser's localStorage; it is never sent
   anywhere except api.github.com.
   ================================================================ */

import { api } from './api';

const GH_API = 'https://api.github.com';
const LS_KEY = 'notion-gh-sync-v1';

export interface GhSettings {
  /** "owner/repo" — created automatically (private) on first push if missing. */
  repo: string;
  /** PAT (classic `repo` scope, or fine-grained with Contents read/write). */
  token: string;
  branch: string;
  path: string;
  /** Local timestamps of the last successful push/pull (ms epoch). */
  lastPushAt: number | null;
  lastPullAt: number | null;
}

export function defaultGhSettings(): GhSettings {
  return { repo: '', token: '', branch: 'main', path: 'notion-data.json', lastPushAt: null, lastPullAt: null };
}

export function loadGhSettings(): GhSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultGhSettings();
    return { ...defaultGhSettings(), ...(JSON.parse(raw) as Partial<GhSettings>) };
  } catch {
    return defaultGhSettings();
  }
}

export function saveGhSettings(s: GhSettings): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* storage full/blocked — sync still works for this session */
  }
}

export function clearGhSettings(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

/* ---------------- base64 (UTF-8 safe) ---------------- */

function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64decode(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ---------------- GitHub REST ---------------- */

class GhError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function ghFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new GhError(0, 'network'); // offline / DNS / CORS
  }
  return res;
}

async function ghJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new GhError(res.status, 'bad response');
  }
}

/** Extract a readable Persian/English-ish message from a GitHub error body. */
async function ghErr(res: Response): Promise<GhError> {
  let msg = '';
  try {
    const body = (await res.json()) as { message?: string };
    msg = body.message || '';
  } catch {
    /* ignore */
  }
  if (res.status === 401) return new GhError(401, 'auth');
  if (res.status === 403 && /rate limit/i.test(msg)) return new GhError(403, 'rate');
  return new GhError(res.status, 'http');
}

export function repoName(settings: GhSettings): string {
  const r = settings.repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  const short = r.includes('/') ? r.slice(r.indexOf('/') + 1) : r;
  return short || 'note-data';
}

export function repoFull(settings: GhSettings): string {
  const r = settings.repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  return r || 'note-data';
}

/** Repo exists? Returns true/false (false = 404). Throws on auth/network errors. */
export async function ghRepoExists(s: GhSettings): Promise<boolean> {
  const res = await ghFetch(`${GH_API}/repos/${repoFull(s)}`, s.token);
  if (res.status === 404) return false;
  if (!res.ok) throw await ghErr(res);
  return true;
}

/** Create the repo as PRIVATE (used automatically on first push when it's missing). */
export async function ghCreatePrivateRepo(s: GhSettings): Promise<void> {
  const res = await ghFetch(`${GH_API}/user/repos`, s.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: repoName(s),
      private: true,
      description: 'Cloud backup of my notes (notion-clone snapshot)',
      has_issues: false,
      has_wiki: false,
      has_projects: false,
      auto_init: false,
    }),
  });
  if (!res.ok && res.status !== 422 /* already exists */) throw await ghErr(res);
}

interface ContentsInfo {
  sha?: string;
  content?: string;
  encoding?: string;
  git_url?: string;
}

/** PUT one file = one commit. Creates the file (and the branch) if missing. */
async function ghPutFile(s: GhSettings, text: string, message: string): Promise<{ sha: string; htmlUrl: string }> {
  const path = s.path.replace(/^\/+/, '');
  // current sha (needed when updating an existing file)
  let sha: string | undefined;
  const info = await ghFetch(`${GH_API}/repos/${repoFull(s)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(s.branch)}`, s.token);
  if (info.status === 200) {
    const body = await ghJson<ContentsInfo>(info);
    sha = body.sha;
  } else if (info.status !== 404) {
    throw await ghErr(info);
  }

  const res = await ghFetch(`${GH_API}/repos/${repoFull(s)}/contents/${encodeURIComponent(path)}`, s.token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: b64encode(text), branch: s.branch, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw await ghErr(res);
  const body = await ghJson<{ content?: { sha?: string; html_url?: string }; commit?: { html_url?: string } }>(res);
  return {
    sha: body.content?.sha || sha || '',
    htmlUrl: body.commit?.html_url || body.content?.html_url || `https://github.com/${repoFull(s)}/blob/${s.branch}/${path}`,
  };
}

/** Fetch the snapshot file text; null when the repo/file does not exist yet. */
async function ghGetFileText(s: GhSettings): Promise<string | null> {
  const path = s.path.replace(/^\/+/, '');
  const res = await ghFetch(`${GH_API}/repos/${repoFull(s)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(s.branch)}`, s.token);
  if (res.status === 404) return null;
  if (!res.ok) throw await ghErr(res);
  const body = await ghJson<ContentsInfo>(res);
  if (body.content) return b64decode(body.content);
  if (body.git_url) {
    // files > 1 MB come without inline content — fetch the blob instead
    const blob = await ghFetch(body.git_url, s.token);
    if (!blob.ok) throw await ghErr(blob);
    const bb = await ghJson<{ content?: string; encoding?: string }>(blob);
    return bb.content && bb.encoding === 'base64' ? b64decode(bb.content) : null;
  }
  return null;
}

/* ---------------- high-level sync ---------------- */

export interface PushResult {
  pages: number;
  blocks: number;
  htmlUrl: string;
}

export async function ghPush(s: GhSettings): Promise<PushResult> {
  const snap = await api.getSnapshot();
  // repo missing → create it privately, then push again
  const exists = await ghRepoExists(s);
  if (!exists) await ghCreatePrivateRepo(s);

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const msg = `notes backup — ${stamp} (${snap.pageCount} notes, ${snap.blockCount} blocks)`;
  const { htmlUrl } = await ghPutFile(s, JSON.stringify(snap), msg);

  const next = { ...s, lastPushAt: Date.now() };
  saveGhSettings(next);
  return { pages: snap.pageCount, blocks: snap.blockCount, htmlUrl };
}

export interface PullResult {
  pages: number;
  blocks: number;
  backups: number;
  exportedAt: number | null;
}

export async function ghPullAndRestore(s: GhSettings): Promise<PullResult> {
  const text = await ghGetFileText(s);
  if (text === null) throw new GhError(404, 'no snapshot');
  let snap: { pages?: unknown[]; blocks?: unknown[]; backups?: unknown[]; exportedAt?: number };
  try {
    snap = JSON.parse(text);
  } catch {
    throw new GhError(0, 'corrupt');
  }
  if (!snap || !Array.isArray(snap.pages) || !Array.isArray(snap.blocks)) {
    throw new GhError(0, 'corrupt');
  }
  const r = await api.restoreSnapshot({ pages: snap.pages, blocks: snap.blocks, backups: Array.isArray(snap.backups) ? snap.backups : [] });
  saveGhSettings({ ...s, lastPullAt: Date.now() });
  return { pages: r.pages, blocks: r.blocks, backups: r.backups, exportedAt: snap.exportedAt ?? null };
}

/** Quick credential/repo check used by the "test" button. */
export async function ghTest(s: GhSettings): Promise<{ repoExists: boolean }> {
  const res = await ghFetch(`${GH_API}/repos/${repoFull(s)}`, s.token);
  if (res.status === 404) return { repoExists: false };
  if (!res.ok) throw await ghErr(res);
  return { repoExists: true };
}
