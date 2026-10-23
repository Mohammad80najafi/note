'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Trash2,
  Copy,
  CornerUpLeft,
  ChevronRight,
  ChevronLeft,
  Search,
  FileText,
  Undo2,
  Moon,
  Sun,
  Star,
  Pin,
  PinOff,
} from 'lucide-react';
import type { Page, SearchResult } from '@/lib/notion/types';
import { SLASH_ITEMS, EMOJIS, GRADIENTS, randomEmoji, type SlashItem } from '@/lib/notion/constants';
import type { BlockType } from '@/lib/notion/types';
import { t, useLang, deletedAgo, fmtNum } from '@/lib/notion/i18n';

/* ================= Popover base ================= */

export function Popover({
  rect,
  onClose,
  children,
  width = 220,
  align = 'left',
}: {
  rect: DOMRect;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  align?: 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lang = useLang();

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const H = 200;
  let top = rect.bottom + 6;
  if (top + H > window.innerHeight) top = Math.max(8, rect.top - 60);
  const effAlign = align === 'left' && lang === 'fa' ? 'right' : align;
  const left =
    effAlign === 'right'
      ? Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
      : Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

  return (
    <div ref={ref} className="popover" style={{ position: 'fixed', top, left, width }}>
      {children}
    </div>
  );
}

export function MenuRow({
  icon,
  label,
  hint,
  danger,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`menu-row ${danger ? 'danger' : ''}`} onClick={onClick}>
      {icon && <span className="menu-ico">{icon}</span>}
      <span className="menu-label">{label}</span>
      {hint && <span className="menu-hint">{hint}</span>}
    </button>
  );
}

/* ================= Block handle menu ================= */

const TURN_INTO: Pick<SlashItem, 'type' | 'labelKey' | 'icon'>[] = SLASH_ITEMS.filter((s) =>
  ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'todo', 'bulleted', 'numbered', 'toggle', 'quote', 'callout', 'code'].includes(s.type),
);

export function BlockHandleMenu({
  rect,
  mode,
  onClose,
  onDelete,
  onDuplicate,
  onTurnInto,
  onTurnSelect,
}: {
  rect: DOMRect;
  mode: 'main' | 'turninto';
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTurnInto: () => void;
  onTurnSelect: (t: BlockType) => void;
}) {
  if (mode === 'turninto') {
    return (
      <Popover rect={rect} onClose={onClose} width={240}>
        <button className="menu-row back" onClick={onTurnInto}>
          <ChevronLeft size={14} />
          <span className="menu-label">{t('menu.turnInto')}</span>
        </button>
        <div className="menu-sep" />
        {TURN_INTO.map((it) => (
          <MenuRow key={it.type} icon={<span className="menu-ico-box">{it.icon}</span>} label={t(it.labelKey)} onClick={() => onTurnSelect(it.type)} />
        ))}
      </Popover>
    );
  }
  return (
    <Popover rect={rect} onClose={onClose} width={220}>
      <MenuRow icon={<Trash2 size={15} />} label={t('menu.delete')} danger onClick={onDelete} />
      <MenuRow icon={<Copy size={15} />} label={t('menu.duplicate')} onClick={onDuplicate} />
      <div className="menu-sep" />
      <MenuRow
        icon={<span className="menu-ico-box"><CornerUpLeft size={15} /></span>}
        label={t('menu.turnInto')}
        hint={<ChevronRight size={13} />}
        onClick={onTurnInto}
      />
    </Popover>
  );
}

/* ================= Page menu (topbar ⋯) ================= */

export function PageMenu({
  rect,
  isFavorite,
  isPinned,
  wordCount,
  onClose,
  onToggleFavorite,
  onTogglePin,
  onDuplicate,
  onTrash,
  onToggleDark,
}: {
  rect: DOMRect;
  isFavorite: boolean;
  isPinned: boolean;
  wordCount: number;
  onClose: () => void;
  onToggleFavorite: () => void;
  onTogglePin: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
  onToggleDark: () => void;
}) {
  useLang();
  return (
    <Popover rect={rect} onClose={onClose} width={240} align="right">
      <MenuRow
        icon={<Star size={15} />}
        label={isFavorite ? t('menu.removeFav') : t('menu.addFav')}
        onClick={onToggleFavorite}
      />
      <MenuRow
        icon={isPinned ? <PinOff size={15} /> : <Pin size={15} />}
        label={isPinned ? t('sidebar.unpin') : t('sidebar.pin')}
        onClick={onTogglePin}
      />
      <MenuRow icon={<Copy size={15} />} label={t('menu.duplicate')} onClick={onDuplicate} />
      <div className="menu-sep" />
      <MenuRow
        icon={<Moon size={15} />}
        label={t('menu.darkToggle')}
        onClick={() => {
          onToggleDark();
          onClose();
        }}
      />
      <div className="menu-sep" />
      <MenuRow icon={<Trash2 size={15} />} label={t('menu.trash')} danger onClick={onTrash} />
      <div className="menu-foot">{t('menu.wordCount', { n: fmtNum(wordCount) })}</div>
    </Popover>
  );
}

/* ================= Emoji picker ================= */

export function EmojiPickerPanel({
  rect,
  onPick,
  onRemove,
  onClose,
}: {
  rect: DOMRect;
  onPick: (emoji: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  useLang();
  return (
    <Popover rect={rect} onClose={onClose} width={332}>
      <div className="emoji-head">
        <button className="emoji-action" onClick={() => onPick(randomEmoji())}>{t('emoji.random')}</button>
        {onRemove && (
          <button className="emoji-action" onClick={onRemove}>{t('emoji.remove')}</button>
        )}
      </div>
      <div className="emoji-grid">
        {EMOJIS.map((em, i) => (
          <button key={`${em}-${i}`} className="emoji-cell" onClick={() => onPick(em)}>
            {em}
          </button>
        ))}
      </div>
    </Popover>
  );
}

/* ================= Cover picker ================= */

export function CoverPickerPanel({
  rect,
  onPick,
  onRemove,
  onClose,
}: {
  rect: DOMRect;
  onPick: (css: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  useLang();
  return (
    <Popover rect={rect} onClose={onClose} width={332}>
      <div className="cover-grid">
        {GRADIENTS.map((g) => (
          <button key={g} className="cover-cell" style={{ background: g }} onClick={() => onPick(g)} aria-label="cover" />
        ))}
      </div>
      <div className="menu-sep" />
      <MenuRow icon={<Undo2 size={15} />} label={t('cover.remove')} onClick={onRemove} />
    </Popover>
  );
}

/* ================= Search modal (Ctrl+K) ================= */

export function SearchModal({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState(true);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useLang();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetchSearch(q);
        if (!alive) return;
        setResults(r.results);
        setRecent(r.recent);
        setActive(0);
      } catch {
        /* ignore */
      }
    }, 140);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) {
        onNavigate(r.pageId);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-modal" onKeyDown={onKey}>
        <div className="search-input-row">
          <Search size={18} className="search-ico" />
          <input
            ref={inputRef}
            className="search-input"
            placeholder={t('search.placeholder')}
            dir="auto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="search-results">
          <div className="search-label">{recent ? t('search.recent') : t('search.results')}</div>
          {results.length === 0 && !recent && <div className="search-empty">{t('search.noResults')}</div>}
          {results.map((r, i) => (
            <button
              key={r.pageId}
              className={`search-row ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                onNavigate(r.pageId);
                onClose();
              }}
            >
              <span className="search-row-ico">{r.icon || <FileText size={16} className="text-ico" />}</span>
              <span className="search-row-body">
                <span className="search-row-title">
                  {r.path.length > 0 && (
                    <span className="search-path">
                      {r.path.map((p) => (
                        <span key={p.id} className="search-path-item">{p.title || t('sidebar.untitled')} / </span>
                      ))}
                    </span>
                  )}
                  {highlight(r.title || t('sidebar.untitled'), q)}
                </span>
                {r.snippet && <span className="search-row-snippet">{highlight(r.snippet, q)}</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="search-foot">
          <span><kbd className="kbd">↑↓</kbd> {t('search.hintNav')}</span>
          <span><kbd className="kbd">↵</kbd> {t('search.hintOpen')}</span>
          <span><kbd className="kbd">Esc</kbd> {t('search.hintDismiss')}</span>
        </div>
      </div>
    </div>
  );
}

async function fetchSearch(q: string) {
  const { api } = await import('@/lib/notion/api');
  return api.search(q);
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let i = 0;
  let idx;
  let k = 0;
  while ((idx = lower.indexOf(ql, i)) !== -1 && k < 8) {
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(<mark key={idx}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
    k += 1;
  }
  parts.push(text.slice(i));
  return parts;
}

/* ================= Trash modal ================= */

export function TrashModal({
  pages,
  onClose,
  onRestore,
  onPurge,
  onNavigate,
}: {
  pages: Page[];
  onClose: () => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const trashed = pages.filter((p) => p.isTrashed);
  useLang();

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="trash-modal">
        <div className="trash-head">
          <span className="trash-title">{t('trash.title')}</span>
          <button className="icon-btn" onClick={onClose} aria-label={t('actions.close')}>✕</button>
        </div>
        <div className="trash-hint">{t('trash.hint')}</div>
        <div className="trash-list">
          {trashed.length === 0 && <div className="trash-empty">{t('trash.empty')}</div>}
          {trashed.map((p) => (
            <div key={p.id} className="trash-row">
              <span className="trash-ico">{p.icon || <FileText size={16} className="text-ico" />}</span>
              <button className="trash-name" onClick={() => { onNavigate(p.id); onClose(); }}>
                {p.title || t('sidebar.untitled')}
              </button>
              <span className="trash-time">{deletedAgo(p.updatedAt)}</span>
              <button className="icon-btn" title={t('trash.restore')} onClick={() => onRestore(p.id)}>
                <Undo2 size={15} />
              </button>
              <button
                className={`icon-btn ${confirmId === p.id ? 'danger-solid' : 'danger-hover'}`}
                title={t('trash.deleteForever')}
                onClick={() => {
                  if (confirmId === p.id) {
                    onPurge(p.id);
                    setConfirmId(null);
                  } else {
                    setConfirmId(p.id);
                    setTimeout(() => setConfirmId((c) => (c === p.id ? null : c)), 2500);
                  }
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { Sun, Moon };
