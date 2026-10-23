'use client';

import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  StickyNote,
  PanelLeftClose,
  PanelLeft,
  Search,
  ShieldCheck,
  Pin,
} from 'lucide-react';
import type { Page } from '@/lib/notion/types';
import { t, useLang } from '@/lib/notion/i18n';
import {
  buildMonthCells,
  shiftMonth,
  todayIso,
  monthTitle,
  weekdayLabels,
  dayLong,
  otherCalShort,
  jalaliShort,
  gregShort,
  type Primary,
  type DayCell,
} from '@/lib/notion/jalali';

export interface CalendarViewProps {
  pages: Page[];
  sidebarOpen: boolean;
  /** ISO days already covered by a backup (green dot on the grid). */
  backedUpDays: Set<string>;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onNavigate: (id: string) => void;
  /** Clicking a day opens the full Day page for that date. */
  onOpenDay: (iso: string, primary: Primary) => void;
  onOpenBackup: () => void;
  onCreateDated: (iso: string) => Promise<Page | null>;
  onPatchPage: (id: string, patch: Partial<Page>) => void;
}

function readPrimary(): Primary {
  if (typeof window === 'undefined') return 'jalali';
  try {
    return localStorage.getItem('notion-cal-primary') === 'gregorian' ? 'gregorian' : 'jalali';
  } catch {
    return 'jalali';
  }
}

export function CalendarView(props: CalendarViewProps) {
  const { pages, sidebarOpen, backedUpDays, onToggleSidebar, onOpenSearch, onNavigate, onOpenDay, onOpenBackup, onCreateDated, onPatchPage } = props;
  const lang = useLang();

  const [anchor, setAnchor] = useState<string>(() => todayIso());
  const [primary, setPrimary] = useState<Primary>(readPrimary);
  const [dragOverIso, setDragOverIso] = useState<string | null>(null);
  const [, setDropTick] = useState(0); // force refresh after a drop

  const today = todayIso();
  const cells = useMemo(() => buildMonthCells(anchor, primary), [anchor, primary]);
  const title = useMemo(() => monthTitle(anchor, primary, lang), [anchor, primary, lang]);
  const wds = weekdayLabels(lang);

  const byDate = useMemo(() => {
    const map = new Map<string, Page[]>();
    for (const p of pages) {
      if (p.isTrashed || !p.date) continue;
      if (!map.has(p.date)) map.set(p.date, []);
      map.get(p.date)!.push(p);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.position - b.position);
    return map;
  }, [pages]);

  const setPrimaryPersist = (p: Primary) => {
    setPrimary(p);
    try {
      localStorage.setItem('notion-cal-primary', p);
    } catch {
      /* ignore */
    }
  };

  const PrevIco = lang === 'fa' ? ChevronRight : ChevronLeft;
  const NextIco = lang === 'fa' ? ChevronLeft : ChevronRight;

  const notesOf = (iso: string): Page[] => byDate.get(iso) || [];

  const onDropNote = (e: React.DragEvent, iso: string) => {
    e.preventDefault();
    setDragOverIso(null);
    const id = e.dataTransfer.getData('text/cal-note');
    if (id) {
      onPatchPage(id, { date: iso });
      setDropTick((x) => x + 1);
    }
  };

  /* ---------------- render ---------------- */

  return (
    <div className="notion-frame">
      {/* top bar — same pattern as the page editor */}
      <div className="topbar">
        <div className="topbar-left">
          <button className="icon-btn" onClick={onToggleSidebar} title={sidebarOpen ? t('sidebar.closeSidebar') : t('sidebar.openSidebar')}>
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
          <nav className="crumbs" aria-label="Calendar">
            <span className="crumb current">
              <CalendarDays size={14} className="crumb-file" />
              <span className="crumb-title">{t('sidebar.calendar')}</span>
            </span>
          </nav>
        </div>
        <div className="topbar-right">
          <button className="icon-btn" title={t('sidebar.search')} onClick={onOpenSearch}>
            <Search size={17} />
          </button>
        </div>
      </div>

      <div className="editor-scroll">
        <div className="cal-wrap">
          {/* toolbar — Notion database-view style */}
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button
                className="icon-btn"
                title={t('cal.prevMonth')}
                onClick={() => setAnchor((a) => shiftMonth(a, primary, -1))}
              >
                <PrevIco size={18} />
              </button>
              <button
                className="icon-btn"
                title={t('cal.nextMonth')}
                onClick={() => setAnchor((a) => shiftMonth(a, primary, 1))}
              >
                <NextIco size={18} />
              </button>
              <button className="txt-btn" onClick={() => setAnchor(todayIso())}>
                {t('cal.today')}
              </button>
            </div>

            <div className="cal-title">
              <span className="cal-title-main">{title.main}</span>
              <span className="cal-title-sub">{title.sub}</span>
            </div>

            <div className="cal-seg" role="group" aria-label={t('cal.toggleCal')}>
              <button
                className={`cal-seg-btn ${primary === 'jalali' ? 'on' : ''}`}
                onClick={() => setPrimaryPersist('jalali')}
              >
                {t('cal.primaryJalali')}
              </button>
              <button
                className={`cal-seg-btn ${primary === 'gregorian' ? 'on' : ''}`}
                onClick={() => setPrimaryPersist('gregorian')}
              >
                {t('cal.primaryGreg')}
              </button>
            </div>

            <button className="icon-btn cal-backup-btn" title={t('sidebar.backup')} onClick={onOpenBackup}>
              <ShieldCheck size={17} />
            </button>
          </div>

          {/* month grid */}
          <div className="cal-grid" data-primary={primary}>
            {wds.map((w) => (
              <div key={w} className="cal-wd">
                {w}
              </div>
            ))}

            {cells.map((c) => (
              <CalendarCell
                key={c.iso + primary}
                cell={c}
                primary={primary}
                lang={lang}
                today={today}
                notes={notesOf(c.iso)}
                backedUp={backedUpDays.has(c.iso)}
                dragOver={dragOverIso === c.iso}
                onOpenDay={(rect) => onOpenDay(c.iso, primary)}
                onAdd={() => onCreateDated(c.iso)}
                onNavigate={onNavigate}
                onTogglePin={onPatchPage}
                onDragOver={(on) => setDragOverIso(on ? c.iso : null)}
                onDropNote={(e) => onDropNote(e, c.iso)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   One calendar day cell
   ================================================================ */

function CalendarCell(props: {
  cell: DayCell;
  primary: Primary;
  lang: 'fa' | 'en';
  today: string;
  notes: Page[];
  backedUp: boolean;
  dragOver: boolean;
  onOpenDay: (rect: DOMRect) => void;
  onAdd: () => void;
  onNavigate: (id: string) => void;
  onTogglePin: (id: string, patch: Partial<Page>) => void;
  onDragOver: (on: boolean) => void;
  onDropNote: (e: React.DragEvent) => void;
}) {
  const { cell, primary, lang, today, notes, backedUp, dragOver, onOpenDay, onAdd, onNavigate, onTogglePin, onDragOver, onDropNote } = props;
  const isToday = cell.iso === today;
  const primaryNum = primary === 'jalali' ? cell.jd : cell.gd;
  const secondaryNum = primary === 'jalali' ? cell.gd : cell.jd;

  return (
    <div
      className={`cal-cell ${cell.inMonth ? '' : 'dim'} ${isToday ? 'is-today' : ''} ${dragOver ? 'drag-over' : ''}`}
      onClick={(e) => onOpenDay((e.currentTarget as HTMLElement).getBoundingClientRect())}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(true);
      }}
      onDragLeave={() => onDragOver(false)}
      onDrop={onDropNote}
    >
      <div className="cal-cell-head">
        <span className={`cal-num ${isToday ? 'today' : ''}`}>
          {lang === 'fa' ? primaryNum.toLocaleString('fa-IR') : primaryNum}
        </span>
        <span className="cal-num2">
          {lang === 'fa' ? secondaryNum.toLocaleString('fa-IR') : secondaryNum}
        </span>
        {backedUp && <span className="cal-done-dot" title={t('backup.backedUp')} />}
        <button
          className="cal-add"
          title={t('cal.newNote')}
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="cal-chips">
        {notes.slice(0, 3).map((p) => (
          <div
            key={p.id}
            className="cal-chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/cal-note', p.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(p.id);
            }}
            title={(p.title || t('sidebar.untitled')) + ' · ' + (primary === 'jalali' ? gregShort(cell.iso, lang) : jalaliShort(cell.iso, lang))}
          >
            <span className="cal-chip-ico">{p.icon || <StickyNote size={12} className="text-ico" />}</span>
            <span className="cal-chip-label">{p.title || t('sidebar.untitled')}</span>
            <button
              className={`cal-chip-pin ${p.isPinned ? 'on' : ''}`}
              title={p.isPinned ? t('sidebar.unpin') : t('sidebar.pin')}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(p.id, { isPinned: !p.isPinned });
              }}
            >
              <Pin size={10} fill={p.isPinned ? 'currentColor' : 'none'} />
            </button>
          </div>
        ))}
        {notes.length > 3 && <div className="cal-more">+{notes.length - 3}</div>}
      </div>
    </div>
  );
}

/* ================================================================
   MiniMonth — compact picker used by the note-date chip in the editor
   ================================================================ */

export function MiniMonth(props: { value: string | null; onPick: (iso: string) => void }) {
  const { value, onPick } = props;
  const lang = useLang();
  const primary: Primary = lang === 'fa' ? 'jalali' : 'gregorian';
  const [anchor, setAnchor] = useState<string>(() => value || todayIso());

  const cells = useMemo(() => buildMonthCells(anchor, primary), [anchor, primary]);
  const title = useMemo(() => monthTitle(anchor, primary, lang), [anchor, primary, lang]);
  const today = todayIso();

  const PrevIco = lang === 'fa' ? ChevronRight : ChevronLeft;
  const NextIco = lang === 'fa' ? ChevronLeft : ChevronRight;

  return (
    <div className="mini-cal" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
      <div className="mini-head">
        <button className="icon-btn" onClick={() => setAnchor((a) => shiftMonth(a, primary, -1))} title={t('cal.prevMonth')}>
          <PrevIco size={15} />
        </button>
        <div className="mini-title">
          <span className="mini-title-main">{title.main}</span>
          <span className="mini-title-sub">{title.sub}</span>
        </div>
        <button className="icon-btn" onClick={() => setAnchor((a) => shiftMonth(a, primary, 1))} title={t('cal.nextMonth')}>
          <NextIco size={15} />
        </button>
      </div>
      <div className="mini-grid">
        {weekdayLabels(lang).map((w) => (
          <div key={w} className="mini-wd">
            {w}
          </div>
        ))}
        {cells.map((c) => (
          <button
            key={c.iso + primary}
            className={`mini-cell ${c.inMonth ? '' : 'dim'} ${c.iso === today ? 'today' : ''} ${c.iso === value ? 'sel' : ''}`}
            onClick={() => onPick(c.iso)}
            title={dayLong(c.iso, lang, primary) + ' · ' + otherCalShort(c.iso, lang, primary)}
          >
            {lang === 'fa'
              ? (primary === 'jalali' ? c.jd : c.gd).toLocaleString('fa-IR')
              : primary === 'jalali'
                ? c.jd
                : c.gd}
          </button>
        ))}
      </div>
    </div>
  );
}
