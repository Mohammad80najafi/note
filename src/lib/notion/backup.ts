/* ================================================================
   Backup export — the user selects days (single day or a range),
   we export exactly the notes attached to those days.
   Formats: JSON (data), Markdown (text), ZIP (one folder per day,
   one .md file per note), PDF (one folder per day, one print-ready
   file per note + a combined file — open → print dialog → "Save as
   PDF"; perfect Persian/RTL shaping via the browser).
   ================================================================ */

import { api } from './api';
import type { Block, Page } from './types';
import { dayLong, otherCalShort, jalaliOf, type Primary } from './jalali';

export type BackupFormat = 'pdf' | 'md' | 'json' | 'zip';

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

export function backupFileName(days: string[], ext: string, prefix = 'notion-backup'): string {
  const ds = [...days].sort();
  const span = ds.length === 1 ? ds[0] : `${ds[0]}_${ds[ds.length - 1]}`;
  return `${prefix}_${span}.${ext}`;
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
  /** Kept for compatibility; always false since the print-tab flow is gone. */
  popupBlocked: boolean;
  /** How the fallback link behaves: direct download or inline print page. */
  kind: 'download' | 'print';
}

/** App origin at build time — so exported files opened from disk can still load /api images. */
function pageOrigin(): string {
  try {
    return typeof window !== 'undefined' ? window.location.origin : '';
  } catch {
    return '';
  }
}

/** Editor block → simple print HTML (content already carries safe inline tags). */
function blockToHtml(b: Block, origin: string): string {
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
      if (!src) return '';
      // Relative /api/... URLs must become absolute, or they break when the
      // exported file is opened straight from disk (file://).
      const abs = /^(https?:|data:|blob:)/i.test(src) ? src : `${origin}${src.startsWith('/') ? '' : '/'}${src}`;
      return `<img src="${escapeHtml(abs)}"/>`;
    }
    case 'toggle': return c ? `<p>${c}</p>` : '';
    default: return c ? `<p>${c}</p>` : '';
  }
}

/** Shared print CSS for every exported document (cover, note cards, blocks). */
function printCss(lang: 'fa' | 'en'): string {
  return `
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
  @page { margin: 16mm 14mm; }`;
}

function htmlShell(head: { lang: 'fa' | 'en'; title: string }, body: string, css: string): string {
  const { lang, title } = head;
  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'fa' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap" rel="stylesheet"/>
<style>${css}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** Auto-fire the browser print dialog once the document has settled. */
function autoPrintScript(): string {
  return `<script>window.addEventListener('load',function(){setTimeout(function(){try{window.print()}catch(e){}},250)});</script>`;
}

/* ---------------- combined print document ---------------- */

/** Standalone, print-ready document: day sections → note cards → blocks. RTL-aware. */
export function buildExportHtml(
  days: string[],
  notes: ExportNote[],
  lang: 'fa' | 'en',
  primary: Primary,
  origin: string = pageOrigin(),
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
          const body = blocks.map((b) => blockToHtml(b, origin)).join('\n');
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

  const body = `
  <div class="cover">
    <h1>${lang === 'fa' ? 'پشتیبان یادداشت‌ها' : 'Notes Backup'}</h1>
    <div class="range">${escapeHtml(coverRange)}</div>
    <div class="meta">${notes.length} ${lang === 'fa' ? 'یادداشت' : notes.length === 1 ? 'note' : 'notes'} · ${lang === 'fa' ? 'تاریخ تهیه:' : 'Generated:'} ${generated}</div>
  </div>
  ${sections}`;
  return htmlShell({ lang, title: `Notion Backup — ${coverRange}` }, body, printCss(lang));
}

/** One note → one standalone print-ready document (its own cover + body). */
export function buildNoteHtml(
  page: Page,
  blocks: Block[],
  iso: string,
  lang: 'fa' | 'en',
  primary: Primary,
  origin: string = pageOrigin(),
): string {
  const title = page.title || (lang === 'fa' ? 'بدون عنوان' : 'Untitled');
  const body = blocks.map((b) => blockToHtml(b, origin)).join('\n');
  const doc = `
  <div class="cover">
    <h1>${page.icon ? `${escapeHtml(page.icon)} ` : ''}${escapeHtml(title)}</h1>
    <div class="range">${dayLong(iso, lang, primary)}</div>
    <div class="meta">${otherCalShort(iso, lang, primary)}</div>
  </div>
  <section class="note">
    <div class="note-body">${body || (lang === 'fa' ? '<p class="empty">خالی</p>' : '<p class="empty">Empty</p>')}</div>
  </section>`;
  return htmlShell({ lang, title }, doc, printCss(lang));
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

/* ---------------- ZIP folder backup (one folder per day, one .md per note) ---------------- */

/** Filesystem-safe name: strips Windows-forbidden chars, trims, caps length. */
function fsSafeName(s: string, fallback: string): string {
  const cleaned = s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  const cut = cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
  return cut || fallback;
}

/** Jalali YYYY-MM-DD (Latin digits, sortable) for day folder names. */
function jalaliFolder(iso: string): string {
  const { jy, jm, jd } = jalaliOf(iso);
  return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
}

/** One note → one standalone Markdown file (title, dated header, blocks). */
function noteToFile(
  page: Page,
  blocks: Block[],
  iso: string,
  lang: 'fa' | 'en',
  primary: Primary,
): string {
  const title = page.title || (lang === 'fa' ? 'بدون عنوان' : 'Untitled');
  const lines: string[] = [];
  lines.push(`# ${page.icon ? page.icon + ' ' : ''}${title}`.trimEnd());
  lines.push('');
  lines.push(`> ${dayLong(iso, lang, primary)} · ${otherCalShort(iso, lang, primary)}`);
  lines.push('');
  let had = false;
  for (const b of blocks) {
    const line = blockToMarkdown(b);
    if (line) {
      lines.push(line);
      lines.push('');
      had = true;
    }
  }
  if (!had) {
    lines.push(lang === 'fa' ? '_خالی_' : '_Empty_');
    lines.push('');
  }
  return lines.join('\n');
}

/** Shared: group notes by their ISO day. */
function groupByDay(notes: ExportNote[]): Map<string, ExportNote[]> {
  const byDay = new Map<string, ExportNote[]>();
  for (const n of notes) {
    const key = n.page.date || '';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(n);
  }
  return byDay;
}

async function exportZipBackup(
  days: string[],
  notes: ExportNote[],
  lang: 'fa' | 'en',
  primary: Primary,
): Promise<ExportResult> {
  const ds = [...days].sort();
  const byDay = groupByDay(notes);

  const dayFolder = (iso: string) =>
    primary === 'gregorian' ? iso : jalaliFolder(iso);

  const root = fsSafeName(
    ds.length === 1
      ? lang === 'fa'
        ? `پشتیبان ${dayFolder(ds[0])}`
        : `backup-${dayFolder(ds[0])}`
      : lang === 'fa'
        ? `پشتیبان ${dayFolder(ds[0])} تا ${dayFolder(ds[ds.length - 1])}`
        : `backup-${dayFolder(ds[0])}-to-${dayFolder(ds[ds.length - 1])}`,
    'notion-backup',
  );

  const files: { path: string; content: string }[] = [];
  const indexLines: string[] = [lang === 'fa' ? '# پشتیبان یادداشت‌ها' : '# Notes Backup', ''];
  indexLines.push(
    lang === 'fa'
      ? `بازه: \`${ds[0]}\` تا \`${ds[ds.length - 1]}\``
      : `Range: \`${ds[0]}\` → \`${ds[ds.length - 1]}\``,
  );
  indexLines.push('');

  for (const iso of ds) {
    const list = byDay.get(iso) || [];
    if (!list.length) continue;
    const folder = dayFolder(iso);
    indexLines.push(
      `- \`${folder}/\` — ${list.length} ${lang === 'fa' ? (list.length === 1 ? 'یادداشت' : 'یادداشت') : list.length === 1 ? 'note' : 'notes'}`,
    );
    const used = new Map<string, number>();
    for (const { page, blocks } of list) {
      const base = fsSafeName(
        page.title || (lang === 'fa' ? 'بی‌عنوان' : 'Untitled'),
        lang === 'fa' ? 'بی‌عنوان' : 'Untitled',
      );
      const n = (used.get(base) || 0) + 1;
      used.set(base, n);
      const fname = n === 1 ? `${base}.md` : `${base} (${n}).md`;
      files.push({
        path: `${root}/${folder}/${fname}`,
        content: noteToFile(page, blocks, iso, lang, primary),
      });
    }
  }
  files.push({
    path: `${root}/${lang === 'fa' ? 'فهرست' : 'index'}.md`,
    content: indexLines.join('\n'),
  });

  const name = backupFileName(days, 'zip');
  const { url: relay } = await api.createZipExport({ filename: name, files });
  return downloadViaRelay(relay, name, notes.length);
}

/* ---------------- PDF backup (one folder per day, one print-ready file per note) ----------------

   Same foldered structure as the ZIP backup, but every note is a standalone,
   print-ready document: open it and the browser print dialog opens
   automatically → "Save as PDF" → one PDF file per note with perfect
   Persian/RTL shaping. A combined file for the whole range is included too.

-------------------------------------------------------------------------------- */

async function exportPdfBackup(
  days: string[],
  notes: ExportNote[],
  lang: 'fa' | 'en',
  primary: Primary,
): Promise<ExportResult> {
  const ds = [...days].sort();
  const byDay = groupByDay(notes);
  const origin = pageOrigin();
  const script = autoPrintScript();

  const dayFolder = (iso: string) =>
    primary === 'gregorian' ? iso : jalaliFolder(iso);

  const root = fsSafeName(
    ds.length === 1
      ? lang === 'fa'
        ? `پشتیبان PDF ${dayFolder(ds[0])}`
        : `PDF backup ${dayFolder(ds[0])}`
      : lang === 'fa'
        ? `پشتیبان PDF ${dayFolder(ds[0])} تا ${dayFolder(ds[ds.length - 1])}`
        : `PDF backup ${dayFolder(ds[0])} to ${dayFolder(ds[ds.length - 1])}`,
    'pdf-backup',
  );

  const files: { path: string; content: string }[] = [];
  const indexLines: string[] = [lang === 'fa' ? '# پشتیبان PDF یادداشت‌ها' : '# Notes PDF Backup', ''];
  indexLines.push(
    lang === 'fa'
      ? 'هر یادداشت یک فایل HTML آمادهٔ چاپ است؛ فایل را باز کنید و در پنجرهٔ چاپ، مقصد را «Save as PDF» بگذارید. فایل «همه یادداشت ها» هم کل بازه را یکجا چاپ می‌کند.'
      : 'Each note is a print-ready HTML file — open it and pick "Save as PDF" in the print dialog. The "all notes" file prints the whole range at once.',
  );
  indexLines.push('');
  indexLines.push(
    lang === 'fa'
      ? `بازه: \`${ds[0]}\` تا \`${ds[ds.length - 1]}\``
      : `Range: \`${ds[0]}\` → \`${ds[ds.length - 1]}\``,
  );
  indexLines.push('');

  for (const iso of ds) {
    const list = byDay.get(iso) || [];
    if (!list.length) continue;
    const folder = dayFolder(iso);
    indexLines.push(
      `- \`${folder}/\` — ${list.length} ${lang === 'fa' ? 'یادداشت' : list.length === 1 ? 'note' : 'notes'}`,
    );
    const used = new Map<string, number>();
    for (const { page, blocks } of list) {
      const base = fsSafeName(
        page.title || (lang === 'fa' ? 'بی‌عنوان' : 'Untitled'),
        lang === 'fa' ? 'بی‌عنوان' : 'Untitled',
      );
      const n = (used.get(base) || 0) + 1;
      used.set(base, n);
      const fname = n === 1 ? `${base}.html` : `${base} (${n}).html`;
      const html = buildNoteHtml(page, blocks, iso, lang, primary, origin).replace(
        '</body>',
        `${script}\n</body>`,
      );
      files.push({ path: `${root}/${folder}/${fname}`, content: html });
    }
  }

  // combined document → one PDF for the whole range, if preferred
  const combinedName = lang === 'fa' ? 'همه یادداشت ها' : 'all-notes';
  files.push({
    path: `${root}/${combinedName}.html`,
    content: buildExportHtml(days, notes, lang, primary, origin).replace('</body>', `${script}\n</body>`),
  });
  files.push({
    path: `${root}/${lang === 'fa' ? 'فهرست' : 'index'}.md`,
    content: indexLines.join('\n'),
  });

  const name = backupFileName(days, 'zip', 'notion-pdf-backup');
  const { url: relay } = await api.createZipExport({ filename: name, files });
  return downloadViaRelay(relay, name, notes.length);
}

/** Same-origin relay with Content-Disposition → a real, reliable download. */
function downloadViaRelay(relay: string, name: string, count: number): ExportResult {
  const sep = relay.includes('?') ? '&' : '?';
  const url = `${relay}${sep}XTransformPort=3030`;
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { count, url, popupBlocked: false, kind: 'download' };
}

/* ---------------- the three exports ---------------- */

export async function exportBackup(
  days: string[],
  format: BackupFormat,
  lang: 'fa' | 'en',
  primary: Primary,
): Promise<ExportResult> {
  const notes = await collectNotes(days);
  if (notes.length === 0) return { count: 0, url: null, popupBlocked: false, kind: 'download' };

  if (format === 'pdf') return exportPdfBackup(days, notes, lang, primary);

  if (format === 'zip') return exportZipBackup(days, notes, lang, primary);

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
    return { count: notes.length, url, popupBlocked: false, kind: 'download' };
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
    return { count: notes.length, url, popupBlocked: false, kind: 'download' };
  }

  return exportPdfBackup(days, notes, lang, primary);
}
