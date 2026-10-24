export type BlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bulleted'
  | 'numbered'
  | 'todo'
  | 'toggle'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'
  | 'image';

export interface Page {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  cover: string | null;
  isFavorite: boolean;
  isTrashed: boolean;
  /** Explicitly chosen by the user for the sidebar ("selected notes"). */
  isPinned: boolean;
  position: number;
  /** Gregorian ISO day "YYYY-MM-DD" this note is attached to (calendar). */
  date: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Site-wide lock state reported by the Rust API. */
export interface LockStatus {
  enabled: boolean;
  locked: boolean;
  /** PIN length (4–8) so the lock screen can auto-submit. */
  length: number;
}

/** One recorded backup session (a set of ISO days the user exported). */
export interface BackupRecord {
  id: string;
  /** JSON array of "YYYY-MM-DD" strings covered by this backup. */
  days: string;
  startDate: string;
  endDate: string;
  format: 'pdf' | 'md' | 'json' | string;
  pageCount: number;
  createdAt: number;
}

export interface Block {
  id: string;
  pageId: string;
  type: BlockType;
  content: string;
  meta: string;
  checked: boolean;
  collapsed: boolean;
  indent: number;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface Crumb {
  id: string;
  title: string;
  icon: string | null;
}

/** Full workspace dump — what gets pushed to / pulled from GitHub. */
export interface Snapshot {
  app: string;
  version: number;
  exportedAt: number;
  pageCount: number;
  blockCount: number;
  pages: Page[];
  blocks: Block[];
  backups: BackupRecord[];
}

export interface RestoreResult {
  ok: boolean;
  pages: number;
  blocks: number;
  backups: number;
}

export interface SearchResult {
  pageId: string;
  title: string;
  icon: string | null;
  snippet: string;
  path: Crumb[];
}

export interface PageData {
  page: Page;
  blocks: Block[];
  breadcrumbs: Crumb[];
}

export type CaretPos = 'start' | 'end';
