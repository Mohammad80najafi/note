import React from 'react';
import {
  AlignLeft,
  Heading1,
  Heading2,
  Heading3,
  ListTodo,
  List,
  ListOrdered,
  ChevronRight,
  TextQuote,
  Minus,
  Info,
  SquareCode,
  Image as ImageIcon,
} from 'lucide-react';
import type { BlockType } from './types';
import type { TKey } from './i18n';

export interface SlashItem {
  type: BlockType;
  labelKey: TKey;
  descKey: TKey;
  icon: React.ReactNode;
  groupKey: TKey;
  keywords: string;
}

export const SLASH_ITEMS: SlashItem[] = [
  { type: 'paragraph', labelKey: 'slash.text', descKey: 'slash.textDesc', icon: <AlignLeft size={16} />, groupKey: 'slash.groupBasic', keywords: 'text paragraph plain متن نوشته پاراگراف' },
  { type: 'heading_1', labelKey: 'slash.h1', descKey: 'slash.h1Desc', icon: <Heading1 size={16} />, groupKey: 'slash.groupBasic', keywords: 'h1 title big heading سرتیتر عنوان بزرگ' },
  { type: 'heading_2', labelKey: 'slash.h2', descKey: 'slash.h2Desc', icon: <Heading2 size={16} />, groupKey: 'slash.groupBasic', keywords: 'h2 medium subtitle heading سرتیتر میانه عنوان' },
  { type: 'heading_3', labelKey: 'slash.h3', descKey: 'slash.h3Desc', icon: <Heading3 size={16} />, groupKey: 'slash.groupBasic', keywords: 'h3 small heading سرتیتر کوچک' },
  { type: 'todo', labelKey: 'slash.todo', descKey: 'slash.todoDesc', icon: <ListTodo size={16} />, groupKey: 'slash.groupBasic', keywords: 'todo task checkbox check کار تسک چکباکس چک' },
  { type: 'bulleted', labelKey: 'slash.bulleted', descKey: 'slash.bulletedDesc', icon: <List size={16} />, groupKey: 'slash.groupBasic', keywords: 'bullet unordered point list نقطه فهرست لیست' },
  { type: 'numbered', labelKey: 'slash.numbered', descKey: 'slash.numberedDesc', icon: <ListOrdered size={16} />, groupKey: 'slash.groupBasic', keywords: 'number ordered list شماره ترتیب فهرست' },
  { type: 'toggle', labelKey: 'slash.toggle', descKey: 'slash.toggleDesc', icon: <ChevronRight size={16} />, groupKey: 'slash.groupBasic', keywords: 'toggle collapse fold بازشو جمعشونده تاگل' },
  { type: 'quote', labelKey: 'slash.quote', descKey: 'slash.quoteDesc', icon: <TextQuote size={16} />, groupKey: 'slash.groupBasic', keywords: 'quote blockquote cite نقل قول' },
  { type: 'callout', labelKey: 'slash.callout', descKey: 'slash.calloutDesc', icon: <Info size={16} />, groupKey: 'slash.groupBasic', keywords: 'callout note info panel برجسته یادداشت' },
  { type: 'divider', labelKey: 'slash.divider', descKey: 'slash.dividerDesc', icon: <Minus size={16} />, groupKey: 'slash.groupBasic', keywords: 'divider line hr separator جدا کننده خط' },
  { type: 'code', labelKey: 'slash.code', descKey: 'slash.codeDesc', icon: <SquareCode size={16} />, groupKey: 'slash.groupMedia', keywords: 'code snippet pre mono کد برنامهنویسی snippet' },
  { type: 'image', labelKey: 'slash.image', descKey: 'slash.imageDesc', icon: <ImageIcon size={16} />, groupKey: 'slash.groupMedia', keywords: 'image picture photo embed تصویر عکس' },
];

export const EMOJIS = [
  '💡','🔥','🚀','📝','📌','📌','⭐','✅','❗','❓','⏰','📅','🎯','📊','📈','📉','🧠','🦀','🤖','💻',
  '🖥️','📱','⚡','🌈','☀️','🌙','⛅','☁️','🌊','🌱','🌳','🍀','🌸','🌺','🌻','🌹','🍎','🍋','🍇','🍉',
  '🍕','🍔','🍟','🍜','🍣','🍰','☕','🍵','🍺','🎁','🎉','🎊','🎨','🎬','🎵','🎧','📷','🏠','✈️','🚗',
  '⚽','🏀','🎾','🏆','🥇','💰','💎','🔑','🔒','🛠️','🧩','📚','📖','✏️','🖊️','🗂️','📁','🗓️','⏳','⌛',
  '🔔','📣','💬','🗨️','👍','👎','👏','🙌','🤝','💪','🙏','😊','😂','😍','🤔','😎','🥳','😴','🫡','👀',
  '🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟥','🟧','🟨','🟩','🟦','🟪','◼️','◻️','❤️','🧡','💛','💚',
  '🗺️','🧭','🧪','🔬','🔭','📡','🛰️','🧲','🧬','💊','🏥','✂️','📦','🚚','🏭','💼','📎','📏','📐','🗓',
];

export const GRADIENTS = [
  'linear-gradient(120deg, #FFD3A5 0%, #FD6585 100%)',
  'linear-gradient(120deg, #FCCB90 0%, #D57EEB 100%)',
  'linear-gradient(120deg, #84FAB0 0%, #8FD3F4 100%)',
  'linear-gradient(120deg, #A1C4FD 0%, #C2E9FB 100%)',
  'linear-gradient(120deg, #FBC2EB 0%, #A6C1EE 100%)',
  'linear-gradient(120deg, #F6D365 0%, #FDA085 100%)',
  'linear-gradient(120deg, #5EFCE8 0%, #736EFE 100%)',
  'linear-gradient(120deg, #F093FB 0%, #F5576C 100%)',
  'linear-gradient(120deg, #4FACFE 0%, #00F2FE 100%)',
  'linear-gradient(120deg, #30cfd0 0%, #330867 100%)',
];

export const CODE_LANGS = [
  'Plain Text', 'TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'Java', 'C', 'C++',
  'HTML', 'CSS', 'SQL', 'Bash', 'JSON', 'YAML',
];

export const CALLOUT_EMOJI_DEFAULT = '💡';

export function randomEmoji(): string {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

export function parseMeta(meta: string): Record<string, string> {
  if (!meta) return {};
  try {
    const v = JSON.parse(meta);
    return typeof v === 'object' && v ? v : {};
  } catch {
    return {};
  }
}

export function pageIcon(p: { icon?: string | null } | null | undefined): string {
  return p?.icon || '';
}
