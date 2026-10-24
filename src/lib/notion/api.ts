import type { BackupRecord, Block, BlockType, Crumb, LockStatus, Page, RestoreResult, Snapshot, SearchResult } from './types';

// The gateway routes requests to the Rust (Axum) mini-service on port 3030
const SVC = 'XTransformPort=3030';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${path}${sep}${SVC}`, init);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** True when the server refused the call because the site lock has no valid session. */
export function isLockedErr(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.startsWith('401 ') && msg.includes('"locked"');
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export type PagePatch = {
  title?: string;
  icon?: string | null;
  cover?: string | null;
  parentId?: string | null;
  isFavorite?: boolean;
  isTrashed?: boolean;
  isPinned?: boolean;
  position?: number;
  date?: string | null;
};

export type BlockPatch = {
  type?: BlockType;
  content?: string;
  meta?: string;
  checked?: boolean;
  collapsed?: boolean;
  indent?: number;
};

export const api = {
  listPages: () => req<{ pages: Page[] }>('/api/pages'),

  getPage: (id: string) =>
    req<{ page: Page; blocks: Block[]; breadcrumbs: Crumb[] }>(`/api/pages/${id}`),

  createPage: (parentId: string | null, afterPageId?: string, title = '', date?: string | null) =>
    req<Page>('/api/pages', json('POST', { parentId, afterPageId, title, date })),

  updatePage: (id: string, patch: PagePatch) =>
    req<Page>(`/api/pages/${id}`, json('PATCH', patch)),

  deletePage: (id: string) =>
    req<{ deleted: number }>(`/api/pages/${id}`, { method: 'DELETE' }),

  duplicatePage: (id: string) => req<Page>(`/api/pages/${id}/duplicate`, { method: 'POST' }),

  trashList: () => req<{ pages: Page[] }>('/api/trash'),

  createBlock: (b: {
    pageId: string;
    type?: BlockType;
    content?: string;
    afterId?: string | null;
    indent?: number;
  }) => req<Block>('/api/blocks', json('POST', b)),

  updateBlock: (id: string, patch: BlockPatch) =>
    req<Block>(`/api/blocks/${id}`, json('PATCH', patch)),

  deleteBlock: (id: string) => req<{ ok: boolean }>(`/api/blocks/${id}`, { method: 'DELETE' }),

  reorderBlocks: (pageId: string, ids: string[]) =>
    req<{ blocks: Block[] }>(`/api/pages/${pageId}/blocks/reorder`, json('POST', { ids })),

  search: (q: string) =>
    req<{ recent: boolean; results: SearchResult[] }>(
      `/api/search?q=${encodeURIComponent(q)}`,
    ),

  listBackups: () => req<{ backups: BackupRecord[] }>('/api/backups'),

  recordBackup: (days: string[], format: string, pageCount: number) =>
    req<BackupRecord>('/api/backups', json('POST', { days, format, pageCount })),

  deleteBackup: (id: string) =>
    req<{ ok: boolean }>(`/api/backups/${id}`, { method: 'DELETE' }),

  /** Upload a client-built export file; served back at the returned URL. */
  createExport: (b: { filename: string; mime: string; content: string }) =>
    req<{ id: string; url: string }>('/api/export', json('POST', b)),

  /** Upload a foldered backup manifest; the server zips it (one folder per day, one .md per note). */
  createZipExport: (b: { filename: string; files: { path: string; content: string }[] }) =>
    req<{ id: string; url: string }>('/api/export-zip', json('POST', b)),

  /* ---- cloud snapshot (GitHub sync) ---- */

  /** Full workspace dump (pages + blocks + backup history; the PIN is never included). */
  getSnapshot: () => req<Snapshot>('/api/snapshot'),

  /** Replace ALL local data with a snapshot pulled from the cloud. */
  restoreSnapshot: (snap: { pages: unknown[]; blocks: unknown[]; backups: unknown[] }) =>
    req<RestoreResult>('/api/snapshot/restore', json('POST', snap)),

  /* ---- site-wide lock ---- */

  lockStatus: () => req<LockStatus>('/api/lock'),

  /** First-time setup (public) or change PIN (needs an unlocked session). */
  lockSetup: (pin: string) => req<LockStatus>('/api/lock/setup', json('POST', { pin })),

  lockVerify: (pin: string) => req<{ ok: boolean }>('/api/lock/verify', json('POST', { pin })),

  lockEngage: () => req<{ ok: boolean; locked: boolean }>('/api/lock/engage', json('POST', {})),

  lockDisable: () => req<{ ok: boolean }>('/api/lock/disable', json('POST', {})),
};
