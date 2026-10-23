'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Delete, Lock } from 'lucide-react';
import { t, useLang } from '@/lib/notion/i18n';
import { api } from '@/lib/notion/api';

/**
 * Full-screen PIN lock. Rendered above everything (z-index 2000) whenever
 * the site lock is armed. Typing works with the on-screen keypad and with
 * a physical keyboard; the PIN auto-submits once it reaches the saved length.
 */
export function LockScreen({ length, onUnlocked }: { length: number; onUnlocked: () => void }) {
  const lang = useLang();
  const len = Math.min(Math.max(length || 4, 4), 8);
  const [entered, setEntered] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  // mirror of `entered` so rapid key presses (batched renders) never lose digits
  const enteredRef = useRef('');

  const submit = useCallback(
    async (pin: string) => {
      setBusy(true);
      try {
        await api.lockVerify(pin);
        onUnlocked();
      } catch {
        setWrong(true);
        enteredRef.current = '';
        setEntered('');
        window.setTimeout(() => setWrong(false), 700);
        setBusy(false);
      }
    },
    [onUnlocked],
  );

  const pushDigit = useCallback(
    (d: string) => {
      if (busy || enteredRef.current.length >= len) return;
      setWrong(false);
      const next = enteredRef.current + d;
      enteredRef.current = next;
      setEntered(next);
      if (next.length === len) window.setTimeout(() => submit(next), 150);
    },
    [busy, len, submit],
  );

  const popDigit = useCallback(() => {
    if (busy) return;
    setWrong(false);
    const next = enteredRef.current.slice(0, -1);
    enteredRef.current = next;
    setEntered(next);
  }, [busy]);

  /* physical keyboard: digits + backspace */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        pushDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        popDigit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pushDigit, popDigit]);

  const label = (d: number) => (lang === 'fa' ? d.toLocaleString('fa-IR') : String(d));

  return (
    <div className="lk-screen" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
      <div className={`lk-card ${wrong ? 'shake' : ''}`}>
        <div className="lk-logo">
          <Lock size={22} strokeWidth={2.2} />
        </div>
        <div className="lk-title">{t('lock.screenTitle')}</div>
        <div className="lk-sub">{t('lock.screenSub')}</div>

        <div className={`lk-dots ${wrong ? 'wrong' : ''}`}>
          {Array.from({ length: len }, (_, i) => (
            <span key={i} className={`lk-dot ${i < entered.length ? 'on' : ''}`} />
          ))}
        </div>
        <div className="lk-msg">{busy ? t('lock.checking') : wrong ? t('lock.wrongPin') : '\u00a0'}</div>

        <div className="lk-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} type="button" className="lk-key" disabled={busy} onClick={() => pushDigit(String(d))}>
              {label(d)}
            </button>
          ))}
          <span className="lk-key ghost" aria-hidden="true" />
          <button type="button" className="lk-key" disabled={busy} onClick={() => pushDigit('0')}>
            {label(0)}
          </button>
          <button
            type="button"
            className="lk-key del"
            disabled={busy || entered.length === 0}
            onClick={popDigit}
            aria-label="backspace"
          >
            <Delete size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
