'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  FileJson,
  FileText,
  FolderDown,
  Printer,
  X,
  CalendarRange,
  ShieldCheck,
} from 'lucide-react';
import type { BackupRecord } from '@/lib/notion/types';
import { t, useLang, fmtNum } from '@/lib/notion/i18n';
import {
  buildMonthCells,
  shiftMonth,
  todayIso,
  monthTitle,
  dayLong,
  type Primary,
} from '@/lib/notion/jalali';
import { exportBackup, type BackupFormat } from '@/lib/notion/backup';
import { isLockedErr } from '@/lib/notion/api';

export interface BackupDialogProps {
  /** ISO days that already have a backup (green ✓). */
  backedUpDays: Set<string>;
  /** ISO day → short label of the most recent backup covering it. */
  backupDates: Map<string, string>;
  /** Full history (newest first) for the small recent list. */
  backups: BackupRecord[];
  onClose: () => void;
  /** Called after a successful export + server record. */
  onExported: (days: string[], format: BackupFormat, count: number) => void;
}

function readPrimary(): Primary {
  if (typeof window === 'undefined') return 'jalali';
  try {
    const saved = localStorage.getItem('notion-cal-primary');
    if (saved === 'gregorian') return 'gregorian';
    if (saved === 'jalali') return 'jalali';
  } catch {
    /* ignore */
  }
  return 'jalali';
}

function expandRange(a: string, b: string): string[] {
  const [s, e] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  let cur = s;
  let guard = 0;
  while (cur <= e && guard < 1200) {
    out.push(cur);
    const d = new Date(cur + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    guard += 1;
  }
  return out;
}

export function BackupDialog(props: BackupDialogProps) {
  const { backedUpDays, backupDates, backups, onClose, onExported } = props;
  const lang = useLang();

  const [anchor, setAnchor] = useState<string>(() => todayIso());
  const [primary, setPrimary] = useState<Primary>(readPrimary);
  const [mode, setMode] = useState<'multi' | 'range'>('multi');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const [format, setFormat] = useState<BackupFormat>('pdf');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<null | 'generic' | 'session'>(null);
  const [empty, setEmpty] = useState(false);
  const [fallback, setFallback] = useState<{ url: string; kind: 'download' | 'print' } | null>(null);

  const today = todayIso();
  const cells = useMemo(() => buildMonthCells(anchor, primary), [anchor, primary]);
  const title = useMemo(() => monthTitle(anchor, primary, lang), [anchor, primary, lang]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const monthIsos = useMemo(() => {
    const s = new Set<string>();
    for (const c of cells) if (c.inMonth) s.add(c.iso);
    return s;
  }, [cells]);

  const toggleDay = (iso: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(iso)) n.delete(iso);
      else n.add(iso);
      return n;
    });
  };

  const onDayClick = (iso: string) => {
    if (mode === 'multi') {
      toggleDay(iso);
      return;
    }
    // range mode: first click = start, second click = commit the whole span
    if (!rangeAnchor) {
      setRangeAnchor(iso);
      return;
    }
    const span = expandRange(rangeAnchor, iso);
    setSelected((prev) => {
      const n = new Set(prev);
      for (const d of span) n.add(d);
      return n;
    });
    setRangeAnchor(null);
  };

  const previewSet = useMemo(() => {
    if (mode !== 'range' || !rangeAnchor || !hoverIso) return null;
    return new Set(expandRange(rangeAnchor, hoverIso));
  }, [mode, rangeAnchor, hoverIso]);

  const selectWholeMonth = () => {
    setSelected((prev) => {
      const n = new Set(prev);
      for (const iso of monthIsos) n.add(iso);
      return n;
    });
  };

  const days = useMemo(() => [...selected].sort(), [selected]);

  const doExport = async () => {
    if (!days.length || busy) return;
    setBusy(true);
    setFailed(null);
    setEmpty(false);
    setFallback(null);
    try {
      const r = await exportBackup(days, format, lang, primary);
      if (r.count === 0) {
        setEmpty(true);
        setBusy(false);
        return;
      }
      if (r.url) {
        setFallback({ url: r.url + (format === 'pdf' ? '&inline=1' : ''), kind: format === 'pdf' ? 'print' : 'download' });
      }
      await new Promise((res) => setTimeout(res, format === 'pdf' ? 400 : 150)); // let the print tab open
      onExported(days, format, r.count);
    } catch (e) {
      setFailed(isLockedErr(e) ? 'session' : 'generic');
    }
    setBusy(false);
  };

  const PrevIco = lang === 'fa' ? ChevronRight : ChevronLeft;
  const NextIco = lang === 'fa' ? ChevronLeft : ChevronRight;
  const wds = useMemo(
    () =>
      lang === 'fa'
        ? ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
        : ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'],
    [lang],
  );

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bk-modal">
        {/* header */}
        <div className="bk-head">
          <div className="bk-head-txt">
            <div className="bk-title">
              <ShieldCheck size={17} className="bk-title-ico" />
              {t('backup.title')}
            </div>
            <div className="bk-desc">{t('backup.desc')}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t('actions.close')}>
            <X size={16} />
          </button>
        </div>

        {/* mode + month nav */}
        <div className="bk-toolbar">
          <div className="bk-seg" role="group" aria-label={t('backup.title')}>
            <button className={`bk-seg-btn ${mode === 'multi' ? 'on' : ''}`} onClick={() => { setMode('multi'); setRangeAnchor(null); }}>
              {t('backup.modeMulti')}
            </button>
            <button className={`bk-seg-btn ${mode === 'range' ? 'on' : ''}`} onClick={() => { setMode('range'); setRangeAnchor(null); }}>
              <CalendarRange size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
              {t('backup.modeRange')}
            </button>
          </div>
          <div className="bk-nav">
            <button className="icon-btn" title={t('cal.prevMonth')} onClick={() => setAnchor((a) => shiftMonth(a, primary, -1))}>
              <PrevIco size={16} />
            </button>
            <button className="txt-btn" onClick={() => setAnchor(todayIso())}>
              {t('cal.today')}
            </button>
            <button className="icon-btn" title={t('cal.nextMonth')} onClick={() => setAnchor((a) => shiftMonth(a, primary, 1))}>
              <NextIco size={16} />
            </button>
          </div>
        </div>

        <div className="bk-month-title">
          <span className="bk-month-main">{title.main}</span>
          <span className="bk-month-sub">{title.sub}</span>
        </div>
        {mode === 'range' && <div className="bk-hint">{rangeAnchor ? t('backup.modeRange') + ' ✓' : t('backup.rangeHint')}</div>}

        {/* grid */}
        <div className="bk-grid">
          {wds.map((w) => (
            <div key={w} className="bk-wd">
              {w}
            </div>
          ))}
          {cells.map((c) => {
            const sel = selected.has(c.iso) || previewSet?.has(c.iso) || false;
            const isAnchor = rangeAnchor === c.iso;
            const done = backedUpDays.has(c.iso);
            const doneOn = backupDates.get(c.iso);
            const primaryNum = primary === 'jalali' ? c.jd : c.gd;
            const secondaryNum = primary === 'jalali' ? c.gd : c.jd;
            return (
              <button
                key={c.iso + primary}
                className={`bk-cell ${c.inMonth ? '' : 'dim'} ${sel ? 'sel' : ''} ${isAnchor ? 'anchor' : ''}`}
                onClick={() => onDayClick(c.iso)}
                onMouseEnter={() => setHoverIso(c.iso)}
                onMouseLeave={() => setHoverIso((h) => (h === c.iso ? null : h))}
                title={
                  dayLong(c.iso, lang, primary) +
                  (doneOn ? ' · ' + t('backup.backedUpOn', { date: doneOn }) : '')
                }
              >
                <span className={`bk-num ${c.iso === today ? 'today' : ''}`}>
                  {lang === 'fa' ? primaryNum.toLocaleString('fa-IR') : primaryNum}
                </span>
                <span className="bk-num2">
                  {lang === 'fa' ? secondaryNum.toLocaleString('fa-IR') : secondaryNum}
                </span>
                {done && (
                  <span className="bk-done" title={t('backup.backedUp')}>
                    <Check size={10} strokeWidth={3.5} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* selection actions */}
        <div className="bk-actions">
          <button className="txt-btn" onClick={selectWholeMonth}>
            {t('backup.selectMonth')}
          </button>
          <button className="txt-btn" onClick={() => { setSelected(new Set()); setRangeAnchor(null); }}>
            {t('backup.clear')}
          </button>
          <span className="bk-count">
            {days.length ? t('backup.selectedCount', { n: fmtNum(days.length) }) : t('backup.noneSelected')}
          </span>
        </div>

        {/* format + export */}
        <div className="bk-export">
          <div className="bk-seg bk-fmt" role="group" aria-label={t('backup.format')}>
            <button className={`bk-seg-btn ${format === 'pdf' ? 'on' : ''}`} onClick={() => setFormat('pdf')} title={t('backup.pdfHint')}>
              <Printer size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
              {t('backup.fmtPdf')}
            </button>
            <button className={`bk-seg-btn ${format === 'md' ? 'on' : ''}`} onClick={() => setFormat('md')}>
              <FileText size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
              {t('backup.fmtMd')}
            </button>
            <button className={`bk-seg-btn ${format === 'json' ? 'on' : ''}`} onClick={() => setFormat('json')}>
              <FileJson size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
              {t('backup.fmtJson')}
            </button>
            <button className={`bk-seg-btn ${format === 'zip' ? 'on' : ''}`} onClick={() => setFormat('zip')} title={t('backup.zipHint')}>
              <FolderDown size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
              {t('backup.fmtZip')}
            </button>
          </div>
          <button className="bk-export-btn" disabled={!days.length || busy} onClick={doExport}>
            {busy ? t('backup.exporting') : t('backup.export')}
          </button>
        </div>
        {format === 'pdf' && <div className="bk-pdf-hint">{t('backup.pdfHint')}</div>}
        {format === 'zip' && <div className="bk-pdf-hint">{t('backup.zipHint')}</div>}

        {/* status + download fallback */}
        {failed && <div className="bk-error">{failed === 'session' ? t('backup.sessionLost') : t('backup.exportFailed')}</div>}
        {!failed && empty && <div className="bk-info">{t('backup.emptyDays')}</div>}
        {fallback && (
          <a
            className="bk-fallback"
            href={fallback.url}
            target="_blank"
            rel="noreferrer"
          >
            {fallback.kind === 'print' ? t('backup.printBlocked') : t('backup.downloadAgain')}
          </a>
        )}

        {/* history */}
        <div className="bk-history">
          <div className="bk-history-title">{t('backup.history')}</div>
          {backups.length === 0 && <div className="bk-history-empty">{t('backup.noBackupsYet')}</div>}
          {backups.slice(0, 3).map((b) => {
            const when =
              lang === 'fa'
                ? new Date(b.createdAt).toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' })
                : new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const bDays: string[] = (() => {
              try {
                return JSON.parse(b.days) as string[];
              } catch {
                return [];
              }
            })();
            return (
              <div key={b.id} className="bk-history-row">
                <span className="bk-history-check">
                  <Check size={11} strokeWidth={3.5} />
                </span>
                <span className="bk-history-range">
                  {bDays.length === 1
                    ? dayLong(bDays[0], lang, primary)
                    : `${dayLong(bDays[0] || b.startDate, lang, primary)} — ${dayLong(bDays[bDays.length - 1] || b.endDate, lang, primary)}`}
                </span>
                <span className="bk-history-meta">
                  {b.format.toUpperCase()} · {t('day.notesTitle', { n: fmtNum(b.pageCount) })} · {when}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
