/* ================================================================
   Jalali (Solar Hijri) ⇄ Gregorian calendar utilities.
   Storage key for notes is always a Gregorian ISO day "YYYY-MM-DD"
   (unambiguous), while the UI renders both calendars side-by-side.
   Weeks always start on Saturday (شنبه) — Iranian convention.
   ================================================================ */

import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js';

export type Primary = 'jalali' | 'gregorian';

export interface DayCell {
  iso: string; // Gregorian YYYY-MM-DD
  jy: number;
  jm: number;
  jd: number;
  gy: number;
  gm: number;
  gd: number;
  inMonth: boolean; // inside the displayed (primary) month
}

/* ---------------- names ---------------- */

const FA_JMONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const EN_JMONTHS = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];
const FA_GMONTHS = ['ژانویه', 'فوریه', 'مارس', 'آپریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];
const EN_GMONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Saturday-first weekday labels (short + long). */
const FA_WD = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const FA_WD_LONG = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const EN_WD = ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'];
const EN_WD_LONG = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function weekdayLabels(lang: 'fa' | 'en'): string[] {
  return lang === 'fa' ? FA_WD : EN_WD;
}

/* ---------------- low-level helpers ---------------- */

const p2 = (n: number) => String(n).padStart(2, '0');

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
/** Persian digit rendering without locale grouping pitfalls. */
export function faNum(x: number | string): string {
  return String(x).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
function num(x: number, lang: 'fa' | 'en'): string {
  return lang === 'fa' ? faNum(x) : String(x);
}

/** Date (local) → "YYYY-MM-DD". */
export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** "YYYY-MM-DD" → local Date (midnight). */
export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayIso(): string {
  return dateToIso(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return dateToIso(d);
}

/** Saturday-first index of a Date: Sat=0 … Fri=6. */
function satIndex(d: Date): number {
  return (d.getDay() + 1) % 7;
}

/* ---------------- conversions ---------------- */

export function jalaliOf(iso: string): { jy: number; jm: number; jd: number } {
  const d = isoToDate(iso);
  return toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function gregOf(iso: string): { gy: number; gm: number; gd: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { gy: y, gm: m, gd: d };
}

export function isoFromJalali(jy: number, jm: number, jd: number): string {
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${p2(g.gm)}-${p2(g.gd)}`;
}

/* ---------------- month grids ---------------- */

/** 42 cells (6 weeks, Saturday-first) covering the primary month of `anchorIso`. */
export function buildMonthCells(anchorIso: string, primary: Primary): DayCell[] {
  const cells: DayCell[] = [];
  let first: Date;
  let len: number;
  let inMonth: (c: DayCell) => boolean;

  if (primary === 'jalali') {
    const { jy, jm } = jalaliOf(anchorIso);
    const g = toGregorian(jy, jm, 1);
    first = new Date(g.gy, g.gm - 1, g.gd);
    len = jalaaliMonthLength(jy, jm);
    inMonth = (c) => c.jm === jm;
  } else {
    const { gy, gm } = gregOf(anchorIso);
    first = new Date(gy, gm - 1, 1);
    len = new Date(gy, gm, 0).getDate();
    inMonth = (c) => c.gm === gm;
  }

  const start = new Date(first);
  start.setDate(first.getDate() - satIndex(first));

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = dateToIso(d);
    const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    cells.push({
      iso,
      jy: j.jy,
      jm: j.jm,
      jd: j.jd,
      gy: d.getFullYear(),
      gm: d.getMonth() + 1,
      gd: d.getDate(),
      inMonth: inMonth({ iso, jy: j.jy, jm: j.jm, jd: j.jd, gy: d.getFullYear(), gm: d.getMonth() + 1, gd: d.getDate(), inMonth: false }),
    });
  }
  return cells;
}

/** Anchor shifted by ±1 primary month (1st of month — no drift). */
export function shiftMonth(anchorIso: string, primary: Primary, delta: number): string {
  if (primary === 'jalali') {
    const { jy, jm } = jalaliOf(anchorIso);
    let m = jm - 1 + delta;
    let y = jy;
    m = ((m % 12) + 12) % 12;
    y += Math.floor((jm - 1 + delta) / 12);
    return isoFromJalali(y, m + 1, 1);
  }
  const { gy, gm } = gregOf(anchorIso);
  return dateToIso(new Date(gy, gm - 1 + delta, 1));
}

/* ---------------- formatting ---------------- */

/** "۲۴ مهر ۱۴۰۴" / "Mehr 24, 1404" — Jalali, no weekday. */
export function jalaliShort(iso: string, lang: 'fa' | 'en'): string {
  const { jy, jm, jd } = jalaliOf(iso);
  const m = lang === 'fa' ? FA_JMONTHS[jm - 1] : EN_JMONTHS[jm - 1];
  return lang === 'fa' ? `${num(jd, 'fa')} ${m} ${num(jy, 'fa')}` : `${m} ${jd}, ${jy}`;
}

/** "۱۶ اکتبر ۲۰۲۵" / "Oct 16, 2025" — Gregorian, no weekday. */
export function gregShort(iso: string, lang: 'fa' | 'en'): string {
  const { gy, gm, gd } = gregOf(iso);
  const mm = lang === 'fa' ? FA_GMONTHS[gm - 1] : EN_GMONTHS[gm - 1];
  if (lang === 'fa') return `${num(gd, 'fa')} ${mm} ${num(gy, 'fa')}`;
  const enShort = EN_GMONTHS[gm - 1].slice(0, 3);
  return `${enShort} ${gd}, ${gy}`;
}

/** Long label of the given calendar: "پنجشنبه ۲۴ مهر ۱۴۰۴" / "Thursday, October 16, 2025". */
export function dayLong(iso: string, lang: 'fa' | 'en', primary: Primary): string {
  const wd = satIndex(isoToDate(iso));
  const w = lang === 'fa' ? FA_WD_LONG[wd] : EN_WD_LONG[wd];
  return lang === 'fa' ? `${w} ${primary === 'jalali' ? jalaliShort(iso, 'fa') : gregShort(iso, 'fa')}` : `${w}, ${primary === 'jalali' ? jalaliShort(iso, 'en') : gregShort(iso, 'en')}`;
}

/** The *other* calendar's short label. */
export function otherCalShort(iso: string, lang: 'fa' | 'en', primary: Primary): string {
  return primary === 'jalali' ? gregShort(iso, lang) : jalaliShort(iso, lang);
}

export interface MonthTitle {
  main: string;
  sub: string;
}

/** Big month title + secondary-calendar month span. */
export function monthTitle(anchorIso: string, primary: Primary, lang: 'fa' | 'en'): MonthTitle {
  const cells = buildMonthCells(anchorIso, primary).filter((c) => c.inMonth);
  const firstIso = cells[0].iso;
  const lastIso = cells[cells.length - 1].iso;

  if (primary === 'jalali') {
    const { jy, jm } = jalaliOf(anchorIso);
    const m1 = gregOf(firstIso);
    const m2 = gregOf(lastIso);
    let sub: string;
    if (lang === 'fa') {
      sub =
        m1.gm === m2.gm
          ? `${FA_GMONTHS[m1.gm - 1]} ${num(m1.gy, 'fa')}`
          : `${FA_GMONTHS[m1.gm - 1]} – ${FA_GMONTHS[m2.gm - 1]} ${num(m2.gy, 'fa')}`;
      return { main: `${FA_JMONTHS[jm - 1]} ${num(jy, 'fa')}`, sub };
    }
    sub =
      m1.gm === m2.gm
        ? `${EN_GMONTHS[m1.gm - 1]} ${m1.gy}`
        : `${EN_GMONTHS[m1.gm - 1].slice(0, 3)} – ${EN_GMONTHS[m2.gm - 1].slice(0, 3)} ${m2.gy}`;
    return { main: `${EN_JMONTHS[jm - 1]} ${jy}`, sub };
  }

  const { gy, gm } = gregOf(anchorIso);
  const j1 = jalaliOf(firstIso);
  const j2 = jalaliOf(lastIso);
  let sub: string;
  if (lang === 'fa') {
    sub =
      j1.jm === j2.jm
        ? `${FA_JMONTHS[j1.jm - 1]} ${num(j1.jy, 'fa')}`
        : `${FA_JMONTHS[j1.jm - 1]} – ${FA_JMONTHS[j2.jm - 1]} ${num(j2.jy, 'fa')}`;
    return { main: `${FA_GMONTHS[gm - 1]} ${num(gy, 'fa')}`, sub };
  }
  sub =
    j1.jm === j2.jm
      ? `${EN_JMONTHS[j1.jm - 1]} ${j1.jy}`
      : `${EN_JMONTHS[j1.jm - 1]} – ${EN_JMONTHS[j2.jm - 1]} ${j2.jy}`;
  return { main: `${EN_GMONTHS[gm - 1]} ${gy}`, sub };
}
