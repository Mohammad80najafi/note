'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BackupRecord, Block, BlockType, Crumb, LockStatus, Page } from '@/lib/notion/types';
import { api, isLockedErr } from '@/lib/notion/api';
import { Sidebar } from './Sidebar';
import { Editor, type EditableBlock } from './Editor';
import { SearchModal, TrashModal, EmojiPickerPanel, CoverPickerPanel } from './Overlays';
import { parseMeta } from '@/lib/notion/constants';
import { t, initLang, useLang, toggleLang, editedLabel as editedLabelFor } from '@/lib/notion/i18n';
import { CalendarView } from './CalendarView';
import { DayView } from './DayView';
import { BackupDialog } from './BackupDialog';
import { LockScreen } from './LockScreen';
import { LockDialog } from './LockDialog';
import type { BackupFormat } from '@/lib/notion/backup';
import type { Primary } from '@/lib/notion/jalali';

type EmojiTarget = { kind: 'page' } | { kind: 'callout'; blockId: string };
type ViewKind = 'page' | 'calendar' | 'day';

export default function NotionApp() {
  const [pages, setPages] = useState<Page[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewKind>('calendar');
  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<EditableBlock[]>([]);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('notion-dark') === '1';
  });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth > 640; // phones start with the drawer closed
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [dayIso, setDayIso] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new Date().toISOString().slice(0, 10);
  });
  const [dayPrimary, setDayPrimary] = useState<Primary>('jalali');
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [lockStatus, setLockStatus] = useState<LockStatus | null>(null);
  const [locked, setLocked] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<{ target: EmojiTarget; rect: DOMRect } | null>(null);
  const [coverRect, setCoverRect] = useState<DOMRect | null>(null);

  const pagePatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setTick] = useState(0);
  const lang = useLang();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  /* ---------- theme ---------- */

  useEffect(() => {
    const d = localStorage.getItem('notion-dark') === '1';
    document.body.style.background = d ? '#191919' : '#ffffff';
  }, []);

  const toggleDark = useCallback(() => {
    setDark((d) => {
      const nd = !d;
      localStorage.setItem('notion-dark', nd ? '1' : '0');
      document.body.style.background = nd ? '#191919' : '#ffffff';
      return nd;
    });
  }, []);

  /* ---------- language ---------- */

  useEffect(() => {
    initLang();
  }, []);

  /* ---------- data loading ---------- */

  const refreshPages = useCallback(async () => {
    try {
      const r = await api.listPages();
      setPages(r.pages);
      return r.pages;
    } catch (e) {
      // session lost (lock armed, cookie invalid) → show the PIN screen again
      if (isLockedErr(e)) setLocked(true);
      return [];
    }
  }, []);

  const refreshBackups = useCallback(async () => {
    try {
      const r = await api.listBackups();
      setBackups(r.backups);
    } catch {
      /* ignore */
    }
  }, []);

  const loadPage = useCallback(async (id: string) => {
    try {
      const r = await api.getPage(id);
      setPage(r.page);
      setBlocks(r.blocks.map((b) => ({ ...b, _v: 1 })));
      setCrumbs(r.breadcrumbs);
      refreshPages();
      return true;
    } catch {
      return false;
    }
  }, [refreshPages]);

  const navigate = useCallback(
    async (id: string) => {
      setView('page');
      await loadPage(id);
      if (window.innerWidth <= 640) setSidebarOpen(false);
    },
    [loadPage],
  );

  const openDay = useCallback((iso: string, primary: Primary) => {
    setDayIso(iso);
    setDayPrimary(primary);
    setView('day');
    if (window.innerWidth <= 640) setSidebarOpen(false);
  }, []);

  const showCalendar = useCallback(() => {
    setView('calendar');
    if (window.innerWidth <= 640) setSidebarOpen(false);
  }, []);

  /** Load pages + backups (+ first-run default page). Skipped while locked. */
  const loadAll = useCallback(async () => {
    const list = await refreshPages();
    const alive = list.filter((p) => !p.isTrashed && !p.parentId);
    if (alive.length > 0) {
      // warm the data but stay on the calendar home
      const first = alive.sort((a, b) => a.position - b.position)[0];
      api.getPage(first.id).then((r) => {
        setPage(r.page);
        setBlocks(r.blocks.map((b) => ({ ...b, _v: 1 })));
        setCrumbs(r.breadcrumbs);
      }).catch(() => {});
    } else {
      try {
        const created = await api.createPage(null, undefined, t('defaultPageTitle'));
        await loadPage(created.id);
      } catch {
        /* lock/backend refused — nothing to seed */
      }
    }
    await refreshBackups();
  }, [refreshPages, loadPage, refreshBackups]);

  useEffect(() => {
    (async () => {
      // make sure the Rust backend is running (spawns it if needed)
      try {
        await fetch('/api/boot-backend');
      } catch {
        /* ignore */
      }
      // site lock first: while locked, no data may be loaded at all
      try {
        const st = await api.lockStatus();
        setLockStatus(st);
        if (st.locked) {
          setLocked(true);
          setReady(true);
          return;
        }
      } catch {
        /* backend down — fall through, data calls fail gracefully */
      }
      await loadAll().catch(() => {
        /* backend down — UI still boots empty */
      });
      setReady(true);
    })();
  }, [loadAll]);

  /* Ctrl+K */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- site-wide lock ---------- */

  const refreshLock = useCallback(async () => {
    try {
      setLockStatus(await api.lockStatus());
    } catch {
      /* ignore */
    }
  }, []);

  /** PIN verified on the lock screen — open the site and load data. */
  const onUnlocked = useCallback(async () => {
    setLocked(false);
    setReady(false);
    await refreshLock();
    await loadAll();
    setReady(true);
  }, [refreshLock]);

  const engageLock = useCallback(async () => {
    try {
      await api.lockEngage();
    } catch {
      /* even if the call fails, cover the UI */
    }
    setLockOpen(false);
    setLocked(true);
    showToast(t('lock.lockedToast'));
  }, [showToast]);

  const savePin = useCallback(
    async (pin: string) => {
      const wasEnabled = lockStatus?.enabled ?? false;
      const st = await api.lockSetup(pin);
      setLockStatus({ enabled: true, locked: false, length: st.length || pin.length });
      showToast(wasEnabled ? t('lock.changedToast') : t('lock.enabledToast'));
    },
    [lockStatus, showToast],
  );

  const removeLock = useCallback(async () => {
    await api.lockDisable();
    setLockStatus({ enabled: false, locked: false, length: 0 });
    showToast(t('lock.removedToast'));
  }, [showToast]);

  const onLockClick = useCallback(() => {
    if (lockStatus?.enabled) {
      engageLock();
    } else {
      setLockOpen(true);
    }
  }, [lockStatus, engageLock]);

  /* ---------- derived: backup coverage ---------- */

  const backedUpDays = useMemo(() => {
    const s = new Set<string>();
    const dates = new Map<string, string>();
    for (const b of backups) {
      let days: string[] = [];
      try {
        days = JSON.parse(b.days) as string[];
      } catch {
        days = [];
      }
      const when =
        lang === 'fa'
          ? new Date(b.createdAt).toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' })
          : new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      for (const d of days) {
        s.add(d);
        if (!dates.has(d)) dates.set(d, when); // backups are newest-first
      }
    }
    // attach dates via a parallel map render (kept in a second memo below)
    return { days: s, dates };
  }, [backups, lang]);

  /* ---------- page ops ---------- */

  const patchPage = useCallback(
    (patch: Partial<Page> & { icon?: string | null; cover?: string | null }, opts?: { debounce?: boolean }) => {
      if (!page) return;
      const merged = { ...page, ...patch } as Page;
      setPage(merged);
      setPages((ps) => ps.map((p) => (p.id === page.id ? merged : p)));
      const doPatch = () => api.updatePage(page.id, patch as never).then((np) => {
        setPage((cur) => (cur && cur.id === np.id ? np : cur));
        setPages((ps) => ps.map((p) => (p.id === np.id ? np : p)));
      }).catch(() => {});
      if (opts?.debounce) {
        if (pagePatchTimer.current) clearTimeout(pagePatchTimer.current);
        pagePatchTimer.current = setTimeout(doPatch, 400);
      } else {
        doPatch();
      }
    },
    [page],
  );

  const createPage = useCallback(
    async (parentId: string | null, afterPageId?: string) => {
      const created = await api.createPage(parentId, afterPageId);
      await refreshPages();
      setView('page');
      await loadPage(created.id);
      return created;
    },
    [refreshPages, loadPage],
  );

  /** New note attached to a specific day (from the calendar/day view). */
  const createDatedNote = useCallback(
    async (iso: string) => {
      const created = await api.createPage(null, undefined, '', iso);
      await refreshPages();
      setView('page');
      await loadPage(created.id);
      return created;
    },
    [refreshPages, loadPage],
  );

  /** Patch a page by id from the sidebar/calendar/day view (keeps lists + open page in sync). */
  const patchPageById = useCallback(
    (id: string, patch: Partial<Page>) => {
      setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      api.updatePage(id, patch as never)
        .then((np) => {
          setPages((ps) => ps.map((p) => (p.id === np.id ? np : p)));
          setPage((cur) => (cur && cur.id === np.id ? np : cur));
        })
        .catch(() => {});
    },
    [],
  );

  const duplicatePage = useCallback(
    async (id: string) => {
      try {
        const np = await api.duplicatePage(id);
        await refreshPages();
        showToast(t('toast.pageDuplicated'));
        return np;
      } catch {
        showToast(t('toast.duplicateFailed'));
        return null;
      }
    },
    [refreshPages, showToast],
  );

  const trashPage = useCallback(
    async (id: string) => {
      await api.updatePage(id, { isTrashed: true }).catch(() => {});
      await refreshPages();
      if (page?.id === id) {
        const alive = pages.filter((p) => !p.isTrashed && !p.parentId && p.id !== id);
        if (alive.length) await loadPage(alive[0].id);
      }
      showToast(t('toast.movedToTrash'));
    },
    [page, pages, refreshPages, loadPage, showToast],
  );

  const purgePage = useCallback(
    async (id: string) => {
      await api.deletePage(id).catch(() => {});
      setPages((ps) => ps.filter((p) => p.id !== id));
    },
    [],
  );

  /* ---------- backup ---------- */

  const handleBackupExported = useCallback(
    async (days: string[], format: BackupFormat, count: number) => {
      try {
        await api.recordBackup(days, format, count);
        await refreshBackups();
        showToast(t('backup.done', { n: count }));
      } catch {
        /* ignore */
      }
    },
    [refreshBackups, showToast],
  );

  /* ---------- block ops ---------- */

  const patchBlock = useCallback(
    (id: string, patch: Partial<Pick<Block, 'type' | 'content' | 'meta' | 'checked' | 'collapsed' | 'indent'>>, opts?: { bump?: boolean }) => {
      setBlocks((bs) =>
        bs.map((b) =>
          b.id === id ? { ...b, ...patch, _v: opts?.bump === false ? b._v : (b._v || 0) + 1 } : b,
        ),
      );
      api.updateBlock(id, patch).catch(() => {});
    },
    [],
  );

  const createBlock = useCallback(
    async (
      afterId: string | null,
      init: { type?: BlockType; content?: string; indent?: number },
    ): Promise<Block | null> => {
      if (!page) return null;
      try {
        const nb = await api.createBlock({ pageId: page.id, afterId, ...init });
        setBlocks((bs) => {
          const idx = afterId ? bs.findIndex((b) => b.id === afterId) : bs.length - 1;
          const next = [...bs];
          next.splice(idx + 1, 0, { ...nb, _v: 1 });
          return next;
        });
        return nb;
      } catch {
        return null;
      }
    },
    [page],
  );

  const deleteBlock = useCallback((id: string) => {
    setBlocks((bs) => bs.filter((b) => b.id !== id));
    api.deleteBlock(id).catch(() => {});
  }, []);

  const reorderBlocks = useCallback(
    async (ids: string[]) => {
      if (!page) return;
      try {
        const r = await api.reorderBlocks(page.id, ids);
        setBlocks(r.blocks.map((b) => ({ ...b, _v: 1 })));
      } catch {
        /* ignore */
      }
    },
    [page],
  );

  /* ---------- emoji / cover ---------- */

  const onEmojiPick = useCallback(
    (emoji: string) => {
      const target = emojiTarget?.target;
      if (!target) return;
      if (target.kind === 'page') {
        patchPage({ icon: emoji });
      } else {
        const b = blocks.find((x) => x.id === target.blockId);
        patchBlock(target.blockId, {
          meta: JSON.stringify({ ...parseMeta(b?.meta || ''), emoji }),
        });
      }
      setEmojiTarget(null);
    },
    [emojiTarget, patchPage, blocks, patchBlock],
  );

  const onCoverPick = useCallback(
    (css: string) => {
      patchPage({ cover: css });
      setCoverRect(null);
    },
    [patchPage],
  );

  /* ---------- edited label ---------- */

  useEffect(() => {
    const timer = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const editedLabel = page ? editedLabelFor(page.updatedAt) : '';

  /* ---------- render ---------- */

  return (
    <div className={`notion-root ${dark ? 'dark' : ''} ${lang === 'fa' ? 'lang-fa rtl' : ''}`}>
      <div className="notion-app">
        {sidebarOpen && (
          <>
            <Sidebar
              pages={pages}
              currentId={page?.id || null}
              view={view}
              dark={dark}
              onNavigate={navigate}
              onShowCalendar={showCalendar}
              onOpenBackup={() => setBackupOpen(true)}
              onCreatePage={() => createPage(null)}
              onPatchPage={patchPageById}
              onOpenTrash={() => setTrashOpen(true)}
              onToggleDark={toggleDark}
              onToggleLang={toggleLang}
              onOpenSearch={() => setSearchOpen(true)}
              onToggleSidebar={() => setSidebarOpen(false)}
              lockEnabled={lockStatus?.enabled ?? false}
              onLockClick={onLockClick}
              onLockSettings={() => setLockOpen(true)}
            />
            <div className="sb-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
          </>
        )}

        {view === 'calendar' ? (
          <CalendarView
            pages={pages}
            sidebarOpen={sidebarOpen}
            backedUpDays={backedUpDays.days}
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
            onOpenSearch={() => setSearchOpen(true)}
            onNavigate={navigate}
            onOpenDay={openDay}
            onOpenBackup={() => setBackupOpen(true)}
            onCreateDated={createDatedNote}
            onPatchPage={patchPageById}
          />
        ) : view === 'day' ? (
          <DayView
            iso={dayIso}
            primary={dayPrimary}
            pages={pages}
            backedUpDays={backedUpDays.days}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
            onOpenSearch={() => setSearchOpen(true)}
            onBack={() => setView('calendar')}
            onChangeDay={(iso) => setDayIso(iso)}
            onNavigate={navigate}
            onCreateDated={createDatedNote}
            onTrashPage={(id) => trashPage(id)}
            onTogglePin={(p) => patchPageById(p.id, { isPinned: !p.isPinned })}
          />
        ) : page ? (
          <Editor
            page={page}
            blocks={blocks}
            crumbs={crumbs}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
            onNavigate={navigate}
            onPatchPage={patchPage as never}
            onCreateBlock={createBlock}
            onPatchBlock={patchBlock}
            onDeleteBlock={deleteBlock}
            onReorder={reorderBlocks}
            onOpenSearch={() => setSearchOpen(true)}
            onToast={showToast}
            onOpenEmoji={(target, rect) => setEmojiTarget({ target, rect })}
            onOpenCover={(rect) => setCoverRect(rect)}
            onDuplicatePage={() => page && duplicatePage(page.id)}
            onTrashPage={() => page && trashPage(page.id)}
            onToggleDark={toggleDark}
            editedLabel={editedLabel}
          />
        ) : (
          <div className="loading-pane">{ready ? t('selectPage') : t('loading')}</div>
        )}
      </div>

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onNavigate={navigate}
        />
      )}

      {trashOpen && (
        <TrashModal
          pages={pages}
          onClose={() => setTrashOpen(false)}
          onRestore={async (id) => {
            await api.updatePage(id, { isTrashed: false }).catch(() => {});
            await refreshPages();
          }}
          onPurge={purgePage}
          onNavigate={navigate}
        />
      )}

      {backupOpen && (
        <BackupDialog
          backedUpDays={backedUpDays.days}
          backupDates={backedUpDays.dates}
          backups={backups}
          onClose={() => setBackupOpen(false)}
          onExported={handleBackupExported}
        />
      )}

      {emojiTarget && (
        <EmojiPickerPanel
          rect={emojiTarget.rect}
          onPick={onEmojiPick}
          onRemove={
            emojiTarget.target.kind === 'page'
              ? () => {
                  patchPage({ icon: null });
                  setEmojiTarget(null);
                }
              : undefined
          }
          onClose={() => setEmojiTarget(null)}
        />
      )}

      {coverRect && (
        <CoverPickerPanel
          rect={coverRect}
          onPick={onCoverPick}
          onRemove={() => {
            patchPage({ cover: null });
            setCoverRect(null);
          }}
          onClose={() => setCoverRect(null)}
        />
      )}

      {locked && lockStatus && (
        <LockScreen length={lockStatus.length} onUnlocked={onUnlocked} />
      )}

      {lockOpen && lockStatus && (
        <LockDialog
          status={lockStatus}
          onClose={() => setLockOpen(false)}
          onSave={savePin}
          onEngage={engageLock}
          onRemove={removeLock}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
