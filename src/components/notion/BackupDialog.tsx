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
  FileDown,
  CloudUpload,
  CloudDownload,
  Eye,
  EyeOff,
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
import {
  ghPush,
  ghPullAndRestore,
  ghTest,
  loadGhSettings,
  saveGhSettings,
  clearGhSettings,
  defaultGhSettings,
  type GhSettings,
} from '@/lib/notion/gh';

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

type CloudBusy = null | 'push' | 'restore' | 'test';
type CloudStatus = { kind: 'ok' | 'err' | 'info'; text: string; link?: string } | null;

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

function shortWhen(ts: number, lang: string): string {
  try {
    return new Date(ts).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Map a gh.ts error to a friendly localized message. */
function ghErrText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('no snapshot')) return t('gh.noSnapshot');
  if (msg.includes('corrupt')) return t('gh.corrupt');
  if (msg.includes('auth')) return t('gh.authFail');
  if (msg.includes('rate')) return t('gh.rateLimit');
  if (msg.includes('network')) return t('gh.networkFail');
  return t('gh.fail');
}

export function BackupDialog(props: BackupDialogProps) {
  const { backedUpDays, backupDates, backups, onClose, onExported } = props;
  const lang = useLang();

  const [view, setView] = useState<'file' | 'cloud'>('file');

  /* ---------------- file-export state (unchanged) ---------------- */
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

  /* ---------------- cloud sync state ---------------- */
  const [cfg, setCfg] = useState<GhSettings>(() => defaultGhSettings());
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [cloudBusy, setCloudBusy] = useState<CloudBusy>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const today = todayIso();
  const cells = useMemo(() => buildMonthCells(anchor, primary), [anchor, primary]);
  const title = useMemo(() => monthTitle(anchor, primary, lang), [anchor, primary, lang]);

  // localStorage is browser-only: lazy-load when the cloud tab is first opened
  const openCloudTab = () => {
    if (!cfgLoaded) {
      setCfg(loadGhSettings());
      setCfgLoaded(true);
    }
    setView('cloud');
  };

  useEffect(() => {
    if (cfgLoaded) saveGhSettings(cfg);
  }, [cfg, cfgLoaded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* ---------------- file-export handlers (unchanged) ---------------- */

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
      if (r.url) setFallback({ url: r.url, kind: r.kind });
      await new Promise((res) => setTimeout(res, 150)); // let the download start
      onExported(days, format, r.count);
    } catch (e) {
      setFailed(isLockedErr(e) ? 'session' : 'generic');
    }
    setBusy(false);
  };

  /* ---------------- cloud sync handlers ---------------- */

  const cfgReady = cfg.repo.trim().length > 3 && cfg.token.trim().length > 10;

  const doPush = async () => {
    if (cloudBusy) return;
    if (!cfgReady) {
      setCloudStatus({ kind: 'info', text: t('gh.notConfigured') });
      return;
    }
    setCloudBusy('push');
    setCloudStatus({ kind: 'info', text: t('gh.pushing') });
    try {
      const r = await ghPush(cfg);
      setCfg((c) => ({ ...c, lastPushAt: Date.now() }));
      setCloudStatus({ kind: 'ok', text: t('gh.pushed', { n: fmtNum(r.pages), b: fmtNum(r.blocks) }), link: r.htmlUrl });
    } catch (e) {
      setCloudStatus({ kind: 'err', text: ghErrText(e) });
    }
    setCloudBusy(null);
  };

  const doRestore = async () => {
    if (cloudBusy) return;
    if (!cfgReady) {
      setCloudStatus({ kind: 'info', text: t('gh.notConfigured') });
      return;
    }
    // first click = show the scary confirmation, second = actually do it
    if (!confirmRestore) {
      setConfirmRestore(true);
      return;
    }
    setCloudBusy('restore');
    setConfirmRestore(false);
    setCloudStatus({ kind: 'info', text: t('gh.restoring') });
    try {
      const r = await ghPullAndRestore(cfg);
      setCfg((c) => ({ ...c, lastPullAt: Date.now() }));
      setCloudStatus({ kind: 'ok', text: t('gh.restored', { n: fmtNum(r.pages), b: fmtNum(r.blocks) }) });
      setTimeout(() => window.location.reload(), 1300);
    } catch (e) {
      setCloudStatus({ kind: 'err', text: ghErrText(e) });
      setCloudBusy(null);
    }
  };

  const doTest = async () => {
    if (cloudBusy) return;
    if (!cfgReady) {
      setCloudStatus({ kind: 'info', text: t('gh.notConfigured') });
      return;
    }
    setCloudBusy('test');
    setCloudStatus(null);
    try {
      const r = await ghTest(cfg);
      setCloudStatus({ kind: 'ok', text: r.repoExists ? t('gh.testOk') : t('gh.testOkCreate') });
    } catch (e) {
      setCloudStatus({ kind: 'err', text: ghErrText(e) });
    }
    setCloudBusy(null);
  };

  const doForget = () => {
    clearGhSettings();
    setCfg(defaultGhSettings());
    setCloudStatus(null);
    setConfirmRestore(false);
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
              {view === 'cloud' ? t('gh.title') : t('backup.title')}
            </div>
            <div className="bk-desc">{view === 'cloud' ? t('gh.desc') : t('backup.desc')}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t('actions.close')}>
            <X size={16} />
          </button>
        </div>

        {/* tabs */}
        <div className="bk-tabs">
          <div className="bk-seg" role="tablist">
            <button
              className={`bk-seg-btn ${view === 'file' ? 'on' : ''}`}
              onClick={() => setView('file')}
              role="tab"
              aria-selected={view === 'file'}
            >
              <FileDown size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
              {t('gh.tabFile')}
            </button>
            <button
              className={`bk-seg-btn ${view === 'cloud' ? 'on' : ''}`}
              onClick={openCloudTab}
              role="tab"
              aria-selected={view === 'cloud'}
            >
              <CloudUpload size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
              {t('gh.tab')}
            </button>
          </div>
        </div>

        {view === 'file' && (
          <>
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
          </>
        )}

        {view === 'cloud' && (
          <div className="gh-panel">
            {/* status line */}
            <div className="gh-status">
              <span className={`gh-dot ${cfgReady ? 'on' : ''}`} />
              {cfgReady ? (
                <span>
                  {t('gh.configured')} <bdi style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{cfg.repo}</bdi>
                </span>
              ) : (
                <span>{t('gh.notConfigured')}</span>
              )}
            </div>

            {(cfg.lastPushAt || cfg.lastPullAt) && (
              <div className="gh-last">
                <span>
                  {t('gh.lastPush')}: {cfg.lastPushAt ? shortWhen(cfg.lastPushAt, lang) : t('gh.never')}
                </span>
                <span>
                  {t('gh.lastPull')}: {cfg.lastPullAt ? shortWhen(cfg.lastPullAt, lang) : t('gh.never')}
                </span>
              </div>
            )}

            {/* settings fields */}
            <div className="gh-fields">
              <div className="gh-field">
                <label className="gh-label" htmlFor="gh-repo">{t('gh.repo')}</label>
                <input
                  id="gh-repo"
                  className="gh-input"
                  dir="ltr"
                  placeholder={t('gh.repoPh')}
                  value={cfg.repo}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setCfg((c) => ({ ...c, repo: e.target.value }))}
                />
              </div>
              <div className="gh-field">
                <label className="gh-label" htmlFor="gh-token">{t('gh.token')}</label>
                <div className="gh-inputwrap">
                  <input
                    id="gh-token"
                    className="gh-input"
                    dir="ltr"
                    type={showToken ? 'text' : 'password'}
                    placeholder={t('gh.tokenPh')}
                    value={cfg.token}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setCfg((c) => ({ ...c, token: e.target.value.trim() }))}
                  />
                  <button
                    type="button"
                    className="gh-eye"
                    onClick={() => setShowToken((s) => !s)}
                    aria-label={showToken ? 'hide' : 'show'}
                  >
                    {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="gh-row">
                <div className="gh-field">
                  <label className="gh-label" htmlFor="gh-branch">{t('gh.branch')}</label>
                  <input
                    id="gh-branch"
                    className="gh-input"
                    dir="ltr"
                    value={cfg.branch}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setCfg((c) => ({ ...c, branch: e.target.value.trim() || 'main' }))}
                  />
                </div>
                <div className="gh-field">
                  <label className="gh-label" htmlFor="gh-path">{t('gh.path')}</label>
                  <input
                    id="gh-path"
                    className="gh-input"
                    dir="ltr"
                    value={cfg.path}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setCfg((c) => ({ ...c, path: e.target.value.trim() || 'notion-data.json' }))}
                  />
                </div>
              </div>
            </div>

            {/* actions */}
            <div className="gh-btns">
              <button className="bk-export-btn" disabled={cloudBusy !== null} onClick={doPush}>
                <CloudUpload size={14} style={{ verticalAlign: '-2px', marginInlineEnd: 5 }} />
                {cloudBusy === 'push' ? t('gh.pushing') : t('gh.push')}
              </button>
              <button
                className={`gh-btn ${confirmRestore ? 'danger' : ''}`}
                disabled={cloudBusy !== null}
                onClick={doRestore}
              >
                <CloudDownload size={14} style={{ verticalAlign: '-2px', marginInlineEnd: 5 }} />
                {cloudBusy === 'restore' ? t('gh.restoring') : t('gh.restore')}
              </button>
              <button className="txt-btn" disabled={cloudBusy !== null} onClick={doTest}>
                {t('gh.test')}
              </button>
              {(cfg.repo || cfg.token) && (
                <button className="txt-btn gh-forget" disabled={cloudBusy !== null} onClick={doForget}>
                  {t('gh.forget')}
                </button>
              )}
            </div>

            {/* restore confirmation */}
            {confirmRestore && (
              <div className="gh-confirm">
                <div className="gh-confirm-text">{t('gh.restoreConfirm')}</div>
                <div className="gh-confirm-btns">
                  <button className="gh-btn danger" disabled={cloudBusy !== null} onClick={doRestore}>
                    {t('gh.restoreYes')}
                  </button>
                  <button className="txt-btn" onClick={() => setConfirmRestore(false)}>
                    {t('lock.cancel')}
                  </button>
                </div>
              </div>
            )}

            {/* status / result */}
            {cloudStatus && (
              <div className={cloudStatus.kind === 'ok' ? 'bk-info gh-ok' : cloudStatus.kind === 'err' ? 'bk-error' : 'bk-info'}>
                {cloudStatus.text}
                {cloudStatus.link && (
                  <>
                    {' · '}
                    <a className="gh-link" href={cloudStatus.link} target="_blank" rel="noreferrer">
                      {t('gh.viewOnGithub')}
                    </a>
                  </>
                )}
              </div>
            )}

            {/* hints */}
            <div className="gh-hint">
              {t('gh.autoCreateHint')}
              <br />
              {t('gh.tokenHint')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
