import React, { useState } from 'react';
import { parseMarkdown } from './parser.js';
import { generateQrSvg } from './qrcode.js';
import type { BadgeType, BlockNode, ContainerNode, InlineNode, TableAlignment } from './types.js';

export interface NoteMarkdownViewerProps {
  content: string;
  className?: string;
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
  interactive?: boolean;
}

/**
 * Typora 级富 Markdown 扩展解析与多容器渲染引擎组件。
 */
export function NoteMarkdownViewer({
  content,
  className = '',
  onWikiLinkClick,
  onTodoLinkClick,
  interactive = true,
}: NoteMarkdownViewerProps) {
  const blocks = parseMarkdown(content);

  return (
    <div
      className={`prose prose-zinc dark:prose-invert max-w-none text-sm leading-relaxed ${className}`}
    >
      {blocks.map((block, idx) => (
        <BlockRenderer
          key={idx}
          block={block}
          onWikiLinkClick={onWikiLinkClick}
          onTodoLinkClick={onTodoLinkClick}
          interactive={interactive}
        />
      ))}
    </div>
  );
}

function BlockRenderer({
  block,
  onWikiLinkClick,
  onTodoLinkClick,
  interactive,
}: {
  block: BlockNode;
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
  interactive: boolean;
}) {
  switch (block.type) {
    case 'heading': {
      const headingClass =
        block.level === 1
          ? 'text-2xl font-bold mt-6 mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-800'
          : block.level === 2
            ? 'text-xl font-bold mt-5 mb-2 pb-1 border-b border-zinc-100 dark:border-zinc-800/60'
            : block.level === 3
              ? 'text-lg font-semibold mt-4 mb-2'
              : 'text-base font-semibold mt-3 mb-1';

      const inner = (
        <InlineRenderer
          inlines={block.inlines}
          onWikiLinkClick={onWikiLinkClick}
          onTodoLinkClick={onTodoLinkClick}
        />
      );
      const props = {
        id: block.id,
        className: `${headingClass} scroll-mt-16 text-zinc-900 dark:text-zinc-100`,
      };

      if (block.level === 1) return <h1 {...props}>{inner}</h1>;
      if (block.level === 2) return <h2 {...props}>{inner}</h2>;
      if (block.level === 3) return <h3 {...props}>{inner}</h3>;
      if (block.level === 4) return <h4 {...props}>{inner}</h4>;
      if (block.level === 5) return <h5 {...props}>{inner}</h5>;
      return <h6 {...props}>{inner}</h6>;
    }

    case 'paragraph':
      return (
        <p className="my-2.5 text-zinc-700 dark:text-zinc-300">
          <InlineRenderer
            inlines={block.inlines}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
          />
        </p>
      );

    case 'blockquote':
      return (
        <blockquote className="my-3 pl-4 border-l-4 border-amber-400 bg-amber-50/30 dark:bg-amber-950/10 py-1.5 rounded-r text-zinc-600 dark:text-zinc-400 italic">
          {block.children.map((child, idx) => (
            <BlockRenderer
              key={idx}
              block={child}
              onWikiLinkClick={onWikiLinkClick}
              onTodoLinkClick={onTodoLinkClick}
              interactive={interactive}
            />
          ))}
        </blockquote>
      );

    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag
          className={`my-2.5 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'} space-y-1 text-zinc-700 dark:text-zinc-300`}
        >
          {block.items.map((item, idx) => (
            <li
              key={idx}
              className={
                item.checked !== null && item.checked !== undefined
                  ? 'list-none -ml-4 flex items-start gap-2'
                  : ''
              }
            >
              {item.checked !== null && item.checked !== undefined && (
                <input
                  type="checkbox"
                  checked={item.checked}
                  readOnly
                  className="mt-1 h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-default"
                />
              )}
              <span>
                <InlineRenderer
                  inlines={item.inlines}
                  onWikiLinkClick={onWikiLinkClick}
                  onTodoLinkClick={onTodoLinkClick}
                />
              </span>
            </li>
          ))}
        </ListTag>
      );
    }

    case 'table':
      return (
        <TableRenderer
          table={block}
          onWikiLinkClick={onWikiLinkClick}
          onTodoLinkClick={onTodoLinkClick}
        />
      );

    case 'code-block':
      return <CodeBlockRenderer lang={block.lang} code={block.code} meta={block.meta} />;

    case 'mermaid':
      return <MermaidRenderer code={block.code} />;

    case 'math-block':
      return (
        <div className="my-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-center font-serif text-base italic overflow-x-auto text-zinc-800 dark:text-zinc-200">
          {block.formula}
        </div>
      );

    case 'thematic-break':
      return <hr className="my-6 border-zinc-200 dark:border-zinc-800" />;

    case 'container':
      return (
        <ContainerRenderer
          container={block}
          onWikiLinkClick={onWikiLinkClick}
          onTodoLinkClick={onTodoLinkClick}
          interactive={interactive}
        />
      );

    default:
      return null;
  }
}

function TableRenderer({
  table,
  onWikiLinkClick,
  onTodoLinkClick,
}: {
  table: BlockNode & { type: 'table' };
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
}) {
  const getAlignClass = (align: TableAlignment) => {
    if (align === 'center') return 'text-center';
    if (align === 'right') return 'text-right';
    return 'text-left';
  };

  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            {table.headers.map((cell, idx) => (
              <th
                key={idx}
                className={`px-3.5 py-2 font-semibold text-zinc-900 dark:text-zinc-100 ${getAlignClass(table.alignments[idx] ?? null)}`}
              >
                <InlineRenderer
                  inlines={cell.inlines}
                  onWikiLinkClick={onWikiLinkClick}
                  onTodoLinkClick={onTodoLinkClick}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {table.rows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
              {row.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className={`px-3.5 py-2 text-zinc-700 dark:text-zinc-300 ${getAlignClass(table.alignments[cIdx] ?? null)}`}
                >
                  <InlineRenderer
                    inlines={cell.inlines}
                    onWikiLinkClick={onWikiLinkClick}
                    onTodoLinkClick={onTodoLinkClick}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlockRenderer({ lang, code }: { lang: string; code: string; meta?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-sm font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 text-xs">
        <span className="font-semibold">{lang || 'text'}</span>
        <button
          onClick={handleCopy}
          type="button"
          className="hover:text-zinc-200 transition-colors px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px]"
        >
          {copied ? '已复制 ✓' : '复制'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MermaidRenderer({ code }: { code: string }) {
  return (
    <div className="my-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex flex-col items-center justify-center">
      <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 font-mono">
        <span>📊 Mermaid 图表</span>
      </div>
      <pre className="text-xs font-mono text-zinc-600 dark:text-zinc-400 overflow-x-auto w-full p-2 bg-white dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ContainerRenderer({
  container,
  onWikiLinkClick,
  onTodoLinkClick,
  interactive,
}: {
  container: ContainerNode;
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
  interactive: boolean;
}) {
  const {
    directive,
    title,
    params,
    rawContent,
    children,
    tabItems,
    fileTreeItems,
    timelineItems,
    chatItems,
    stepItems,
  } = container;

  // 1. Callouts (tip, warning, danger, note, info, details)
  if (['tip', 'warning', 'danger', 'note', 'info', 'details'].includes(directive)) {
    const colorMap: Record<string, { border: string; bg: string; text: string; icon: string }> = {
      tip: {
        border: 'border-emerald-500',
        bg: 'bg-emerald-50/60 dark:bg-emerald-950/20',
        text: 'text-emerald-800 dark:text-emerald-200',
        icon: '💡',
      },
      warning: {
        border: 'border-amber-500',
        bg: 'bg-amber-50/60 dark:bg-amber-950/20',
        text: 'text-amber-800 dark:text-amber-200',
        icon: '⚠️',
      },
      danger: {
        border: 'border-rose-500',
        bg: 'bg-rose-50/60 dark:bg-rose-950/20',
        text: 'text-rose-800 dark:text-rose-200',
        icon: '🚨',
      },
      note: {
        border: 'border-blue-500',
        bg: 'bg-blue-50/60 dark:bg-blue-950/20',
        text: 'text-blue-800 dark:text-blue-200',
        icon: '📌',
      },
      info: {
        border: 'border-sky-500',
        bg: 'bg-sky-50/60 dark:bg-sky-950/20',
        text: 'text-sky-800 dark:text-sky-200',
        icon: 'ℹ️',
      },
      details: {
        border: 'border-zinc-400',
        bg: 'bg-zinc-50 dark:bg-zinc-900/40',
        text: 'text-zinc-800 dark:text-zinc-200',
        icon: '🔍',
      },
    };

    const style = colorMap[directive] ?? colorMap.tip!;

    return (
      <div className={`my-3.5 rounded-lg border-l-4 ${style.border} ${style.bg} p-3.5 shadow-xs`}>
        <div className={`flex items-center gap-1.5 font-semibold text-xs mb-1.5 ${style.text}`}>
          <span>{style.icon}</span>
          <span>{title}</span>
        </div>
        <div className="text-zinc-700 dark:text-zinc-300 text-xs">
          {children ? (
            children.map((child, idx) => (
              <BlockRenderer
                key={idx}
                block={child}
                onWikiLinkClick={onWikiLinkClick}
                onTodoLinkClick={onTodoLinkClick}
                interactive={interactive}
              />
            ))
          ) : (
            <p>{rawContent}</p>
          )}
        </div>
      </div>
    );
  }

  // 2. Card
  if (directive === 'card') {
    const cardTitle = params['title'] || title || 'Card';
    const cardLink = params['link'];
    const cardIcon = params['icon'];

    return (
      <div className="my-3.5 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {cardIcon && (
              <span className="text-base">{cardIcon.startsWith('lucide:') ? '📄' : cardIcon}</span>
            )}
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
              {cardTitle}
            </span>
          </div>
          {cardLink && (
            <a
              href={cardLink}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              访问 ↗
            </a>
          )}
        </div>
        <div className="text-xs text-zinc-600 dark:text-zinc-400">{rawContent}</div>
      </div>
    );
  }

  // 3. Tabs
  if (directive === 'tabs' || directive === 'code-tree') {
    return (
      <TabsRenderer
        tabItems={tabItems ?? []}
        onWikiLinkClick={onWikiLinkClick}
        onTodoLinkClick={onTodoLinkClick}
        interactive={interactive}
      />
    );
  }

  // 4. Steps
  if (directive === 'steps') {
    return (
      <div className="my-4 space-y-3 pl-2">
        {stepItems?.map((step, idx) => (
          <div key={idx} className="flex items-start gap-3 relative">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              {step.stepNumber}
            </div>
            <div className="pt-0.5 text-zinc-800 dark:text-zinc-200 text-xs font-medium">
              <InlineRenderer
                inlines={step.inlines}
                onWikiLinkClick={onWikiLinkClick}
                onTodoLinkClick={onTodoLinkClick}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 5. File Tree
  if (directive === 'file-tree') {
    return (
      <div className="my-3.5 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 font-mono text-xs space-y-1">
        {fileTreeItems?.map((item, idx) => (
          <div
            key={idx}
            style={{ paddingLeft: `${item.level * 16}px` }}
            className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300"
          >
            <span>{item.isDir ? '📁' : '📄'}</span>
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    );
  }

  // 6. Timeline
  if (directive === 'timeline') {
    return (
      <div className="my-4 pl-4 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-3">
        {timelineItems?.map((item, idx) => (
          <div key={idx} className="relative pl-3">
            <div className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white dark:border-zinc-900" />
            {item.date && (
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 mr-2">
                {item.date}
              </span>
            )}
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
              <InlineRenderer
                inlines={item.inlines}
                onWikiLinkClick={onWikiLinkClick}
                onTodoLinkClick={onTodoLinkClick}
              />
            </span>
          </div>
        ))}
      </div>
    );
  }

  // 7. Chat
  if (directive === 'chat') {
    return (
      <div className="my-4 space-y-2.5 p-3 rounded-xl bg-zinc-100/70 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
        {chatItems?.map((chat, idx) => {
          const isUser = chat.role === 'user' || chat.role === 'right';
          return (
            <div
              key={idx}
              className={`flex items-start gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && <span className="text-base flex-shrink-0">🤖</span>}
              <div
                className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-tl-none'
                }`}
              >
                <InlineRenderer
                  inlines={chat.inlines}
                  onWikiLinkClick={onWikiLinkClick}
                  onTodoLinkClick={onTodoLinkClick}
                />
              </div>
              {isUser && <span className="text-base flex-shrink-0">🧑</span>}
            </div>
          );
        })}
      </div>
    );
  }

  // 8. QRCode
  if (directive === 'qrcode') {
    const svgHtml = generateQrSvg(rawContent, { size: 160 });
    return (
      <div className="my-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col items-center justify-center gap-2">
        <div dangerouslySetInnerHTML={{ __html: svgHtml }} />
        <span className="text-[11px] text-zinc-500 font-mono break-all max-w-xs text-center">
          {rawContent}
        </span>
      </div>
    );
  }

  // 9. Collapse
  if (directive === 'collapse') {
    return (
      <details className="my-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-3 group">
        <summary className="font-semibold text-xs text-zinc-800 dark:text-zinc-200 cursor-pointer select-none">
          {title || '展开查看详细内容'}
        </summary>
        <div className="mt-2.5 pt-2 border-t border-zinc-200/60 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300">
          {children ? (
            children.map((child, idx) => (
              <BlockRenderer
                key={idx}
                block={child}
                onWikiLinkClick={onWikiLinkClick}
                onTodoLinkClick={onTodoLinkClick}
                interactive={interactive}
              />
            ))
          ) : (
            <p>{rawContent}</p>
          )}
        </div>
      </details>
    );
  }

  // 10. Window
  if (directive === 'window') {
    return (
      <div className="my-4 rounded-xl border border-zinc-300 dark:border-zinc-700 overflow-hidden shadow-sm bg-white dark:bg-zinc-950">
        <div className="flex items-center justify-between px-3 py-2 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />
          </div>
          <span className="text-xs text-zinc-500 font-mono">{title || 'window'}</span>
          <div className="w-10" />
        </div>
        <div className="p-3 text-xs">
          {children ? (
            children.map((child, idx) => (
              <BlockRenderer
                key={idx}
                block={child}
                onWikiLinkClick={onWikiLinkClick}
                onTodoLinkClick={onTodoLinkClick}
                interactive={interactive}
              />
            ))
          ) : (
            <p>{rawContent}</p>
          )}
        </div>
      </div>
    );
  }

  // 11. Flex
  if (directive === 'flex') {
    return (
      <div className="my-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {children ? (
          children.map((child, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40"
            >
              <BlockRenderer
                block={child}
                onWikiLinkClick={onWikiLinkClick}
                onTodoLinkClick={onTodoLinkClick}
                interactive={interactive}
              />
            </div>
          ))
        ) : (
          <p>{rawContent}</p>
        )}
      </div>
    );
  }

  // 12. Media Embeds (bilibili / youtube / pdf)
  if (directive === 'bilibili') {
    return (
      <div className="my-4 aspect-video rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <iframe
          src={`https://player.bilibili.com/player.html?bvid=${encodeURIComponent(rawContent)}&page=1`}
          className="w-full h-full border-0"
          allowFullScreen
        />
      </div>
    );
  }

  if (directive === 'youtube') {
    return (
      <div className="my-4 aspect-video rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <iframe
          src={`https://www.youtube.com/embed/${encodeURIComponent(rawContent)}`}
          className="w-full h-full border-0"
          allowFullScreen
        />
      </div>
    );
  }

  if (directive === 'pdf') {
    return (
      <div className="my-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
          <span>📑</span>
          <span>PDF 文档：{rawContent}</span>
        </div>
        <a
          href={rawContent}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
        >
          打开 ↗
        </a>
      </div>
    );
  }

  return null;
}

function TabsRenderer({
  tabItems,
  onWikiLinkClick,
  onTodoLinkClick,
  interactive,
}: {
  tabItems: NonNullable<ContainerNode['tabItems']>;
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
  interactive: boolean;
}) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (tabItems.length === 0) return null;

  const currentTab = tabItems[activeIdx] ?? tabItems[0];

  return (
    <div className="my-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-zinc-50 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        {tabItems.map((tab, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setActiveIdx(idx)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              idx === activeIdx
                ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div className="p-3 text-xs">
        {currentTab?.children.map((child, idx) => (
          <BlockRenderer
            key={idx}
            block={child}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
            interactive={interactive}
          />
        ))}
      </div>
    </div>
  );
}

function InlineRenderer({
  inlines,
  onWikiLinkClick,
  onTodoLinkClick,
}: {
  inlines: InlineNode[];
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
}) {
  return (
    <>
      {inlines.map((node, idx) => (
        <SingleInlineRenderer
          key={idx}
          node={node}
          onWikiLinkClick={onWikiLinkClick}
          onTodoLinkClick={onTodoLinkClick}
        />
      ))}
    </>
  );
}

function SingleInlineRenderer({
  node,
  onWikiLinkClick,
  onTodoLinkClick,
}: {
  node: InlineNode;
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
}) {
  switch (node.type) {
    case 'text':
      return <>{node.value}</>;

    case 'bold':
      return (
        <strong className="font-bold text-zinc-900 dark:text-zinc-100">
          <InlineRenderer
            inlines={node.children}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
          />
        </strong>
      );

    case 'italic':
      return (
        <em className="italic">
          <InlineRenderer
            inlines={node.children}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
          />
        </em>
      );

    case 'strike':
      return (
        <del className="line-through text-zinc-400">
          <InlineRenderer
            inlines={node.children}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
          />
        </del>
      );

    case 'code':
      return (
        <code className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 text-pink-600 dark:text-pink-400">
          {node.code}
        </code>
      );

    case 'highlight':
      return (
        <mark className="px-1 py-0.5 rounded bg-yellow-200 dark:bg-yellow-500/30 text-inherit font-medium">
          <InlineRenderer
            inlines={node.children}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
          />
        </mark>
      );

    case 'spoiler':
      return (
        <SpoilerRenderer
          inlines={node.children}
          onWikiLinkClick={onWikiLinkClick}
          onTodoLinkClick={onTodoLinkClick}
        />
      );

    case 'badge':
      return <BadgeRenderer text={node.text} badgeType={node.badgeType} />;

    case 'icon':
      return <span className="inline-block px-0.5 text-blue-500">🏷️</span>;

    case 'wikilink':
      return (
        <span
          onClick={() => onWikiLinkClick?.(node.target)}
          className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium bg-blue-50/60 dark:bg-blue-950/30 px-1 py-0.5 rounded"
        >
          {node.alias || node.target}
        </span>
      );

    case 'math':
      return (
        <span className="font-serif italic px-1 text-indigo-600 dark:text-indigo-400">
          {node.formula}
        </span>
      );

    case 'abbr':
      return (
        <abbr
          title={node.explanation}
          className="underline decoration-dotted decoration-zinc-400 cursor-help"
        >
          {node.term}
        </abbr>
      );

    case 'link':
      return (
        <a
          href={node.href}
          title={node.title}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          {node.text}
        </a>
      );

    case 'image':
      return (
        <img
          src={node.src}
          alt={node.alt}
          title={node.title}
          className="rounded-lg max-w-full my-2 shadow-xs"
        />
      );

    default:
      return null;
  }
}

function SpoilerRenderer({
  inlines,
  onWikiLinkClick,
  onTodoLinkClick,
}: {
  inlines: InlineNode[];
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      onClick={() => setRevealed(!revealed)}
      className={`cursor-pointer rounded px-1.5 py-0.5 transition-all select-none ${
        revealed
          ? 'bg-zinc-200/80 dark:bg-zinc-800 text-inherit'
          : 'bg-zinc-900 dark:bg-zinc-100 text-transparent hover:bg-zinc-700'
      }`}
      title={revealed ? '点击隐藏' : '点击刮开查看'}
    >
      <InlineRenderer
        inlines={inlines}
        onWikiLinkClick={onWikiLinkClick}
        onTodoLinkClick={onTodoLinkClick}
      />
    </span>
  );
}

function BadgeRenderer({ text, badgeType }: { text: string; badgeType: BadgeType }) {
  const badgeStyles: Record<BadgeType, string> = {
    tip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    danger: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300',
    gray: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300',
  };

  const style = badgeStyles[badgeType] ?? badgeStyles.tip;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${style}`}
    >
      {text}
    </span>
  );
}
