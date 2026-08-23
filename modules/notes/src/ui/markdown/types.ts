export type ContainerDirective =
  | 'tip'
  | 'warning'
  | 'danger'
  | 'note'
  | 'info'
  | 'details'
  | 'card'
  | 'steps'
  | 'file-tree'
  | 'tabs'
  | 'code-tree'
  | 'timeline'
  | 'chat'
  | 'qrcode'
  | 'collapse'
  | 'window'
  | 'flex'
  | 'bilibili'
  | 'youtube'
  | 'pdf';

export type BadgeType = 'tip' | 'warning' | 'danger' | 'info' | 'success' | 'gray';

export interface TextNode {
  type: 'text';
  value: string;
}

export interface BoldNode {
  type: 'bold';
  children: InlineNode[];
}

export interface ItalicNode {
  type: 'italic';
  children: InlineNode[];
}

export interface StrikeNode {
  type: 'strike';
  children: InlineNode[];
}

export interface HighlightNode {
  type: 'highlight';
  children: InlineNode[];
}

export interface SpoilerNode {
  type: 'spoiler';
  children: InlineNode[];
}

export interface InlineCodeNode {
  type: 'code';
  code: string;
}

export interface LinkNode {
  type: 'link';
  text: string;
  href: string;
  title?: string;
}

export interface ImageNode {
  type: 'image';
  alt: string;
  src: string;
  title?: string;
}

export interface WikiLinkNode {
  type: 'wikilink';
  target: string;
  alias?: string;
}

export interface InlineMathNode {
  type: 'math';
  formula: string;
}

export interface BadgeNode {
  type: 'badge';
  text: string;
  badgeType: BadgeType;
}

export interface IconNode {
  type: 'icon';
  icon: string;
}

export interface AbbrNode {
  type: 'abbr';
  term: string;
  explanation: string;
}

export interface KbdNode {
  type: 'kbd';
  text: string;
}

export interface SubNode {
  type: 'sub';
  children: InlineNode[];
}

export interface SupNode {
  type: 'sup';
  children: InlineNode[];
}

export type InlineNode =
  | TextNode
  | BoldNode
  | ItalicNode
  | StrikeNode
  | HighlightNode
  | SpoilerNode
  | InlineCodeNode
  | LinkNode
  | ImageNode
  | WikiLinkNode
  | InlineMathNode
  | BadgeNode
  | IconNode
  | AbbrNode
  | KbdNode
  | SubNode
  | SupNode;

export interface HeadingNode {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  id: string;
  text: string;
  inlines: InlineNode[];
}

export interface ParagraphNode {
  type: 'paragraph';
  inlines: InlineNode[];
}

export interface BlockquoteNode {
  type: 'blockquote';
  children: BlockNode[];
}

export interface ListItemNode {
  inlines: InlineNode[];
  checked?: boolean | null;
  children?: BlockNode[];
}

export interface ListNode {
  type: 'list';
  ordered: boolean;
  start?: number;
  items: ListItemNode[];
}

export interface TableCellNode {
  inlines: InlineNode[];
}

export type TableAlignment = 'left' | 'center' | 'right' | null;

export interface TableNode {
  type: 'table';
  headers: TableCellNode[];
  alignments: TableAlignment[];
  rows: TableCellNode[][];
}

export interface CodeBlockNode {
  type: 'code-block';
  lang: string;
  meta?: string;
  code: string;
}

export interface MermaidBlockNode {
  type: 'mermaid';
  code: string;
}

export interface MathBlockNode {
  type: 'math-block';
  formula: string;
}

export interface ThematicBreakNode {
  type: 'thematic-break';
}

export interface TabItem {
  title: string;
  lang?: string;
  children: BlockNode[];
}

export interface FileTreeItem {
  name: string;
  isDir: boolean;
  level: number;
}

export interface TimelineItem {
  date?: string;
  title?: string;
  inlines: InlineNode[];
  description?: string;
  descriptionInlines?: InlineNode[];
  children?: BlockNode[];
}

export interface ChatItem {
  role: 'user' | 'bot' | 'left' | 'right';
  author?: string;
  avatar?: string;
  time?: string;
  inlines: InlineNode[];
  rawText?: string;
}

export interface StepItem {
  stepNumber: number;
  title: string;
  inlines: InlineNode[];
  children?: BlockNode[];
}

export interface ContainerNode {
  type: 'container';
  directive: ContainerDirective;
  title?: string;
  params: Record<string, string>;
  rawContent: string;
  children?: BlockNode[];
  tabItems?: TabItem[];
  fileTreeItems?: FileTreeItem[];
  timelineItems?: TimelineItem[];
  chatItems?: ChatItem[];
  stepItems?: StepItem[];
}

export type BlockNode =
  | HeadingNode
  | ParagraphNode
  | BlockquoteNode
  | ListNode
  | TableNode
  | CodeBlockNode
  | MermaidBlockNode
  | MathBlockNode
  | ThematicBreakNode
  | ContainerNode;

export interface TocItem {
  id: string;
  level: number;
  text: string;
}
