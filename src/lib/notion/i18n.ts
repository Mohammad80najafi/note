'use client';

import { useSyncExternalStore } from 'react';

/* ================================================================
   Bilingual UI dictionary (English / فارسی) + RTL plumbing.
   Default language is Persian; the choice is persisted in
   localStorage ("notion-lang") and applied to <html> on mount.
   ================================================================ */

export type Lang = 'en' | 'fa';

type Dict = Record<string, string>;

const en: Dict = {
  'app.title': 'My Notion',
  'loading': 'Loading…',
  'selectPage': 'Select a page',
  'defaultPageTitle': 'Getting Started',

  'sidebar.search': 'Search',
  'sidebar.home': 'Home',
  'sidebar.calendar': 'Calendar',
  'sidebar.favorites': 'Favorites',
  'sidebar.private': 'Private',
  'sidebar.newPage': 'New page',
  'sidebar.trash': 'Trash',
  'sidebar.language': 'Language',
  'sidebar.builtWith': 'Built with',
  'sidebar.addInside': 'Add a page inside',
  'sidebar.moreOptions': 'More options',
  'sidebar.addPage': 'Add a page',
  'sidebar.expand': 'Expand',
  'sidebar.closeSidebar': 'Close sidebar',
  'sidebar.openSidebar': 'Open sidebar',
  'sidebar.dark': 'Dark mode',
  'sidebar.light': 'Light mode',
  'sidebar.untitled': 'Untitled',

  'sidebar.pinned': 'Selected notes',
  'sidebar.pinnedEmpty': 'No note selected yet',
  'sidebar.pinnedEmptyHint': 'Pin notes from the calendar (hover a note → pin) or from the note ⋮ menu, and they will appear here.',
  'sidebar.pin': 'Pin to sidebar',
  'sidebar.unpin': 'Unpin',
  'sidebar.backup': 'Backup',

  'day.back': 'Back to calendar',
  'day.prevDay': 'Previous day',
  'day.nextDay': 'Next day',
  'day.notesTitle': '{n} notes',
  'day.backedUp': 'Backed up',

  'backup.title': 'Backup notes',
  'backup.desc': 'Pick single days or a whole range — then export the notes of exactly those days.',
  'backup.modeMulti': 'Multi-select',
  'backup.modeRange': 'Range',
  'backup.rangeHint': 'Range: click the first day, then the last day.',
  'backup.selectMonth': 'Whole month',
  'backup.clear': 'Clear',
  'backup.selectedCount': '{n} days selected',
  'backup.noneSelected': 'No day selected yet',
  'backup.format': 'Format',
  'backup.fmtPdf': 'PDF',
  'backup.fmtMd': 'Markdown',
  'backup.fmtJson': 'JSON',
  'backup.export': 'Export backup',
  'backup.done': 'Backup taken — {n} notes',
  'backup.emptyRange': 'The selected days contain no notes',
  'backup.backedUp': 'Backed up before',
  'backup.backedUpOn': 'Backed up: {date}',
  'backup.pdfHint': 'PDF is produced through the browser print dialog — choose “Save as PDF”.',
  'backup.history': 'Recent backups',
  'backup.noBackupsYet': 'No backups yet',
  'backup.exporting': 'Preparing backup…',
  'backup.exportFailed': 'Backup export failed — please try again.',
  'backup.sessionLost': 'Your session was locked out — enter the site PIN again, then retry the export.',
  'backup.emptyDays': 'No notes on the selected days.',
  'backup.downloadAgain': 'Download did not start? Click here.',
  'backup.printBlocked': 'Print window did not open? Click here.',

  'lock.nav': 'App lock',
  'lock.navLockNow': 'Lock now',
  'lock.title': 'App lock',
  'lock.desc': 'Lock the whole site with a numeric PIN. While locked, notes are not readable — even the data API refuses to answer without the PIN.',
  'lock.off': 'Lock is off',
  'lock.on': 'Lock is on',
  'lock.pinLabel': 'PIN (4 to 8 digits)',
  'lock.confirmLabel': 'Confirm PIN',
  'lock.enable': 'Enable lock',
  'lock.savePin': 'Save PIN',
  'lock.lockNow': 'Lock now',
  'lock.changePin': 'Change PIN',
  'lock.remove': 'Remove lock',
  'lock.removeConfirm': 'Remove the lock? The site will stay open.',
  'lock.yesRemove': 'Yes, remove',
  'lock.cancel': 'Cancel',
  'lock.pinMismatch': 'The two PINs do not match',
  'lock.pinShort': 'PIN must be 4 to 8 digits',
  'lock.enabledToast': 'Lock enabled — your PIN is saved',
  'lock.changedToast': 'PIN changed',
  'lock.removedToast': 'Lock removed',
  'lock.lockedToast': 'Site locked',
  'lock.screenTitle': 'Site locked',
  'lock.screenSub': 'Enter your PIN to continue',
  'lock.wrongPin': 'Wrong PIN — try again',
  'lock.checking': 'Checking…',
  'lock.settings': 'Lock settings',

  'menu.addFav': 'Add to Favorites',
  'menu.removeFav': 'Remove from Favorites',
  'menu.rename': 'Rename',
  'menu.duplicate': 'Duplicate',
  'menu.trash': 'Move to Trash',
  'menu.turnInto': 'Turn into',
  'menu.delete': 'Delete',
  'menu.darkToggle': 'Toggle dark mode',
  'menu.wordCount': 'Word count: {n}',

  'top.share': 'Share',
  'top.comments': 'Comments',

  'toast.linkCopied': 'Link copied to clipboard',
  'toast.commentsUnavailable': 'Comments are not available in this demo',
  'toast.pageDuplicated': 'Page duplicated',
  'toast.duplicateFailed': 'Could not duplicate',
  'toast.movedToTrash': 'Moved to Trash',
  'toast.codeCopied': 'Code copied to clipboard',

  'page.addIcon': 'Add icon',
  'page.addCover': 'Add cover',
  'page.changeCover': 'Change cover',
  'page.changeIcon': 'Change icon',
  'page.title': 'Page title',
  'page.addDate': 'Add date',
  'page.removeDate': 'Remove date',

  'cal.today': 'Today',
  'cal.prevMonth': 'Previous month',
  'cal.nextMonth': 'Next month',
  'cal.primaryJalali': 'Jalali',
  'cal.primaryGreg': 'Gregorian',
  'cal.toggleCal': 'Primary calendar',
  'cal.addNote': 'Add a note',
  'cal.emptyDay': 'No notes on this day',
  'cal.notesOnDay': 'Notes on this day',
  'cal.newNote': 'New note',
  'cal.dropToMove': 'Drop to move the note to this day',

  'toast.dateRemoved': 'Date removed',
  'toast.dateChanged': 'Note date changed',

  'editor.placeholder': 'Write, press ‘/’ for commands…',
  'editor.heading1': 'Heading 1',
  'editor.heading2': 'Heading 2',
  'editor.heading3': 'Heading 3',
  'editor.emptyQuote': 'Empty quote',

  'block.addBelow': 'Click to add a block below',
  'block.dragMenu': 'Drag to move • Click to open menu',
  'block.changeEmoji': 'Change emoji',
  'block.toggleTask': 'Toggle task',
  'block.toggle': 'Toggle',
  'block.copy': 'Copy',
  'block.copyCode': 'Copy code',
  'block.pasteImage': 'Paste an image link…',
  'block.embedLink': 'Embed link',

  'sel.bold': 'Bold  Ctrl+B',
  'sel.italic': 'Italic  Ctrl+I',
  'sel.underline': 'Underline  Ctrl+U',
  'sel.strike': 'Strikethrough  Ctrl+S',
  'sel.code': 'Inline code  Ctrl+E',
  'sel.link': 'Link',
  'sel.pasteLink': 'Paste a link…',

  'slash.noResults': 'No results',
  'slash.groupBasic': 'Basic blocks',
  'slash.groupMedia': 'Media',
  'slash.text': 'Text', 'slash.textDesc': 'Plain text.',
  'slash.h1': 'Heading 1', 'slash.h1Desc': 'Big section heading.',
  'slash.h2': 'Heading 2', 'slash.h2Desc': 'Medium section heading.',
  'slash.h3': 'Heading 3', 'slash.h3Desc': 'Small section heading.',
  'slash.todo': 'To-do list', 'slash.todoDesc': 'Track tasks with a checkbox.',
  'slash.bulleted': 'Bulleted list', 'slash.bulletedDesc': 'Simple bulleted list.',
  'slash.numbered': 'Numbered list', 'slash.numberedDesc': 'Numbered list.',
  'slash.toggle': 'Toggle list', 'slash.toggleDesc': 'Hide and show content.',
  'slash.quote': 'Quote', 'slash.quoteDesc': 'Capture a quote.',
  'slash.callout': 'Callout', 'slash.calloutDesc': 'Make writing stand out.',
  'slash.divider': 'Divider', 'slash.dividerDesc': 'Visually divide blocks.',
  'slash.code': 'Code', 'slash.codeDesc': 'Capture a code snippet.',
  'slash.image': 'Image', 'slash.imageDesc': 'Embed an image with a link.',

  'search.placeholder': 'Search pages, content…',
  'search.recent': 'Recently visited',
  'search.results': 'Results',
  'search.noResults': 'No results found',
  'search.hintNav': 'to navigate',
  'search.hintOpen': 'to open',
  'search.hintDismiss': 'to dismiss',

  'trash.title': 'Trash',
  'trash.hint': 'Pages in trash are restored to their original location.',
  'trash.empty': 'No pages in trash',
  'trash.restore': 'Restore',
  'trash.deleteForever': 'Delete permanently',

  'emoji.random': 'Random',
  'emoji.remove': 'Remove',
  'cover.remove': 'Remove cover',

  'actions.close': 'Close',
};

const fa: Dict = {
  'app.title': 'نوت من',
  'loading': 'در حال بارگذاری…',
  'selectPage': 'صفحه‌ای را انتخاب کنید',
  'defaultPageTitle': 'شروع به کار',

  'sidebar.search': 'جستجو',
  'sidebar.home': 'خانه',
  'sidebar.calendar': 'تقویم',
  'sidebar.favorites': 'دلخواه‌ها',
  'sidebar.private': 'خصوصی',
  'sidebar.newPage': 'صفحه جدید',
  'sidebar.trash': 'سطل زباله',
  'sidebar.language': 'زبان',
  'sidebar.builtWith': 'ساخته‌شده با',
  'sidebar.addInside': 'افزودن صفحه درون این صفحه',
  'sidebar.moreOptions': 'گزینه‌های بیشتر',
  'sidebar.addPage': 'افزودن صفحه',
  'sidebar.expand': 'باز کردن',
  'sidebar.closeSidebar': 'بستن نوار کناری',
  'sidebar.openSidebar': 'باز کردن نوار کناری',
  'sidebar.dark': 'حالت تیره',
  'sidebar.light': 'حالت روشن',
  'sidebar.untitled': 'بدون عنوان',

  'sidebar.pinned': 'یادداشت‌های انتخابی',
  'sidebar.pinnedEmpty': 'هنوز یادداشتی انتخاب نشده',
  'sidebar.pinnedEmptyHint': 'یادداشت‌ها را از تقویم (نگه‌داشتن نشانگر روی یادداشت ← سنجاق) یا از منوی ⋮ خود صفحه سنجاق کنید تا اینجا نمایش داده شوند.',
  'sidebar.pin': 'سنجاق به نوار کناری',
  'sidebar.unpin': 'حذف سنجاق',
  'sidebar.backup': 'پشتیبان‌گیری',

  'day.back': 'بازگشت به تقویم',
  'day.prevDay': 'روز قبل',
  'day.nextDay': 'روز بعد',
  'day.notesTitle': '{n} یادداشت',
  'day.backedUp': 'پشتیبان تهیه شده',

  'backup.title': 'پشتیبان‌گیری یادداشت‌ها',
  'backup.desc': 'روزهای دلخواه را تک‌تک یا به‌صورت یک بازه انتخاب کنید — بعد فقط یادداشت‌های همان روزها خروجی گرفته می‌شود.',
  'backup.modeMulti': 'چند انتخاب',
  'backup.modeRange': 'بازه',
  'backup.rangeHint': 'حالت بازه: اول روز شروع را کلیک کنید، بعد روز پایان را.',
  'backup.selectMonth': 'کل ماه',
  'backup.clear': 'پاک کردن',
  'backup.selectedCount': '{n} روز انتخاب شد',
  'backup.noneSelected': 'هنوز روزی انتخاب نشده',
  'backup.format': 'قالب خروجی',
  'backup.fmtPdf': 'PDF',
  'backup.fmtMd': 'Markdown',
  'backup.fmtJson': 'JSON',
  'backup.export': 'دریافت پشتیبان',
  'backup.done': 'پشتیبان تهیه شد — {n} یادداشت',
  'backup.emptyRange': 'روزهای انتخابی یادداشتی ندارند',
  'backup.backedUp': 'قبلاً پشتیبان تهیه شده',
  'backup.backedUpOn': 'پشتیبان: {date}',
  'backup.pdfHint': 'خروجی PDF از پنجره چاپ مرورگر داده می‌شود — گزینه «Save as PDF» را انتخاب کنید.',
  'backup.history': 'پشتیبان‌های اخیر',
  'backup.noBackupsYet': 'هنوز پشتیبانی گرفته نشده',
  'backup.exporting': 'در حال آماده‌سازی پشتیبان…',
  'backup.exportFailed': 'گرفتن پشتیبان ناموفق بود — دوباره تلاش کنید.',
  'backup.sessionLost': 'نشست شما بسته شده — پین سایت را دوباره وارد کنید و خروجی را تکرار کنید.',
  'backup.emptyDays': 'برای روزهای انتخاب‌شده یادداشتی نیست.',
  'backup.downloadAgain': 'دانلود شروع نشد؟ اینجا کلیک کنید.',
  'backup.printBlocked': 'پنجره چاپ باز نشد؟ اینجا کلیک کنید.',

  'lock.nav': 'قفل سایت',
  'lock.navLockNow': 'قفل کردن سایت',
  'lock.title': 'قفل سایت',
  'lock.desc': 'کل سایت را با یک PIN عددی قفل کنید. وقتی قفل باشد، یادداشت‌ها خوانده نمی‌شوند — حتی API داده‌ها هم بدون PIN پاسخ نمی‌دهد.',
  'lock.off': 'قفل غیرفعال است',
  'lock.on': 'قفل فعال است',
  'lock.pinLabel': 'پین (۴ تا ۸ رقم)',
  'lock.confirmLabel': 'تکرار پین',
  'lock.enable': 'فعال‌سازی قفل',
  'lock.savePin': 'ذخیره پین',
  'lock.lockNow': 'قفل کردن همین حالا',
  'lock.changePin': 'تغییر پین',
  'lock.remove': 'حذف قفل',
  'lock.removeConfirm': 'قفل حذف شود؟ سایت بدون قفل می‌ماند.',
  'lock.yesRemove': 'بله، حذف شود',
  'lock.cancel': 'انصراف',
  'lock.pinMismatch': 'پین و تکرار آن یکی نیستند',
  'lock.pinShort': 'پین باید ۴ تا ۸ رقم باشد',
  'lock.enabledToast': 'قفل فعال شد — پین شما ذخیره شد',
  'lock.changedToast': 'پین تغییر کرد',
  'lock.removedToast': 'قفل حذف شد',
  'lock.lockedToast': 'سایت قفل شد',
  'lock.screenTitle': 'سایت قفل است',
  'lock.screenSub': 'برای ورود، پین خود را وارد کنید',
  'lock.wrongPin': 'پین اشتباه است — دوباره تلاش کنید',
  'lock.checking': 'در حال بررسی…',
  'lock.settings': 'تنظیمات قفل',

  'menu.addFav': 'افزودن به دلخواه‌ها',
  'menu.removeFav': 'حذف از دلخواه‌ها',
  'menu.rename': 'تغییر نام',
  'menu.duplicate': 'تکثیر',
  'menu.trash': 'انتقال به سطل زباله',
  'menu.turnInto': 'تبدیل به',
  'menu.delete': 'حذف',
  'menu.darkToggle': 'تغییر حالت تیره/روشن',
  'menu.wordCount': 'تعداد کلمات: {n}',

  'top.share': 'اشتراک‌گذاری',
  'top.comments': 'نظرات',

  'toast.linkCopied': 'پیوند کپی شد',
  'toast.commentsUnavailable': 'امکان نظردادن در این نسخه نمایشی وجود ندارد',
  'toast.pageDuplicated': 'صفحه تکثیر شد',
  'toast.duplicateFailed': 'تکثیر انجام نشد',
  'toast.movedToTrash': 'به سطل زباله منتقل شد',
  'toast.codeCopied': 'کد کپی شد',

  'page.addIcon': 'افزودن آیکون',
  'page.addCover': 'افزودن جلد',
  'page.changeCover': 'تغییر جلد',
  'page.changeIcon': 'تغییر آیکون',
  'page.title': 'عنوان صفحه',
  'page.addDate': 'افزودن تاریخ',
  'page.removeDate': 'حذف تاریخ',

  'cal.today': 'امروز',
  'cal.prevMonth': 'ماه قبل',
  'cal.nextMonth': 'ماه بعد',
  'cal.primaryJalali': 'جلالی',
  'cal.primaryGreg': 'میلادی',
  'cal.toggleCal': 'تقویم اصلی',
  'cal.addNote': 'افزودن یادداشت',
  'cal.emptyDay': 'این روز یادداشتی ندارد',
  'cal.notesOnDay': 'یادداشت‌های این روز',
  'cal.newNote': 'یادداشت جدید',
  'cal.dropToMove': 'برای انتقال یادداشت به این روز رها کنید',

  'toast.dateRemoved': 'تاریخ حذف شد',
  'toast.dateChanged': 'تاریخ یادداشت تغییر کرد',

  'editor.placeholder': 'بنویسید یا برای دستورات ‘/’ را فشار دهید…',
  'editor.heading1': 'سرتیتر ۱',
  'editor.heading2': 'سرتیتر ۲',
  'editor.heading3': 'سرتیتر ۳',
  'editor.emptyQuote': 'نقل‌قول خالی',

  'block.addBelow': 'برای افزودن بلوک در زیر کلیک کنید',
  'block.dragMenu': 'برای جابه‌جایی بکشید • برای باز کردن منو کلیک کنید',
  'block.changeEmoji': 'تغییر ایموجی',
  'block.toggleTask': 'انجام/لغو کار',
  'block.toggle': 'بازشو',
  'block.copy': 'کپی',
  'block.copyCode': 'کپی کد',
  'block.pasteImage': 'پیوند تصویر را اینجا بچسبانید…',
  'block.embedLink': 'جاسازی پیوند',

  'sel.bold': 'ضخیم  Ctrl+B',
  'sel.italic': 'کج  Ctrl+I',
  'sel.underline': 'زیرخط  Ctrl+U',
  'sel.strike': 'خط‌خورده  Ctrl+S',
  'sel.code': 'کد درون‌خطی  Ctrl+E',
  'sel.link': 'پیوند',
  'sel.pasteLink': 'پیوند را بچسبانید…',

  'slash.noResults': 'نتیجه‌ای نیست',
  'slash.groupBasic': 'بلوک‌های پایه',
  'slash.groupMedia': 'رسانه',
  'slash.text': 'متن', 'slash.textDesc': 'متن ساده.',
  'slash.h1': 'سرتیتر ۱', 'slash.h1Desc': 'سرتیتر بزرگ بخش.',
  'slash.h2': 'سرتیتر ۲', 'slash.h2Desc': 'سرتیتر میانی بخش.',
  'slash.h3': 'سرتیتر ۳', 'slash.h3Desc': 'سرتیتر کوچک بخش.',
  'slash.todo': 'فهرست کارها', 'slash.todoDesc': 'پیگیری کارها با چک‌باکس.',
  'slash.bulleted': 'فهرست نقطه‌ای', 'slash.bulletedDesc': 'فهرست ساده نقطه‌ای.',
  'slash.numbered': 'فهرست شماره‌دار', 'slash.numberedDesc': 'فهرست شماره‌دار.',
  'slash.toggle': 'فهرست بازشو', 'slash.toggleDesc': 'پنهان و آشکار کردن محتوا.',
  'slash.quote': 'نقل‌قول', 'slash.quoteDesc': 'ثبت یک نقل‌قول.',
  'slash.callout': 'برجسته', 'slash.calloutDesc': 'برجسته شدن نوشته.',
  'slash.divider': 'جداکننده', 'slash.dividerDesc': 'جداسازی بصری بلوک‌ها.',
  'slash.code': 'کد', 'slash.codeDesc': 'ثبت قطعه کد.',
  'slash.image': 'تصویر', 'slash.imageDesc': 'جاسازی تصویر با پیوند.',

  'search.placeholder': 'جستجو در صفحات و محتوا…',
  'search.recent': 'بازدیدهای اخیر',
  'search.results': 'نتایج',
  'search.noResults': 'نتیجه‌ای یافت نشد',
  'search.hintNav': 'برای پیمایش',
  'search.hintOpen': 'برای باز کردن',
  'search.hintDismiss': 'برای بستن',

  'trash.title': 'سطل زباله',
  'trash.hint': 'صفحات داخل سطل زباله به مکان اصلی خود بازمی‌گردند.',
  'trash.empty': 'سطل زباله خالی است',
  'trash.restore': 'بازگردانی',
  'trash.deleteForever': 'حذف همیشگی',

  'emoji.random': 'تصادفی',
  'emoji.remove': 'حذف',
  'cover.remove': 'حذف جلد',

  'actions.close': 'بستن',
};

export type TKey = keyof typeof en;

const DICTS: Record<Lang, Dict> = { en, fa };

/* ---------------- tiny reactive store ---------------- */

function detectInitial(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const s = window.localStorage.getItem('notion-lang');
    if (s === 'en' || s === 'fa') return s;
  } catch {
    /* ignore */
  }
  return 'fa'; // default UI language: Persian
}

let current: Lang = detectInitial();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => current);
}

function apply(l: Lang, persist: boolean) {
  current = l;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr';
    document.title = DICTS[l]['app.title'];
  }
  if (persist) {
    try {
      localStorage.setItem('notion-lang', l);
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((fn) => fn());
}

/** Sync <html> lang/dir + document.title with the detected language (call once on mount). */
export function initLang(): void {
  apply(current, false);
}

export function toggleLang(): void {
  apply(current === 'fa' ? 'en' : 'fa', true);
}

/* ---------------- translation & locale helpers ---------------- */

export function t(key: TKey, params?: Record<string, string | number>): string {
  let s = DICTS[current][key] ?? en[key] ?? String(key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

/** Persian digits in fa (۱۲۳), Latin digits in en. */
export function fmtNum(n: number): string {
  return current === 'fa' ? n.toLocaleString('fa-IR') : String(n);
}

/** "Edited just now / Edited 5m ago" ⇄ "همین حالا ویرایش شد / ویرایش‌شده ۵ دقیقه پیش" */
export function editedLabel(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (current === 'fa') {
    if (s < 40) return 'همین حالا ویرایش شد';
    const rtf = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });
    const m = Math.floor(s / 60);
    if (m < 60) return `ویرایش‌شده ${rtf.format(-m, 'minute')}`;
    const h = Math.floor(m / 60);
    if (h < 24) return `ویرایش‌شده ${rtf.format(-h, 'hour')}`;
    return `ویرایش‌شده ${rtf.format(-Math.floor(h / 24), 'day')}`;
  }
  if (s < 40) return 'Edited just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `Edited ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Edited ${h}h ago`;
  return `Edited ${Math.floor(h / 24)}d ago`;
}

/** Trash modal: "deleted 5m ago" ⇄ "حذف‌شده ۵ دقیقه پیش" */
export function deletedAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (current === 'fa') {
    if (s < 60) return 'همین حالا حذف شد';
    const rtf = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });
    const m = Math.floor(s / 60);
    if (m < 60) return `حذف‌شده ${rtf.format(-m, 'minute')}`;
    const h = Math.floor(m / 60);
    if (h < 24) return `حذف‌شده ${rtf.format(-h, 'hour')}`;
    return `حذف‌شده ${rtf.format(-Math.floor(h / 24), 'day')}`;
  }
  if (s < 60) return 'deleted just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `deleted ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `deleted ${h}h ago`;
  return `deleted ${Math.floor(h / 24)}d ago`;
}
