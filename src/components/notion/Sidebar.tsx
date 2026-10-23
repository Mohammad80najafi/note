'use client';

import React, { useMemo } from 'react';
import {
  Search,
  CalendarDays,
  Trash2,
  FileText,
  Moon,
  Sun,
  Languages,
  ShieldCheck,
  Pin,
  PinOff,
  Plus,
  X,
  Lock,
  Unlock,
  Settings2,
} from 'lucide-react';
import type { Page } from '@/lib/notion/types';
import { t, useLang } from '@/lib/notion/i18n';
import { jalaliShort, gregShort } from '@/lib/notion/jalali';

export type SidebarView = 'page' | 'calendar' | 'day';

interface SidebarProps {
  pages: Page[];
  currentId: string | null;
  view: SidebarView;
  dark: boolean;
  onNavigate: (id: string) => void;
  onShowCalendar: () => void;
  onOpenBackup: () => void;
  onCreatePage: () => void;
  /** Used for un-pinning straight from the sidebar. */
  onPatchPage: (id: string, patch: Partial<Page>) => void;
  onOpenTrash: () => void;
  onToggleDark: () => void;
  onToggleLang: () => void;
  onOpenSearch: () => void;
  onToggleSidebar: () => void;
  /** Site-wide lock: whether a PIN lock is armed. */
  lockEnabled: boolean;
  /** Row click: open setup when off, engage the lock when on. */
  onLockClick: () => void;
  /** Small gear: open lock settings (change PIN / remove). */
  onLockSettings: () => void;
}

export function Sidebar(props: SidebarProps) {
  const {
    pages, currentId, view, dark, onNavigate, onShowCalendar, onOpenBackup,
    onCreatePage, onPatchPage, onOpenTrash, onToggleDark, onToggleLang,
    onOpenSearch, onToggleSidebar, lockEnabled, onLockClick, onLockSettings,
  } = props;

  const lang = useLang();

  /**
   * The sidebar shows ONLY the notes the user explicitly selected (pinned).
   * Everything else stays in the calendar / search.
   */
  const pinned = useMemo(
    () =>
      pages
        .filter((p) => p.isPinned && !p.isTrashed)
        .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.position - b.position),
    [pages],
  );

  const calendarActive = view === 'calendar' || view === 'day';

  const dateLabel = (p: Page): string => {
    if (!p.date) return '';
    return lang === 'fa' ? jalaliShort(p.date, 'fa') : gregShort(p.date, 'en');
  };

  return (
    <aside className="sidebar sb" data-testid="sidebar">
      {/* brand */}
      <div className="sb-brand">
        <button className="sb-brand-btn" onClick={onToggleSidebar} title={t('sidebar.closeSidebar')}>
          <span className="sb-logo">{lang === 'fa' ? 'ن' : 'N'}</span>
          <span className="sb-brand-txt">
            <span className="sb-name">{t('app.title')}</span>
            <span className="sb-tag">{t('sidebar.calendar')} · {t('sidebar.pinned')}</span>
          </span>
        </button>
        {/* site lock — a compact icon right beside the logo */}
        <button
          className={`sb-lock-ico ${lockEnabled ? 'lk-on' : ''}`}
          onClick={onLockClick}
          title={lockEnabled ? t('lock.navLockNow') : t('lock.nav')}
          aria-label={lockEnabled ? t('lock.navLockNow') : t('lock.nav')}
          data-testid="lock-icon"
        >
          {lockEnabled ? <Lock size={15} /> : <Unlock size={15} />}
        </button>
        {lockEnabled && (
          <button
            className="sb-lock-gear"
            onClick={onLockSettings}
            title={t('lock.settings')}
            aria-label={t('lock.settings')}
            data-testid="lock-gear"
          >
            <Settings2 size={13} />
          </button>
        )}
        <button className="sb-x" onClick={onToggleSidebar} title={t('sidebar.closeSidebar')} aria-label={t('sidebar.closeSidebar')}>
          <X size={15} />
        </button>
      </div>

      <div className="sb-body">
        {/* primary nav */}
        <nav className="sb-nav">
          <button className="sb-nav-row" onClick={onOpenSearch}>
            <span className="sb-nav-ico"><Search size={15} /></span>
            <span className="sb-nav-label">{t('sidebar.search')}</span>
            <span className="sb-kbd">⌘K</span>
          </button>
          <button className={`sb-nav-row ${calendarActive ? 'active' : ''}`} onClick={onShowCalendar}>
            <span className="sb-nav-ico"><CalendarDays size={15} /></span>
            <span className="sb-nav-label">{t('sidebar.calendar')}</span>
          </button>
          <button className="sb-nav-row" onClick={onOpenBackup}>
            <span className="sb-nav-ico"><ShieldCheck size={15} /></span>
            <span className="sb-nav-label">{t('sidebar.backup')}</span>
          </button>
        </nav>

        <div className="sb-sep" />

        {/* selected (pinned) notes */}
        <div className="sb-sec">
          <div className="sb-sec-head">
            <span className="sb-sec-label">{t('sidebar.pinned')}</span>
            {pinned.length > 0 && <span className="sb-count">{lang === 'fa' ? pinned.length.toLocaleString('fa-IR') : pinned.length}</span>}
          </div>

          {pinned.length === 0 ? (
            <div className="sb-empty">
              <span className="sb-empty-ico"><Pin size={16} /></span>
              <span className="sb-empty-title">{t('sidebar.pinnedEmpty')}</span>
              <span className="sb-empty-hint">{t('sidebar.pinnedEmptyHint')}</span>
            </div>
          ) : (
            <div className="sb-list">
              {pinned.map((p) => (
                <div key={p.id} className={`sb-note ${p.id === currentId ? 'active' : ''}`}>
                  <button className="sb-note-btn" onClick={() => onNavigate(p.id)} title={p.title || t('sidebar.untitled')}>
                    <span className="sb-note-ico">{p.icon || <FileText size={14} className="text-ico" />}</span>
                    <span className="sb-note-txt">
                      <span className="sb-note-title">{p.title || t('sidebar.untitled')}</span>
                      {p.date && <span className="sb-note-date">{dateLabel(p)}</span>}
                    </span>
                  </button>
                  <button
                    className="sb-unpin"
                    title={t('sidebar.unpin')}
                    aria-label={t('sidebar.unpin')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPatchPage(p.id, { isPinned: false });
                    }}
                  >
                    <PinOff size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* footer */}
      <div className="sb-foot">
        <div className="sb-foot-row">
          <button className="sb-foot-btn" onClick={onToggleDark} title={dark ? t('sidebar.light') : t('sidebar.dark')}>
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button className="sb-foot-btn" onClick={onToggleLang} title={t('sidebar.language')}>
            <Languages size={15} />
            <span className="sb-foot-txt">{lang === 'fa' ? 'EN' : 'فا'}</span>
          </button>
          <button className="sb-foot-btn" onClick={onOpenTrash} title={t('sidebar.trash')}>
            <Trash2 size={15} />
          </button>
          <button className="sb-new" onClick={onCreatePage} title={t('sidebar.newPage')}>
            <Plus size={14} />
            <span>{t('sidebar.newPage')}</span>
          </button>
        </div>
        <div className="sb-powered">Rust 🦀 + Next.js</div>
      </div>
    </aside>
  );
}
