/* ================================================================
   Backup export — the user selects days (single day or a range),
   we export exactly the notes attached to those days.
   Formats: JSON (data), Markdown (text), PDF (via browser print —
   perfect Persian/RTL shaping, "Save as PDF" in the print dialog).
   ================================================================ */

import { api } from './api';
import type { Block, Page } from './types';
import { dayLong, otherCalShort, type Primary } from './jalali';

export type BackupFormat = 'pdf' | 'md' | 'json';

export interface ExportNote {
  page: Page;
  blocks: Block[];
}

/* ---------------- collection ---------------- */

/** All live notes whose `date` is one of the given ISO days (sorted by day, then position). */
export async function collectNotes(days: string[]): Promise<ExportNote[]> {
  const set = new Set(days);
  const { pages } = await api.listPages();
  const inRange = pages.filter((p) => !p.isTrashed && p.date && set.has(p.date));
  inRange.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.position - b.position);
  const notes: ExportNote[] = [];
  for (const p of inRange) {
    try {
      const full = await api.getPage(p.id);
      notes.push({ page: p, blocks: full.blocks });
    } catch {
      /* skip notes that fail to load */
    }
  }
  return notes;
}

/* ---------------- small helpers ---------------- */

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function metaOf(b: Block): Record<string, unknown> {
  try {
    return JSON.parse(b.meta || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function backupFileName(days: string[], ext: string): string {
  const ds = [...days].sort();
  const span = ds.length === 1 ? ds[0] : `${ds[0]}_${ds[ds.length - 1]}`;
  return `notion-backup_${span}.${ext}`;
}

function download(filename: string, mime: string, data: string): void {
  const blob = new Blob([data], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Store the export on the server and return a real download URL.
 * This is the robust path: a same-origin URL with Content-Disposition works
 * even where blob downloads / print() / popups are blocked (embedded views).
 * Returns null if the server relay is unavailable.
 */
async function storeOnServer(filename: string, mime: string, data: string): Promise<string | null> {
  try {
    const { url } = await api.createExport({ filename, mime, content: data });
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}XTransformPort=3030`;
  } catch {
    return null;
  }
}

export interface ExportResult {
  /** Notes actually exported. */
  count: number;
  /** Same-origin fallback URL (download / print page); null if the relay failed. */
  url: string | null;
  /** PDF: true when the print tab was blocked by a popup blocker. */
  popupBlocked: boolean;
}

/** Editor block → simple print HTML (content already carries safe inline tags). */
function blockToHtml(b: Block): string {
  const c = b.content;
  switch (b.type) {
    case 'heading_1': return `<h1>${c}</h1>`;
    case 'heading_2': return `<h2>${c}</h2>`;
    case 'heading_3': return `<h3>${c}</h3>`;
    case 'bulleted': return `<ul><li>${c}</li></ul>`;
    case 'numbered': return `<ol><li>${c}</li></ol>`;
    case 'todo':
      return `<div class="todo"><span class="box${b.checked ? ' on' : ''}"></span><span class="${b.checked ? 'done' : ''}">${c}</span></div>`;
    case 'quote': return `<blockquote>${c}</blockquote>`;
    case 'callout': {
      const emoji = String(metaOf(b).emoji || '💡');
      return `<div class="callout"><span class="ce">${emoji}</span><div>${c}</div></div>`;
    }
    case 'code': return `<pre class="code">${escapeHtml(c)}</pre>`;
    case 'divider': return '<hr/>';
    case 'image': {
      const src = String(metaOf(b).src || metaOf(b).url || '');
      return src ? `<img src="${escapeHtml(src)}"/>` : '';
    }
    case 'toggle': return c ? `<p>${c}</p>` : '';
    default: return c ? `<p>${c}</p>` : '';
  }
}

/* ---------------- PDF (new-tab print page) ---------------- */

/** Standalone, print-ready document: day sections → note cards → blocks. RTL-aware. */
export function buildExportHtml(
  days: string[],
  notes: ExportNote[],
  lang: 'fa' | 'en',
  primary: Primary,
): string {
  const ds = [...days].sort();
  const byDay = new Map<string, ExportNote[]>();
  for (const n of notes) {
    const key = n.page.date || '';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(n);
  }

  const sections = ds
    .map((iso) => {
      const list = byDay.get(iso) || [];
      const cards = list
        .map(({ page, blocks }) => {
          const body = blocks.map(blockToHtml).join('\n');
          return `
          <section class="note">
            <div class="note-head">
              <span class="note-ico">${page.icon || '📄'}</span>
              <span class="note-title">${escapeHtml(page.title || (lang === 'fa' ? 'بدون عنوان' : 'Untitled'))}</span>
              <span class="note-date">${otherCalShort(iso, lang, primary)}</span>
            </div>
            <div class="note-body">${body || (lang === 'fa' ? '<p class="empty">خالی</p>' : '<p class="empty">Empty</p>')}</div>
          </section>`;
        })
        .join('\n');
      return `
        <div class="day">
          <div class="day-title">${dayLong(iso, lang, primary)}</div>
          <div class="day-sub">${otherCalShort(iso, lang, primary)} · ${list.length} ${lang === 'fa' ? 'یادداشت' : list.length === 1 ? 'note' : 'notes'}</div>
          ${cards || (lang === 'fa' ? '<div class="day-empty">بدون یادداشت</div>' : '<div class="day-empty">No notes</div>')}
        </div>`;
    })
    .join('\n');

  const generated =
    lang === 'fa'
      ? new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const coverRange =
    ds.length === 1 ? dayLong(ds[0], lang, primary) : `${dayLong(ds[0], lang, primary)} — ${dayLong(ds[ds.length - 1], lang, primary)}`;

  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'fa' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8"/>
<title>Notion Backup — ${escapeHtml(coverRange)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: ${lang === 'fa' ? "'Vazirmatn', Tahoma" : 'Helvetica, Arial'}, sans-serif;
    color: #37352f; margin: 0; padding: 40px 44px; font-size: 13px; line-height: 1.7;
  }
  .cover { border-bottom: 2.5px solid #37352f; padding-bottom: 18px; margin-bottom: 26px; }
  .cover h1 { font-size: 24px; margin: 0 0 6px; }
  .cover .range { font-size: 15px; font-weight: 600; }
  .cover .meta { color: rgba(55,53,47,.55); font-size: 11.5px; margin-top: 8px; }
  .day { margin-bottom: 30px; page-break-inside: avoid; }
  .day-title { font-size: 17px; font-weight: 700; border-bottom: 1px solid rgba(55,53,47,.15); padding-bottom: 6px; margin-bottom: 2px; }
  .day-sub { font-size: 11px; color: rgba(55,53,47,.5); margin-bottom: 12px; }
  .day-empty { color: rgba(55,53,47,.4); font-size: 12px; padding: 8px 0 16px; }
  .note {
    border: 1px solid rgba(55,53,47,.16); border-radius: 6px;
    padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid;
  }
  .note-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
  .note-ico { font-size: 15px; }
  .note-title { font-weight: 700; font-size: 14px; }
  .note-date { margin-inline-start: auto; font-size: 10.5px; color: rgba(55,53,47,.5); white-space: nowrap; }
  .note-body h1 { font-size: 19px; margin: 10px 0 4px; }
  .note-body h2 { font-size: 16px; margin: 8px 0 4px; }
  .note-body h3 { font-size: 14px; margin: 6px 0 3px; }
  .note-body p { margin: 3px 0; }
  .note-body ul, .note-body ol { margin: 3px 0; padding-inline-start: 22px; }
  .note-body blockquote { border-inline-start: 3px solid #37352f; margin: 6px 0; padding: 2px 12px; }
  .note-body .callout { background: rgba(55,53,47,.05); border-radius: 4px; padding: 8px 10px; margin: 6px 0; display: flex; gap: 8px; }
  .note-body pre.code {
    background: #f7f6f3; border-radius: 4px; padding: 10px 12px; overflow-x: auto;
    font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11.5px; direction: ltr; text-align: left;
  }
  .note-body .todo { display: flex; gap: 7px; margin: 3px 0; align-items: baseline; }
  .note-body .box { width: 11px; height: 11px; border: 1.4px solid rgba(55,53,47,.55); border-radius: 2.5px; flex-shrink: 0; display: inline-block; }
  .note-body .box.on { background: #2383e2; border-color: #2383e2; }
  .note-body .done { color: rgba(55,53,47,.45); text-decoration: line-through; }
  .note-body hr { border: none; border-top: 1px solid rgba(55,53,47,.15); margin: 8px 0; }
  .note-body img { max-width: 100%; }
  .empty { color: rgba(55,53,47,.4); font-style: italic; }
  @page { margin: 16mm 14mm; }
</style>
</head>
<body>
  <div class="cover">
    <h1>${lang === 'fa' ? 'پشتیبان یادداشت‌ها' : 'Notes Backup'}</h1>
    <div class="range">${escapeHtml(coverRange)}</div>
    <div class="meta">${notes.length} ${lang === 'fa' ? 'یادداشت' : notes.length === 1 ? 'note' : 'notes'} · ${lang === 'fa' ? 'تاریخ تهیه:' : 'Generated:'} ${generated}</div>
  </div>
  ${sections}
</body>
</html>`;
}

/* ---------------- Markdown ---------------- */

function blockToMarkdown(b: Block): string {
  const text = stripHtml(b.content);
  switch (b.type) {
    case 'heading_1': return `# ${text}`;
    case 'heading_2': return `## ${text}`;
    case 'heading_3': return `### ${text}`;
    case 'bulleted': return `- ${text}`;
    case 'numbered': return `1. ${text}`;
    case 'todo': return `- [${b.checked ? 'x' : ' '}] ${text}`;
    case 'quote': return `> ${text}`;
    case 'callout': return `> ${text}`;
    case 'code': return '```\n' + b.content + '\n```';
    case 'divider': return '---';
    case 'image': {
      const m = metaOf(b);
      const src = String(m.src || m.url || '');
      return src ? `![image](${src})` : '';
    }
    default: return text;
  }
}

/* ---------------- the three exports ---------------- */

export async function exportBackup(
  days: string[],
  format: BackupFormat,
  lang: 'fa' | 'en',
  primary: Primary,
): Promise<ExportResult> {
  const notes = await collectNotes(days);
  if (notes.length === 0) return { count: 0, url: null, popupBlocked: false };

  if (format === 'json') {
    const payload = {
      app: 'notion-clone-calendar',
      kind: 'backup',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      days: [...days].sort(),
      notes: notes.map(({ page, blocks }) => ({ page, blocks })),
    };
    const data = JSON.stringify(payload, null, 2);
    const name = backupFileName(days, 'json');
    download(name, 'application/json', data);
    const url = await storeOnServer(name, 'application/json', data);
    return { count: notes.length, url, popupBlocked: false };
  }

  if (format === 'md') {
    const ds = [...days].sort();
    const byDay = new Map<string, ExportNote[]>();
    for (const n of notes) {
      const key = n.page.date || '';
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(n);
    }
    const parts: string[] = [];
    parts.push(lang === 'fa' ? '# پشتیبان یادداشت‌ها' : '# Notes Backup');
    parts.push('');
    parts.push(lang === 'fa' ? `بازه: \`${ds[0]}\` تا \`${ds[ds.length - 1]}\`` : `Range: \`${ds[0]}\` → \`${ds[ds.length - 1]}\``);
    parts.push('');
    for (const iso of ds) {
      const list = byDay.get(iso) || [];
      parts.push(`## ${dayLong(iso, lang, primary)}`);
      parts.push('');
      if (!list.length) {
        parts.push(lang === 'fa' ? '_بدون یادداشت_' : '_No notes_');
        parts.push('');
        continue;
      }
      for (const { page, blocks } of list) {
        parts.push(`### ${page.icon || ''} ${page.title || (lang === 'fa' ? 'بدون عنوان' : 'Untitled')}`.trimEnd());
        parts.push('');
        for (const b of blocks) {
          const line = blockToMarkdown(b);
          if (line) {
            parts.push(line);
            parts.push('');
          }
        }
      }
    }
    const data = parts.join('\n');
    const name = backupFileName(days, 'md');
    download(name, 'text/markdown', data);
    const url = await storeOnServer(name, 'text/markdown', data);
    return { count: notes.length, url, popupBlocked: false };
  }

  // PDF → open the print-ready document as a TOP-LEVEL tab (print() is
  // ignored inside cross-origin/embedded frames; a real tab always works).
  const script = `<script>window.addEventListener('load',function(){setTimeout(function(){try{window.print()}catch(e){}},250)});</script>`;
  const html = buildExportHtml(days, notes, lang, primary).replace('</body>', `${script}\n</body>`);
  const name = backupFileName(days, 'html');
  const url = await storeOnServer(name, 'text/html', html);
  if (!url) return { count: notes.length, url: null, popupBlocked: true };
  const win = window.open(`${url}&inline=1`, '_blank', 'noopener');
  return { count: notes.length, url, popupBlocked: !win };
}
