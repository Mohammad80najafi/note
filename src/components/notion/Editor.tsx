'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  PanelLeftClose,
  PanelLeft,
  MessageSquare,
  Star,
  MoreHorizontal,
  StickyNote,
  ImagePlus,
  Smile,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Link2,
  CalendarDays,
  Trash2,
} from 'lucide-react';
import type { Block, BlockType, Crumb, Page } from '@/lib/notion/types';
import { htmlToText, placeCaret, caretAtStart, caretAtEnd, splitAtCaret, getCaretRect, currentSlashQuery, removeSlashQuery } from '@/lib/notion/caret';
import { type SlashItem, parseMeta } from '@/lib/notion/constants';
import { BlockRow } from './BlockRow';
import { SlashMenu } from './SlashMenu';
import { BlockHandleMenu, PageMenu, Popover, MenuRow } from './Overlays';
import { MiniMonth } from './CalendarView';
import { t, useLang } from '@/lib/notion/i18n';
import { dayLong, otherCalShort } from '@/lib/notion/jalali';

export type EditableBlock = Block & { _v?: number };

export interface EditorProps {
  page: Page;
  blocks: EditableBlock[];
  crumbs: Crumb[];
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNavigate: (id: string) => void;
  onPatchPage: (patch: Partial<Page>, opts?: { debounce?: boolean }) => void;
  onCreateBlock: (
    afterId: string | null,
    init: { type?: BlockType; content?: string; indent?: number },
  ) => Promise<Block | null>;
  onPatchBlock: (id: string, patch: Partial<Pick<Block, 'type' | 'content' | 'meta' | 'checked' | 'collapsed' | 'indent'>>, opts?: { bump?: boolean }) => void;
  onDeleteBlock: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onOpenSearch: () => void;
  onToast: (msg: string) => void;
  onOpenEmoji: (target: { kind: 'page' } | { kind: 'callout'; blockId: string }, rect: DOMRect) => void;
  onOpenCover: (rect: DOMRect) => void;
  onDuplicatePage: () => void;
  onTrashPage: () => void;
  onToggleDark: () => void;
  editedLabel: string;
}

interface FocusTarget {
  id: string;
  pos: 'start' | 'end' | number;
  nonce: number;
}

const SPACE_MD: Record<string, BlockType> = {
  '# ': 'heading_1',
  '## ': 'heading_2',
  '### ': 'heading_3',
  '- ': 'bulleted',
  '* ': 'bulleted',
  '+ ': 'bulleted',
  '[] ': 'todo',
  '[ ] ': 'todo',
  '> ': 'toggle',
  '" ': 'quote',
  '1. ': 'numbered',
};

export function Editor(props: EditorProps) {
  const {
    page, blocks, crumbs, sidebarOpen, onToggleSidebar, onNavigate, onPatchPage,
    onCreateBlock, onPatchBlock, onDeleteBlock, onReorder, onOpenSearch, onToast,
    onOpenEmoji, onOpenCover, onDuplicatePage, onTrashPage, onToggleDark, editedLabel,
  } = props;

  const lang = useLang();

  const editables = useRef(new Map<string, HTMLDivElement>());
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [slash, setSlash] = useState<{ blockId: string; rect: DOMRect; query: string } | null>(null);
  const pendingSlash = useRef<string | null>(null);
  const [handleMenu, setHandleMenu] = useState<{ blockId: string; rect: DOMRect; mode: 'main' | 'turninto' } | null>(null);
  const [pageMenuRect, setPageMenuRect] = useState<DOMRect | null>(null);
  const [drag, setDrag] = useState<{ draggingId: string | null; overId: string | null; where: 'top' | 'bottom' }>({ draggingId: null, overId: null, where: 'top' });
  const [toolbar, setToolbar] = useState<{ rect: DOMRect; blockId: string } | null>(null);
  const [datePop, setDatePop] = useState<DOMRect | null>(null);
  const [titleValue, setTitleValue] = useState(page.title);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nonce = useRef(0);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const cancelSave = useCallback((id: string) => {
    const t = saveTimers.current.get(id);
    if (t) {
      clearTimeout(t);
      saveTimers.current.delete(id);
    }
  }, []);

  useEffect(() => {
    setTitleValue(page.title);
  }, [page.id, page.title]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page.id]);

  /* ---------- focus plumbing ---------- */

  const focusEditable = useCallback((id: string, pos: 'start' | 'end' | number) => {
    const el = editables.current.get(id);
    if (!el) return false;
    el.focus({ preventScroll: true });
    placeCaret(el, pos);
    return true;
  }, []);

  useEffect(() => {
    if (!focusTarget) return;
    const ok = focusEditable(focusTarget.id, focusTarget.pos);
    if (ok) setFocusTarget(null);
  }, [focusTarget, blocks, focusEditable]);

  const requestFocus = (id: string, pos: 'start' | 'end' | number) => {
    nonce.current += 1;
    setFocusTarget({ id, pos, nonce: nonce.current });
  };

  const registerEditable = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) editables.current.set(id, el);
    else editables.current.delete(id);
  }, []);

  /* ---------- content typing (no re-render) ---------- */

  const saveContent = useCallback(
    (block: EditableBlock, el: HTMLDivElement) => {
      const html = el.innerHTML;
      const prev = saveTimers.current.get(block.id);
      if (prev) clearTimeout(prev);
      const t = setTimeout(() => {
        saveTimers.current.delete(block.id);
        onPatchBlock(block.id, { content: html }, { bump: false });
      }, 500);
      saveTimers.current.set(block.id, t);
    },
    [onPatchBlock],
  );

  const saveContentFromEl = useCallback(
    (el: HTMLDivElement) => {
      const row = el.closest('.block-row') as HTMLElement | null;
      const id = row?.dataset.blockId;
      if (!id) return;
      const block = blocks.find((b) => b.id === id);
      if (!block) return;
      saveContent(block, el);
    },
    [blocks, saveContent],
  );

  const handleInput = useCallback(
    (block: EditableBlock, el: HTMLDivElement) => {
      saveContent(block, el);

      // slash menu lifecycle
      if (pendingSlash.current === block.id) {
        pendingSlash.current = null;
        const rect = getCaretRect();
        if (rect) setSlash({ blockId: block.id, rect, query: '' });
        return;
      }
      if (slash && slash.blockId === block.id) {
        const q = currentSlashQuery(el);
        if (!q) setSlash(null);
        else if (q.query !== slash.query) setSlash({ ...slash, query: q.query });
      }

      // markdown shortcuts (only on fresh paragraphs)
      if (block.type === 'paragraph') {
        const text = el.textContent || '';
        if (text.endsWith('```')) {
          cancelSave(block.id);
          el.innerHTML = '';
          convertBlock(block.id, { type: 'code', content: '' }, 'end');
          return;
        }
        if (text === '---' || text === '***' || text === '___') {
          cancelSave(block.id);
          el.innerHTML = '';
          convertBlock(block.id, { type: 'divider', content: '' });
          // continue writing in a paragraph below
          createBelow(block.id, { type: 'paragraph', content: '', indent: block.indent });
          return;
        }
        if (SPACE_MD[text]) {
          cancelSave(block.id);
          el.innerHTML = '';
          convertBlock(block.id, { type: SPACE_MD[text], content: '' }, 'end');
          return;
        }
      }
    },
     
    [blockOpDeps(), saveContent, slash],
  );

  /* ---------- block mutations with _v bump ---------- */

  const convertBlock = useCallback(
    (id: string, patch: { type?: BlockType; content?: string; meta?: string }, focusPos?: 'start' | 'end') => {
      onPatchBlock(id, patch, { bump: true });
      if (focusPos) requestFocus(id, focusPos);
    },
    [onPatchBlock],
  );

  const createBelow = useCallback(
    async (afterId: string, init: { type?: BlockType; content?: string; indent?: number }) => {
      const nb = await onCreateBlock(afterId, init);
      if (nb) requestFocus(nb.id, 'start');
      return nb;
    },
    [onCreateBlock],
  );

  /* ---------- keyboard ---------- */

  const visibleInfo = useMemo(() => computeVisible(blocks), [blocks]);

  const prevFocusable = useCallback(
    (block: EditableBlock): EditableBlock | null => {
      const vis = visibleInfo.list;
      const idx = vis.findIndex((b) => b.id === block.id);
      for (let i = idx - 1; i >= 0; i--) if (hasEditable(vis[i])) return vis[i];
      return null;
    },
    [visibleInfo],
  );

  const nextFocusable = useCallback(
    (block: EditableBlock): EditableBlock | null => {
      const vis = visibleInfo.list;
      const idx = vis.findIndex((b) => b.id === block.id);
      for (let i = idx + 1; i < vis.length; i++) if (hasEditable(vis[i])) return vis[i];
      return null;
    },
    [visibleInfo],
  );

  const onKey = useCallback(
    async (block: EditableBlock, e: React.KeyboardEvent<HTMLDivElement>) => {
      if (slash && slash.blockId === block.id) return; // SlashMenu intercepts globally
      const el = e.currentTarget as HTMLDivElement;
      const type = block.type;

      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        pendingSlash.current = block.id;
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        if (type === 'code') {
          e.preventDefault();
          document.execCommand('insertText', false, '\n');
          saveContent(block, el);
          return;
        }
        if (type === 'divider' || type === 'image') {
          e.preventDefault();
          createBelow(block.id, { type: 'paragraph', content: '', indent: block.indent });
          return;
        }
        e.preventDefault();
        cancelSave(block.id);
        const isEmpty = htmlToText(el.innerHTML).trim() === '' && !el.querySelector('img');
        if (isEmpty && ['bulleted', 'numbered', 'todo', 'toggle', 'quote'].includes(type)) {
          convertBlock(block.id, { type: 'paragraph' }, 'start');
          return;
        }
        const afterHtml = splitAtCaret(el) ?? '';
        // sync current block state (DOM was split)
        onPatchBlock(block.id, { content: el.innerHTML }, { bump: true });
        if (type === 'toggle') {
          const nb = await onCreateBlock(block.id, { type: 'paragraph', content: afterHtml, indent: block.indent + 1 });
          if (nb) requestFocus(nb.id, 'start');
          return;
        }
        const newType: BlockType = type === 'bulleted' || type === 'numbered' || type === 'todo' ? type : 'paragraph';
        const nb = await onCreateBlock(block.id, { type: newType, content: afterHtml, indent: block.indent });
        if (nb) requestFocus(nb.id, 'start');
        return;
      }

      if (e.key === 'Enter' && e.shiftKey) {
        if (type === 'code') return;
        e.preventDefault();
        document.execCommand('insertText', false, '\n');
        saveContent(block, el);
        return;
      }

      if (e.key === 'Backspace') {
        if (!caretAtStart(el)) return;
        e.preventDefault();
        cancelSave(block.id);
        if (type !== 'paragraph') {
          const keepHtml = el.innerHTML;
          if (type === 'code') convertBlock(block.id, { type: 'paragraph', content: escapeText(htmlToText(keepHtml)) }, 'start');
          else convertBlock(block.id, { type: 'paragraph', content: keepHtml }, 'start');
          return;
        }
        if (block.indent > 0) {
          onPatchBlock(block.id, { indent: block.indent - 1 }, { bump: true });
          requestFocus(block.id, 'start');
          return;
        }
        const prev = prevFocusable(block);
        if (!prev) return;
        if (htmlToText(el.innerHTML).trim() === '' && !el.querySelector('img')) {
          onDeleteBlock(block.id);
          requestFocus(prev.id, 'end');
          return;
        }
        // merge into previous
        const junctionOffset = htmlToText(prev.content).length;
        cancelSave(prev.id);
        onPatchBlock(prev.id, { content: prev.content + el.innerHTML }, { bump: true });
        onDeleteBlock(block.id);
        requestFocus(prev.id, junctionOffset);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const ni = Math.max(0, Math.min(6, block.indent + (e.shiftKey ? -1 : 1)));
        if (ni !== block.indent) onPatchBlock(block.id, { indent: ni }, { bump: true });
        return;
      }

      if (e.key === 'ArrowUp' && caretAtStart(el)) {
        const prev = prevFocusable(block);
        if (prev) {
          e.preventDefault();
          requestFocus(prev.id, 'end');
        }
        return;
      }
      if (e.key === 'ArrowDown' && caretAtEnd(el)) {
        const next = nextFocusable(block);
        if (next) {
          e.preventDefault();
          requestFocus(next.id, 'start');
        }
        return;
      }

      // inline shortcuts
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === 'b' || k === 'i' || k === 'u' || k === 's' || k === 'e') {
          e.preventDefault();
          if (k === 'e') wrapCode();
          else document.execCommand(k === 's' ? 'strikeThrough' : k);
          saveContentFromEl(el);
        }
      }
    },
     
    [blockOpDeps(), slash, prevFocusable, nextFocusable, saveContent, convertBlock, createBelow, onPatchBlock, onDeleteBlock, saveContentFromEl],
  );

  /* ---------- slash selection ---------- */

  const onSlashSelect = useCallback(
    (item: SlashItem) => {
      if (!slash) return;
      const el = editables.current.get(slash.blockId);
      setSlash(null);
      pendingSlash.current = null;
      if (!el) return;
      cancelSave(slash.blockId);
      const q = currentSlashQuery(el);
      if (q) removeSlashQuery(el, q.node, q.offset);
      const html = el.innerHTML;
      const block = blocks.find((b) => b.id === slash.blockId);
      if (!block) return;
      if (item.type === 'divider') {
        convertBlock(block.id, { type: 'divider', content: '' });
        createBelow(block.id, { type: 'paragraph', content: '', indent: block.indent });
      } else if (item.type === 'code') {
        convertBlock(block.id, { type: 'code', content: escapeText(htmlToText(html)) }, 'end');
      } else {
        convertBlock(block.id, { type: item.type, content: html }, 'end');
      }
    },
     
    [blockOpDeps(), slash, convertBlock, createBelow],
  );

  /* ---------- selection toolbar ---------- */

  const lastRange = useRef<Range | null>(null);

  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setToolbar((t) => (t ? null : t));
        return;
      }
      const range = sel.getRangeAt(0);
      const row = (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement
      )?.closest('.block-row') as HTMLElement | null;
      if (!row || !row.dataset.blockId) {
        setToolbar((t) => (t ? null : t));
        return;
      }
      lastRange.current = range.cloneRange();
      setToolbar({ rect: range.getBoundingClientRect(), blockId: row.dataset.blockId });
    };
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, []);

  const applyInline = (cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'code' | 'link', arg?: string) => {
    const sel = window.getSelection();
    if (lastRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(lastRange.current);
    }
    if (cmd === 'code') wrapCode();
    else if (cmd === 'link' && arg) document.execCommand('createLink', false, arg);
    else document.execCommand(cmd);
    const row = lastRange.current?.startContainer.parentElement?.closest('.block-row') as HTMLElement | null;
    const edit = row?.querySelector('.blk-edit') as HTMLDivElement | null;
    if (edit) saveContentFromEl(edit);
    setToolbar(null);
  };

  const wrapCode = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !lastRange.current) return;
    const range = lastRange.current;
    const frag = range.extractContents();
    const code = document.createElement('code');
    code.appendChild(frag);
    range.insertNode(code);
    sel.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(code);
    sel.addRange(after);
    lastRange.current = after.cloneRange();
  };

  /* ---------- drag reorder ---------- */

  const onDropOn = (targetId: string, where: 'top' | 'bottom') => {
    const { draggingId } = drag;
    setDrag({ draggingId: null, overId: null, where: 'top' });
    if (!draggingId || draggingId === targetId) return;
    const ids = blocks.map((b) => b.id);
    const from = ids.indexOf(draggingId);
    if (from === -1) return;
    ids.splice(from, 1);
    let to = ids.indexOf(targetId);
    if (to === -1) return;
    if (where === 'bottom') to += 1;
    ids.splice(to, 0, draggingId);
    onReorder(ids);
  };

  /* ---------- title ---------- */

  const onTitleChange = (v: string) => {
    setTitleValue(v);
    const ta = titleRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
    onPatchPage({ title: v }, { debounce: true });
  };

  const onTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = visibleInfo.list[0];
      if (first && hasEditable(first)) requestFocus(first.id, 'start');
    }
  };

  useLayoutEffect(() => {
    const ta = titleRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [titleValue]);

  /* ---------- body click → focus last block ---------- */

  const onBodyClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    const vis = visibleInfo.list;
    const last = vis[vis.length - 1];
    if (last && hasEditable(last)) requestFocus(last.id, 'end');
    else if (last) createBelow(last.id, { type: 'paragraph', content: '', indent: last.indent });
  };

  /* ---------- rendering ---------- */

  const numbers = visibleInfo.numbers;
  const isFavorite = page.isFavorite;

  return (
    <div className="notion-frame">
      {/* top bar */}
      <div className="topbar">
        <div className="topbar-left">
          <button className="icon-btn" onClick={onToggleSidebar} title={sidebarOpen ? t('sidebar.closeSidebar') : t('sidebar.openSidebar')}>
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map((c) => (
              <React.Fragment key={c.id}>
                <button className="crumb" onClick={() => onNavigate(c.id)} title={c.title || t('sidebar.untitled')}>
                  {c.icon ? <span className="crumb-ico">{c.icon}</span> : <StickyNote size={14} className="crumb-file" />}
                  <span className="crumb-title">{c.title || t('sidebar.untitled')}</span>
                </button>
                <span className="crumb-sep">/</span>
              </React.Fragment>
            ))}
            <button className="crumb current" title={page.title || t('sidebar.untitled')}>
              {page.icon ? <span className="crumb-ico">{page.icon}</span> : <StickyNote size={14} className="crumb-file" />}
              <span className="crumb-title">{page.title || t('sidebar.untitled')}</span>
            </button>
          </nav>
        </div>
        <div className="topbar-right">
          <span className="edited-at" title={new Date(page.updatedAt).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US')}>{editedLabel}</span>
          <button className="txt-btn" onClick={() => {
            navigator.clipboard?.writeText(window.location.href).catch(() => {});
            onToast(t('toast.linkCopied'));
          }}>{t('top.share')}</button>
          <button className="icon-btn" title={t('top.comments')} onClick={() => onToast(t('toast.commentsUnavailable'))}>
            <MessageSquare size={17} />
          </button>
          <button
            className={`icon-btn ${isFavorite ? 'fav' : ''}`}
            title={isFavorite ? t('menu.removeFav') : t('menu.addFav')}
            onClick={() => onPatchPage({ isFavorite: !isFavorite })}
          >
            <Star size={17} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button className="icon-btn" title={t('sidebar.moreOptions')} onClick={(e) => setPageMenuRect((e.currentTarget as HTMLElement).getBoundingClientRect())}>
            <MoreHorizontal size={19} />
          </button>
        </div>
      </div>

      {/* scrollable page */}
      <div className="editor-scroll" ref={scrollRef}>
        {page.cover && (
          <div className="page-cover" style={{ background: page.cover }}>
            <div className="cover-actions">
              <button className="cover-btn" onClick={(e) => onOpenCover((e.currentTarget as HTMLElement).getBoundingClientRect())}>
                <ImagePlus size={14} /> {t('page.changeCover')}
              </button>
            </div>
          </div>
        )}

        <div className="editor-content">
          {/* hero icon */}
          {page.icon ? (
            <button
              className="page-hero-icon"
              onClick={(e) => onOpenEmoji({ kind: 'page' }, (e.currentTarget as HTMLElement).getBoundingClientRect())}
              title={t('page.changeIcon')}
            >
              {page.icon}
            </button>
          ) : null}

          {/* add icon / cover row */}
          {!page.icon && (
            <div className="page-add-row">
              <button className="add-ico-btn" onClick={(e) => onOpenEmoji({ kind: 'page' }, (e.currentTarget as HTMLElement).getBoundingClientRect())}>
                <Smile size={16} /> {t('page.addIcon')}
              </button>
              {!page.cover && (
                <button className="add-ico-btn" onClick={(e) => onOpenCover((e.currentTarget as HTMLElement).getBoundingClientRect())}>
                  <ImagePlus size={16} /> {t('page.addCover')}
                </button>
              )}
            </div>
          )}
          {page.icon && !page.cover && (
            <div className="page-add-row">
              <button className="add-ico-btn" onClick={(e) => onOpenCover((e.currentTarget as HTMLElement).getBoundingClientRect())}>
                <ImagePlus size={16} /> {t('page.addCover')}
              </button>
            </div>
          )}

          <textarea
            ref={titleRef}
            className="page-title"
            value={titleValue}
            placeholder={t('sidebar.untitled')}
            rows={1}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={onTitleKeyDown}
            aria-label={t('page.title')}
          />

          {/* date property — every note carries its day, Notion-style */}
          <div className="page-date-row">
            <button
              className={`date-chip ${page.date ? '' : 'empty'}`}
              onClick={(e) => setDatePop((e.currentTarget as HTMLElement).getBoundingClientRect())}
            >
              <CalendarDays size={15} />
              {page.date ? (
                <span className="date-chip-labels">
                  <span className="date-chip-main">{dayLong(page.date, lang, lang === 'fa' ? 'jalali' : 'gregorian')}</span>
                  <span className="date-chip-sec">{otherCalShort(page.date, lang, lang === 'fa' ? 'jalali' : 'gregorian')}</span>
                </span>
              ) : (
                <span>{t('page.addDate')}</span>
              )}
            </button>
          </div>

          {/* blocks */}
          <div className="blocks">
            {visibleInfo.list.map((b) => (
              <BlockRow
                key={b.id}
                block={b}
                numberLabel={numbers.get(b.id) ?? null}
                showPh={visibleInfo.list.length === 1 && b.type === 'paragraph'}
                registerEditable={registerEditable}
                onInput={handleInput}
                onKey={onKey}
                onCheck={(id, checked) => onPatchBlock(id, { checked }, { bump: false })}
                onToggleCollapse={(id, collapsed) => onPatchBlock(id, { collapsed }, { bump: false })}
                onOpenHandleMenu={(blk, rect) => setHandleMenu({ blockId: blk.id, rect, mode: 'main' })}
                onPlusClick={(blk) => createBelow(blk.id, { type: 'paragraph', content: '', indent: blk.indent })}
                onOpenSlash={() => {}}
                onImageSet={(id, url) => onPatchBlock(id, { content: url }, { bump: true })}
                onCodeLang={(id, codeLang) => {
                  const blk = blocks.find((x) => x.id === id);
                  onPatchBlock(id, { meta: JSON.stringify({ ...parseMeta(blk?.meta || ''), lang: codeLang }) }, { bump: false });
                }}
                onCodeCopy={(content) => {
                  navigator.clipboard?.writeText(htmlToText(content)).catch(() => {});
                  onToast(t('toast.codeCopied'));
                }}
                onCalloutEmoji={(blk, rect) => onOpenEmoji({ kind: 'callout', blockId: blk.id }, rect)}
                onDropOn={onDropOn}
                onDragHover={(id, where) => setDrag((d) => (d.overId === id && d.where === where ? d : { ...d, overId: id, where }))}
                dragOver={drag.overId === b.id ? drag.where : null}
                isDragging={drag.draggingId === b.id}
                onDragStart={(id) => setDrag({ draggingId: id, overId: null, where: 'top' })}
                onDragEnd={() => setDrag({ draggingId: null, overId: null, where: 'top' })}
              />
            ))}
          </div>

          <div className="editor-bottom" onClick={onBodyClick} />
        </div>
      </div>

      {/* slash menu */}
      {slash && (
        <SlashMenu
          rect={slash.rect}
          query={slash.query}
          onSelect={onSlashSelect}
          onClose={() => setSlash(null)}
        />
      )}

      {/* block handle menu */}
      {handleMenu && (
        <BlockHandleMenu
          rect={handleMenu.rect}
          mode={handleMenu.mode}
          onClose={() => setHandleMenu(null)}
          onDelete={() => {
            const idx = blocks.findIndex((b) => b.id === handleMenu.blockId);
            onDeleteBlock(handleMenu.blockId);
            const next = blocks[idx + 1] || blocks[idx - 1];
            if (next && hasEditable(next)) requestFocus(next.id, 'start');
            setHandleMenu(null);
          }}
          onDuplicate={() => {
            const b = blocks.find((x) => x.id === handleMenu.blockId);
            if (b) onCreateBlock(b.id, { type: b.type, content: b.content, indent: b.indent });
            setHandleMenu(null);
          }}
          onTurnInto={() => setHandleMenu({ ...handleMenu, mode: 'turninto' })}
          onTurnSelect={(t) => {
            const b = blocks.find((x) => x.id === handleMenu.blockId);
            const el = editables.current.get(handleMenu.blockId);
            const html = el ? el.innerHTML : b?.content || '';
            if (t === 'code') convertBlock(handleMenu.blockId, { type: 'code', content: escapeText(htmlToText(html)) }, 'end');
            else if (b?.type === 'code') convertBlock(handleMenu.blockId, { type: t, content: escapeText(htmlToText(html)) }, 'end');
            else convertBlock(handleMenu.blockId, { type: t, content: html }, 'end');
            setHandleMenu(null);
          }}
        />
      )}

      {/* page menu */}
      {pageMenuRect && (
        <PageMenu
          rect={pageMenuRect}
          isFavorite={isFavorite}
          isPinned={!!page.isPinned}
          wordCount={wordCount(blocks, titleValue)}
          onClose={() => setPageMenuRect(null)}
          onToggleFavorite={() => onPatchPage({ isFavorite: !isFavorite })}
          onTogglePin={() => {
            onPatchPage({ isPinned: !page.isPinned });
            setPageMenuRect(null);
          }}
          onDuplicate={() => {
            onDuplicatePage();
            setPageMenuRect(null);
          }}
          onTrash={() => {
            onTrashPage();
            setPageMenuRect(null);
          }}
          onToggleDark={onToggleDark}
        />
      )}

      {/* note-date picker */}
      {datePop && (
        <Popover rect={datePop} width={288} onClose={() => setDatePop(null)}>
          <MiniMonth
            value={page.date}
            onPick={(iso) => {
              onPatchPage({ date: iso });
              onToast(t('toast.dateChanged'));
              setDatePop(null);
            }}
          />
          {page.date && (
            <>
              <div className="menu-sep" />
              <MenuRow
                icon={<Trash2 size={15} />}
                label={t('page.removeDate')}
                danger
                onClick={() => {
                  onPatchPage({ date: null });
                  onToast(t('toast.dateRemoved'));
                  setDatePop(null);
                }}
              />
            </>
          )}
        </Popover>
      )}

      {/* selection toolbar */}
      {toolbar && (
        <SelectionToolbar
          rect={toolbar.rect}
          onApply={applyInline}
        />
      )}
    </div>
  );

  /* helper deps bundle (stable per render) */
  function blockOpDeps() {
    return [blocks, page.id];
  }
}

/* ---------- selection toolbar component ---------- */

function SelectionToolbar({ rect, onApply }: { rect: DOMRect; onApply: (cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'code' | 'link', arg?: string) => void }) {
  useLang();
  const [mode, setMode] = useState<'buttons' | 'link'>('buttons');
  const [link, setLink] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'link') inputRef.current?.focus();
  }, [mode]);

  const top = Math.max(8, rect.top - 44);
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - 120, window.innerWidth - 250));

  if (mode === 'link') {
    return (
      <div className="sel-toolbar" style={{ top, left }}>
        <input
          ref={inputRef}
          className="link-input"
          placeholder={t('sel.pasteLink')}
          dir="auto"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && link.trim()) {
              e.preventDefault();
              onApply('link', link.trim());
            }
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
        />
        <button className="link-go" onMouseDown={(e) => e.preventDefault()} onClick={() => link.trim() && onApply('link', link.trim())}>
          {t('sel.link')}
        </button>
      </div>
    );
  }

  return (
    <div className="sel-toolbar" style={{ top, left }} contentEditable={false}>
      {(
        [
          ['bold', <Bold key="b" size={15} />, t('sel.bold')],
          ['italic', <Italic key="i" size={15} />, t('sel.italic')],
          ['underline', <UnderlineIcon key="u" size={15} />, t('sel.underline')],
          ['strikeThrough', <Strikethrough key="s" size={15} />, t('sel.strike')],
          ['code', null, t('sel.code')],
        ] as const
      ).map(([cmd, icon, title]) => (
        <button key={cmd} title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => onApply(cmd as never)}>
          {cmd === 'code' ? <span className="mono-ico">‹›</span> : icon}
        </button>
      ))}
      <span className="sel-sep" />
      <button title={t('sel.link')} onMouseDown={(e) => e.preventDefault()} onClick={() => setMode('link')}>
        <Link2 size={15} />
      </button>
    </div>
  );
}

/* ---------- shared helpers ---------- */

export function hasEditable(b: Block): boolean {
  return b.type !== 'divider' && !(b.type === 'image' && b.content);
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wordCount(blocks: EditableBlock[], title: string): number {
  const all = title + ' ' + blocks.map((b) => htmlToText(b.content)).join(' ');
  const m = all.trim().match(/\S+/g);
  return m ? m.length : 0;
}

function computeVisible(blocks: EditableBlock[]) {
  const list: EditableBlock[] = [];
  const numbers = new Map<string, number>();
  let hideUntil: number | null = null;
  let counters: number[] = [];
  for (const b of blocks) {
    if (hideUntil !== null) {
      if (b.indent > hideUntil) continue;
      hideUntil = null;
    }
    list.push(b);
    if (b.type === 'numbered') {
      counters = counters.slice(0, b.indent + 1);
      counters[b.indent] = (counters[b.indent] || 0) + 1;
      numbers.set(b.id, counters[b.indent]);
    } else {
      counters = counters.slice(0, b.indent);
    }
    if (b.type === 'toggle' && b.collapsed) hideUntil = b.indent;
  }
  return { list, numbers };
}
