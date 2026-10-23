'use client';

import React, { useEffect, useState } from 'react';
import { Lock, LockOpen, Settings2, ShieldCheck, X } from 'lucide-react';
import type { LockStatus } from '@/lib/notion/types';
import { t } from '@/lib/notion/i18n';

/**
 * App-lock settings dialog:
 *  - lock off           → setup form (PIN + confirm)
 *  - lock on            → status card + [Lock now] [Change PIN] [Remove]
 *  - change PIN         → same setup form (session already unlocked)
 */
export function LockDialog({
  status,
  onClose,
  onSave,
  onEngage,
  onRemove,
}: {
  status: LockStatus;
  onClose: () => void;
  /** Persist a new PIN (setup or change). Throws on failure. */
  onSave: (pin: string) => Promise<void>;
  onEngage: () => void;
  onRemove: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'menu' | 'edit'>(status.enabled ? 'menu' : 'edit');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 8);

  const doSave = async () => {
    if (busy) return;
    if (pin.length < 4 || pin.length > 8) {
      setErr(t('lock.pinShort'));
      return;
    }
    if (pin !== confirm) {
      setErr(t('lock.pinMismatch'));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await onSave(pin);
      onClose();
    } catch {
      setErr(t('lock.pinShort'));
      setBusy(false);
    }
  };

  const doRemove = async () => {
    setBusy(true);
    try {
      await onRemove();
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bk-modal lk-modal">
        {/* header */}
        <div className="bk-head">
          <div className="bk-head-txt">
            <div className="bk-title">
              <Settings2 size={17} className="lk-title-ico" />
              {t('lock.title')}
            </div>
            <div className="bk-desc">{t('lock.desc')}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t('actions.close')}>
            <X size={16} />
          </button>
        </div>

        {mode === 'menu' ? (
          <>
            <div className="lk-status">
              <span className="lk-status-dot" />
              {t('lock.on')}
            </div>

            <div className="lk-act">
              <button className="lk-btn primary" onClick={onEngage}>
                <Lock size={15} />
                {t('lock.lockNow')}
              </button>
              <button
                className="lk-btn subtle"
                onClick={() => {
                  setPin('');
                  setConfirm('');
                  setErr(null);
                  setMode('edit');
                }}
              >
                <Settings2 size={14} />
                {t('lock.changePin')}
              </button>
              {confirmRemove ? (
                <div className="lk-confirm">
                  <span className="lk-confirm-txt">{t('lock.removeConfirm')}</span>
                  <div className="lk-confirm-btns">
                    <button className="lk-btn danger" disabled={busy} onClick={doRemove}>
                      {t('lock.yesRemove')}
                    </button>
                    <button className="lk-btn subtle" onClick={() => setConfirmRemove(false)}>
                      {t('lock.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button className="lk-btn danger" onClick={() => setConfirmRemove(true)}>
                  <LockOpen size={14} />
                  {t('lock.remove')}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {status.enabled && (
              <div className="lk-status">
                <span className="lk-status-dot" />
                {t('lock.changePin')}
              </div>
            )}
            <div className="lk-field">
              <span className="lk-label">{t('lock.pinLabel')}</span>
              <input
                className="lk-input"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                autoFocus
                dir="ltr"
                value={pin}
                onChange={(e) => {
                  setPin(digitsOnly(e.target.value));
                  setErr(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && doSave()}
              />
            </div>
            <div className="lk-field">
              <span className="lk-label">{t('lock.confirmLabel')}</span>
              <input
                className="lk-input"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                dir="ltr"
                value={confirm}
                onChange={(e) => {
                  setConfirm(digitsOnly(e.target.value));
                  setErr(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && doSave()}
              />
            </div>
            <div className="lk-err">{err || '\u00a0'}</div>
            <div className="lk-act">
              <button className="lk-btn primary" disabled={busy || pin.length < 4} onClick={doSave}>
                <ShieldCheck size={15} />
                {status.enabled ? t('lock.savePin') : t('lock.enable')}
              </button>
              {status.enabled && (
                <button className="lk-btn subtle" onClick={() => setMode('menu')}>
                  {t('lock.cancel')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
