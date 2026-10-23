'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SLASH_ITEMS, type SlashItem } from '@/lib/notion/constants';
import { t, useLang } from '@/lib/notion/i18n';

interface SlashMenuProps {
  rect: DOMRect;
  query: string;
  onSelect: (item: SlashItem) => void;
  onClose: () => void;
}

export function SlashMenu({ rect, query, onSelect, onClose }: SlashMenuProps) {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lang = useLang();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? SLASH_ITEMS
      : SLASH_ITEMS.filter(
          (it) =>
            t(it.labelKey).toLowerCase().includes(q) ||
            it.keywords.includes(q) ||
            it.type.includes(q),
        );
    const rows: { item: SlashItem; group: string | null }[] = [];
    let lastGroup = '';
    for (const it of base) {
      const group = it.groupKey !== lastGroup ? t(it.groupKey) : null;
      lastGroup = it.groupKey;
      rows.push({ item: it, group });
    }
    return rows;
     
  }, [query, lang]);

  // reset active selection when the filter changes (official derived-state pattern)
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setActive(0);
  }

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // keyboard nav is handled globally (capture) so the caret block doesn't swallow keys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActive((a) => (filtered.length ? (a + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActive((a) => (filtered.length ? (a - 1 + filtered.length) % filtered.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (filtered[active]) onSelect(filtered[active].item);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [filtered, active, onSelect, onClose]);

  if (!filtered.length) {
    return (
      <div className="slash-menu" style={menuPos(rect, lang === 'fa')}>
        <div className="slash-empty">{t('slash.noResults')}</div>
      </div>
    );
  }

  return (
    <div className="slash-menu" style={menuPos(rect, lang === 'fa')} ref={listRef}>
      {filtered.map(({ item: it, group }, i) => (
        <React.Fragment key={it.type}>
          {group && <div className="slash-group">{group}</div>}
          <button
            data-idx={i}
            className={`slash-item ${i === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(it)}
          >
            <span className="slash-icon">{it.icon}</span>
            <span className="slash-text">
              <span className="slash-label">{t(it.labelKey)}</span>
              <span className="slash-desc">{t(it.descKey)}</span>
            </span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function menuPos(rect: DOMRect, rtl: boolean): React.CSSProperties {
  const H = 340;
  const top = rect.bottom + 6 + H > window.innerHeight ? rect.top - H - 6 : rect.bottom + 6;
  const left = rtl
    ? Math.max(8, Math.min(rect.right - 350, window.innerWidth - 358))
    : Math.min(rect.left, window.innerWidth - 350);
  return { position: 'fixed', top: Math.max(8, top), left: Math.max(8, left) };
}
