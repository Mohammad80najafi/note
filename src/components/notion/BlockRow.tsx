'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { Plus, GripVertical, Copy, Check } from 'lucide-react';
import type { Block, BlockType } from '@/lib/notion/types';
import { CODE_LANGS, CALLOUT_EMOJI_DEFAULT, parseMeta } from '@/lib/notion/constants';
import { t, useLang, fmtNum } from '@/lib/notion/i18n';

/* ---------- inner editable that never fights the caret ---------- */

interface EditableProps {
  html: string;
  className?: string;
  ph?: string;
  showPh?: boolean;
  plainPaste?: boolean;
  register: (el: HTMLDivElement | null) => void;
  onInput: (el: HTMLDivElement) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus?: () => void;
}

const Editable = React.memo(function Editable({
  html,
  className = '',
  ph = '',
  showPh = false,
  register,
  onInput,
  onKeyDown,
  onFocus,
}: EditableProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastHtml = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (lastHtml.current === null) {
      // first mount: adopt server content
      el.innerHTML = html;
      lastHtml.current = html;
      return;
    }
    if (html !== lastHtml.current && html !== el.innerHTML) {
      el.innerHTML = html;
    }
    lastHtml.current = html;
  }, [html]);

  useLayoutEffect(() => {
    register(ref.current);
    return () => register(null);
     
  }, []);

  const isEmpty = !html || html === '<br>' || html === '<div><br></div>';

  return (
    <div
      ref={ref}
      className={`blk-edit ${className} ${isEmpty && showPh ? 'show-ph' : ''}`}
      data-ph={ph}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(e) => {
        const el = e.currentTarget;
        if (el.innerHTML === '<br>' || el.innerHTML === '<div><br></div>') el.innerHTML = '';
        lastHtml.current = el.innerHTML;
        onInput(el);
      }}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }}
    />
  );
});

/* ---------- BlockRow ---------- */

export interface BlockRowProps {
  block: Block;
  numberLabel: number | null;
  showPh: boolean;
  registerEditable: (id: string, el: HTMLDivElement | null) => void;
  onInput: (block: Block, el: HTMLDivElement) => void;
  onKey: (block: Block, e: React.KeyboardEvent<HTMLDivElement>) => void;
  onCheck: (id: string, checked: boolean) => void;
  onToggleCollapse: (id: string, collapsed: boolean) => void;
  onOpenHandleMenu: (block: Block, rect: DOMRect) => void;
  onPlusClick: (block: Block) => void;
  onOpenSlash: (block: Block) => void;
  onImageSet: (id: string, url: string) => void;
  onCodeLang: (id: string, lang: string) => void;
  onCodeCopy: (content: string) => void;
  onCalloutEmoji: (block: Block, rect: DOMRect) => void;
  onDropOn: (targetId: string, where: 'top' | 'bottom') => void;
  onDragHover: (targetId: string, where: 'top' | 'bottom') => void;
  dragOver: 'top' | 'bottom' | null;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

export const BlockRow = React.memo(function BlockRow({
  block,
  numberLabel,
  showPh,
  registerEditable,
  onInput,
  onKey,
  onCheck,
  onToggleCollapse,
  onOpenHandleMenu,
  onPlusClick,
  onOpenSlash,
  onImageSet,
  onCodeLang,
  onCodeCopy,
  onCalloutEmoji,
  onDropOn,
  onDragHover,
  dragOver,
  isDragging,
  onDragStart,
  onDragEnd,
}: BlockRowProps) {
  const [imgUrl, setImgUrl] = useState('');
  const meta = parseMeta(block.meta);
  useLang();

  const editableProps = (cls: string, ph = '', onFocus?: () => void) => ({
    html: block.content,
    className: cls,
    ph,
    showPh,
    register: (el: HTMLDivElement | null) => registerEditable(block.id, el),
    onInput: (el: HTMLDivElement) => onInput(block, el),
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => onKey(block, e),
    onFocus,
  });

  const handles = (
    <div className="block-controls" contentEditable={false}>
      <button
        className="ctrl-btn"
        title={t('block.addBelow')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPlusClick(block)}
      >
        <Plus size={17} strokeWidth={2.2} />
      </button>
      <button
        className="ctrl-btn grip"
        title={t('block.dragMenu')}
        draggable
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => onOpenHandleMenu(block, (e.currentTarget as HTMLElement).getBoundingClientRect())}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', block.id);
          onDragStart(block.id);
        }}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={15} strokeWidth={2.4} />
      </button>
    </div>
  );

  let content: React.ReactNode = null;

  switch (block.type) {
    case 'heading_1':
      content = <Editable {...editableProps('blk-h1', t('editor.heading1'))} />;
      break;
    case 'heading_2':
      content = <Editable {...editableProps('blk-h2', t('editor.heading2'))} />;
      break;
    case 'heading_3':
      content = <Editable {...editableProps('blk-h3', t('editor.heading3'))} />;
      break;
    case 'bulleted':
      content = (
        <div className="blk-flex">
          <span className="bullet-dot" contentEditable={false} />
          <Editable {...editableProps('blk-p flex-1')} />
        </div>
      );
      break;
    case 'numbered':
      content = (
        <div className="blk-flex">
          <span className="number-label" contentEditable={false}>{fmtNum(numberLabel ?? 1)}.</span>
          <Editable {...editableProps('blk-p flex-1')} />
        </div>
      );
      break;
    case 'todo':
      content = (
        <div className="blk-flex">
          <button
            className={`todo-check ${block.checked ? 'done' : ''}`}
            contentEditable={false}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCheck(block.id, !block.checked)}
            aria-label={t('block.toggleTask')}
          >
            {block.checked && (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <Editable {...editableProps(`blk-p flex-1 ${block.checked ? 'todo-done' : ''}`)} />
        </div>
      );
      break;
    case 'toggle':
      content = (
        <div className="blk-flex">
          <button
            className={`toggle-tri ${block.collapsed ? '' : 'open'}`}
            contentEditable={false}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onToggleCollapse(block.id, !block.collapsed)}
            aria-label={t('block.toggle')}
          />
          <Editable {...editableProps('blk-p flex-1')} />
        </div>
      );
      break;
    case 'quote':
      content = <Editable {...editableProps('blk-quote', t('editor.emptyQuote'))} />;
      break;
    case 'callout':
      content = (
        <div className="blk-callout">
          <button
            className="callout-emoji"
            contentEditable={false}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => onCalloutEmoji(block, (e.currentTarget as HTMLElement).getBoundingClientRect())}
            title={t('block.changeEmoji')}
          >
            {meta.emoji || CALLOUT_EMOJI_DEFAULT}
          </button>
          <Editable {...editableProps('blk-p flex-1')} />
        </div>
      );
      break;
    case 'code':
      content = (
        <div className="blk-code">
          <div className="code-top" contentEditable={false}>
            <div className="code-lang-wrap">
              <select
                className="code-lang"
                value={meta.lang || 'Plain Text'}
                onChange={(e) => onCodeLang(block.id, e.target.value)}
              >
                {CODE_LANGS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <button className="code-copy" onClick={() => onCodeCopy(block.content)} title={t('block.copyCode')}>
              <Copy size={12} /> {t('block.copy')}
            </button>
          </div>
          <Editable {...editableProps('blk-code-text', '')} />
        </div>
      );
      break;
    case 'divider':
      content = <hr className="blk-divider" contentEditable={false} />;
      break;
    case 'image':
      content = block.content ? (
        <img className="blk-img" src={block.content} alt="" contentEditable={false} draggable={false} />
      ) : (
        <div className="img-form" contentEditable={false}>
          <input
            className="img-input"
            placeholder={t('block.pasteImage')}
            dir="auto"
            value={imgUrl}
            onChange={(e) => setImgUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && imgUrl.trim()) onImageSet(block.id, imgUrl.trim());
            }}
          />
          <button className="img-embed" onClick={() => imgUrl.trim() && onImageSet(block.id, imgUrl.trim())}>
            {t('block.embedLink')}
          </button>
        </div>
      );
      break;
    default:
      content = <Editable {...editableProps('blk-p', showPh ? t('editor.placeholder') : '')} />;
  }

  return (
    <div
      className={`block-row ${isDragging ? 'dragging' : ''}`}
      data-block-id={block.id}
      style={{ marginLeft: block.indent * 24 }}
      onDragOver={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const where = e.clientY < r.top + r.height / 2 ? 'top' : 'bottom';
        e.dataTransfer.dropEffect = 'move';
        onDragHover(block.id, where);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const where = dragOver || 'bottom';
        onDropOn(block.id, where);
      }}
    >
      {handles}
      {dragOver === 'top' && <div className="drag-indicator top" />}
      {dragOver === 'bottom' && <div className="drag-indicator bottom" />}
      {content}
    </div>
  );
});

export type { BlockType };
