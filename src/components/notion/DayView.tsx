'use client';

import React, { useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowRight,
  ArrowLeft,
  StickyNote,
  Search,
  Check,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Pin,
} from 'lucide-react';
import type { Page } from '@/lib/notion/types';
import { t, useLang } from '@/lib/notion/i18n';
import {
  dayLong,
  otherCalShort,
  addDaysIso,
  jalaliShort,
  gregShort,
  type Primary,
} from '@/lib/notion/jalali';

export interface DayViewProps {
  iso: string;
  primary: Primary;
  pages: Page[];
  /** ISO days already covered by a backup (green badge). */
  backedUpDays: Set<string>;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onBack: () => void;
  onChangeDay: (iso: string) => void;
  onNavigate: (id: string) => void;
  onCreateDated: (iso: string) => Promise<Page | null>;
  onTrashPage: (id: string) => void;
  onTogglePin: (p: Page) => void;
}

export function DayView(props: DayViewProps) {
  const {
    iso, primary, pages, backedUpDays, sidebarOpen, onToggleSidebar, onOpenSearch,
    onBack, onChangeDay, onNavigate, onCreateDated, onTrashPage, onTogglePin,
  } = props;
  const lang = useLang();

  const notes = useMemo(
    () =>
      pages
        .filter((p) => !p.isTrashed && p.date === iso)
        .sort((a, b) => a.position - b.position),
    [pages, iso],
  );

  const backedUp = backedUpDays.has(iso);
  const PrevIco = lang === 'fa' ? ChevronRight : ChevronLeft;
  const NextIco = lang === 'fa' ? ChevronLeft : ChevronRight;
  const BackIco = lang === 'fa' ? ArrowRight : ArrowLeft;

  return (
    <div className="notion-frame">
      <div className="topbar">
        <div className="topbar-left">
          <button className="icon-btn" onClick={onToggleSidebar} title={sidebarOpen ? t('sidebar.closeSidebar') : t('sidebar.openSidebar')}>
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
          <button className="crumb" onClick={onBack} title={t('day.back')}>
            <BackIco size={14} />
            <span className="crumb-title">{t('sidebar.calendar')}</span>
          </button>
          <span className="crumb-sep">/</span>
          <span className="crumb current">
            <span className="crumb-title">{dayLong(iso, lang, primary)}</span>
          </span>
        </div>
        <div className="topbar-right">
          <button className="icon-btn" title={t('sidebar.search')} onClick={onOpenSearch}>
            <Search size={17} />
          </button>
        </div>
      </div>

      <div className="editor-scroll">
        <div className="day-wrap">
          {/* day header */}
          <div className="day-head">
            <div className="day-head-nav">
              <button className="icon-btn" title={t('day.prevDay')} onClick={() => onChangeDay(addDaysIso(iso, -1))}>
                <PrevIco size={18} />
              </button>
              <button className="icon-btn" title={t('day.nextDay')} onClick={() => onChangeDay(addDaysIso(iso, 1))}>
                <NextIco size={18} />
              </button>
            </div>

            <div className="day-head-main">
              <h1 className="day-title">{dayLong(iso, lang, primary)}</h1>
              <div className="day-sub">
                {otherCalShort(iso, lang, primary)}
                <span className="day-dot">·</span>
                {t('day.notesTitle', { n: notes.length })}
                {backedUp && (
                  <span className="day-backed" title={t('day.backedUp')}>
                    <Check size={11} strokeWidth={3.5} />
                    {t('day.backedUp')}
                  </span>
                )}
              </div>
            </div>

            <button className="day-add-btn" onClick={() => onCreateDated(iso)}>
              <Plus size={15} />
              {t('cal.addNote')}
            </button>
          </div>

          {/* notes of this day */}
          <div className="day-list">
            {notes.length === 0 && (
              <button
                className="day-empty"
                onClick={() => onCreateDated(iso)}
                title={t('cal.addNote')}
              >
                <StickyNote size={20} className="day-empty-ico" />
                <span>{t('cal.emptyDay')}</span>
                <span className="day-empty-hint">{t('cal.addNote')} +</span>
              </button>
            )}

            {notes.map((p) => (
              <div
                key={p.id}
                className="day-row"
                draggable
                onClick={() => onNavigate(p.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onNavigate(p.id)}
              >
                <span className="day-row-ico">{p.icon || <StickyNote size={16} className="text-ico" />}</span>
                <span className="day-row-body">
                  <span className="day-row-title">{p.title || t('sidebar.untitled')}</span>
                  <span className="day-row-date">
                    {primary === 'jalali' ? gregShort(iso, lang) : jalaliShort(iso, lang)}
                  </span>
                </span>
                <span className="day-row-actions">
                  <button
                    className="tree-btn"
                    title={p.isPinned ? t('sidebar.unpin') : t('sidebar.pin')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin(p);
                    }}
                  >
                    <Pin size={14} fill={p.isPinned ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className="tree-btn danger"
                    title={t('menu.trash')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTrashPage(p.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
