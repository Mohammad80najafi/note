// Caret / selection helpers for contenteditable blocks

export function placeCaret(el: HTMLElement, pos: 'start' | 'end' | number) {
  const range = document.createRange();
  range.selectNodeContents(el);
  if (pos === 'start') {
    range.collapse(true);
  } else if (pos === 'end') {
    range.collapse(false);
  } else {
    // place at text offset
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remaining = pos as number;
    let node: Node | null = null;
    while (walker.nextNode()) {
      const t = walker.currentNode;
      const len = (t.textContent || '').length;
      if (remaining <= len) {
        node = t;
        range.setStart(t, remaining);
        break;
      }
      remaining -= len;
    }
    if (!node) {
      range.collapse(false);
    } else {
      range.collapse(true);
    }
  }
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export function caretAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const r = sel.getRangeAt(0);
  if (!r.collapsed) return false;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  try {
    pre.setEnd(r.startContainer, r.startOffset);
  } catch {
    return false;
  }
  return pre.toString().length === 0;
}

export function caretAtEnd(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const r = sel.getRangeAt(0);
  if (!r.collapsed) return false;
  const post = document.createRange();
  try {
    post.setStart(r.endContainer, r.endOffset);
  } catch {
    return false;
  }
  post.selectNodeContents(el);
  post.setStart(r.endContainer, r.endOffset);
  return post.toString().length === 0;
}

export function getCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0).cloneRange();
  let rect = r.getBoundingClientRect();
  if (rect.top === 0 && rect.left === 0) {
    // empty node edge case: use a temp span
    const span = document.createElement('span');
    span.textContent = '\u200b';
    r.insertNode(span);
    rect = span.getBoundingClientRect();
    span.remove();
  }
  return rect;
}

/** Split the content of an editable element at the caret. Returns the HTML AFTER the caret (removed from el). */
export function splitAtCaret(el: HTMLElement): string | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  const after = document.createRange();
  after.setStart(r.endContainer, r.endOffset);
  after.setEndAfter(el.lastChild || el);
  const frag = after.extractContents();
  const div = document.createElement('div');
  div.appendChild(frag);
  normalizeEmpty(el);
  return div.innerHTML;
}

/** remove trailing <br> / zero-height leftovers */
export function normalizeEmpty(el: HTMLElement) {
  if (el.innerHTML === '<br>' || el.innerHTML === '\n' || el.innerHTML === '<div><br></div>') {
    el.innerHTML = '';
  }
}

export function htmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

/** Find the position (node index) of the last "/" before the caret within el; returns null if not found in the caret's text node chain */
export function findSlashBeforeCaret(el: HTMLElement): { node: Text; offset: number } | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  let node = r.startContainer;
  // walk back through siblings (and up a bit) looking for '/'
  let cur: Node | null = node;
  for (let hops = 0; hops < 4 && cur; hops++) {
    if (cur.nodeType === Node.TEXT_NODE) {
      const idx = (cur.textContent || '').lastIndexOf('/');
      if (idx >= 0 && (cur !== r.startContainer || idx < r.startOffset || r.startContainer !== r.endContainer)) {
        if (cur === r.startContainer && idx >= r.startOffset) {
          // slash is after caret in same node — keep walking back to previous part? treat as not found
          if (idx === r.startOffset - 1 || idx < r.startOffset) return { node: cur as Text, offset: idx };
          return null;
        }
        return { node: cur as Text, offset: idx };
      }
    }
    cur = cur.previousSibling;
  }
  return null;
}

export function currentSlashQuery(el: HTMLElement): { node: Text; offset: number; query: string } | null {
  const found = findSlashBeforeCaret(el);
  if (!found) return null;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (r.startContainer !== found.node) return null;
  const query = (found.node.textContent || '').slice(found.offset + 1, r.startOffset);
  if (/\s/.test(query) || query.length > 24) return null;
  return { node: found.node, offset: found.offset, query };
}

export function removeSlashQuery(el: HTMLElement, slashNode: Text, slashOffset: number) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const range = document.createRange();
  range.setStart(slashNode, slashOffset);
  try {
    range.setEnd(r.endContainer, r.endOffset);
  } catch {
    range.setEnd(slashNode, slashNode.length);
  }
  range.deleteContents();
}

export function isEditableFocused(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  return el.contains(sel.anchorNode) && el.contains(sel.focusNode);
}

/** Escape HTML entities for plain text insertion */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
