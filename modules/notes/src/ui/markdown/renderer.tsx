import React, { useState, useCallback } from 'react';
import { parseMarkdown } from './parser.js';
import { generateQrSvg } from './qrcode.js';
import type { BadgeType, BlockNode, ContainerNode, InlineNode, TableAlignment } from './types.js';

export interface NoteMarkdownViewerProps {
  content: string;
  className?: string;
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
  onTaskToggle?: (taskText: string, currentChecked: boolean) => void;
  interactive?: boolean;
}

/**
 * Typora / Plume 级富 Markdown 扩展解析与全主题自适应渲染引擎组件。
 */
export function NoteMarkdownViewer({
  content,
  className = '',
  onWikiLinkClick,
  onTodoLinkClick,
  onTaskToggle,
  interactive = true,
}: NoteMarkdownViewerProps) {
  const blocks = parseMarkdown(content);

  return (
    <div
      className={`max-w-none text-sm text-ink leading-relaxed space-y-3 select-text font-sans ${className}`}
      data-testid="markdown-viewer"
    >
      {blocks.map((block, idx) => (
        <BlockRenderer
          key={idx}
          block={block}
          onWikiLinkClick={onWikiLinkClick}
          onTodoLinkClick={onTodoLinkClick}
          onTaskToggle={onTaskToggle}
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
  onTaskToggle,
  interactive,
}: {
  block: BlockNode;
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
  onTaskToggle?: (taskText: string, currentChecked: boolean) => void;
  interactive: boolean;
}) {
  switch (block.type) {
    case 'heading': {
      const headingClass =
        block.level === 1
          ? 'text-2xl font-bold mt-6 mb-3 pb-2 border-b border-line'
          : block.level === 2
            ? 'text-xl font-bold mt-5 mb-2 pb-1 border-b border-line/60'
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
        className: `${headingClass} scroll-mt-16 text-ink tracking-tight`,
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
        <p className="my-2.5 text-ink leading-relaxed">
          <InlineRenderer
            inlines={block.inlines}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
          />
        </p>
      );

    case 'blockquote':
      return (
        <blockquote className="my-3 pl-4 border-l-4 border-accent bg-accent-soft/40 py-2 rounded-r-lg text-secondary italic">
          {block.children.map((child, idx) => (
            <BlockRenderer
              key={idx}
              block={child}
              onWikiLinkClick={onWikiLinkClick}
              onTodoLinkClick={onTodoLinkClick}
              onTaskToggle={onTaskToggle}
              interactive={interactive}
            />
          ))}
        </blockquote>
      );

    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag
          className={`my-2.5 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'} space-y-1.5 text-ink`}
        >
          {block.items.map((item, idx) => {
            const isTask = item.checked !== null && item.checked !== undefined;
            const plainText = extractInlineText(item.inlines);

            return (
              <li
                key={idx}
                className={isTask ? 'list-none -ml-5 flex items-start gap-2.5 py-0.5' : ''}
              >
                {isTask && (
                  <button
                    type="button"
                    disabled={!interactive}
                    onClick={() => {
                      if (interactive && onTaskToggle) {
                        onTaskToggle(plainText, !item.checked);
                      }
                    }}
                    className={`mt-0.5 size-4 rounded flex items-center justify-center shrink-0 border transition-all ${
                      item.checked
                        ? 'bg-good border-good text-white shadow-2xs'
                        : 'bg-surface border-line hover:border-accent'
                    } ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
                    title={item.checked ? '标记为未完成' : '标记为已完成'}
                  >
                    {item.checked && (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                )}
                <span className={item.checked ? 'line-through text-muted' : 'text-ink'}>
                  <InlineRenderer
                    inlines={item.inlines}
                    onWikiLinkClick={onWikiLinkClick}
                    onTodoLinkClick={onTodoLinkClick}
                  />
                </span>
              </li>
            );
          })}
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
        <div className="my-4 p-4 rounded-panel bg-surface-2/80 border border-line text-center font-serif text-base italic overflow-x-auto text-ink">
          {block.formula}
        </div>
      );

    case 'thematic-break':
      return <hr className="my-6 border-line" />;

    case 'container':
      return (
        <ContainerRenderer
          container={block}
          onWikiLinkClick={onWikiLinkClick}
          onTodoLinkClick={onTodoLinkClick}
          onTaskToggle={onTaskToggle}
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
    <div className="my-4 overflow-x-auto rounded-panel border border-line shadow-2xs">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-surface-2 border-b border-line">
          <tr>
            {table.headers.map((cell, idx) => (
              <th
                key={idx}
                className={`px-3.5 py-2.5 font-bold text-ink uppercase tracking-wider ${getAlignClass(table.alignments[idx] ?? null)}`}
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
        <tbody className="divide-y divide-line bg-surface">
          {table.rows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-surface-2/60 transition-colors">
              {row.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className={`px-3.5 py-2 text-secondary ${getAlignClass(table.alignments[cIdx] ?? null)}`}
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

  const handleCopy = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [code]);

  return (
    <div className="my-3.5 rounded-panel overflow-hidden border border-line bg-surface-2/90 text-ink shadow-sm font-mono text-xs">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-surface border-b border-line text-secondary text-xs">
        <span className="font-bold text-[11px] uppercase tracking-wider text-accent">
          {lang || 'TEXT'}
        </span>
        <button
          onClick={handleCopy}
          type="button"
          className="hover:text-ink transition-colors px-2 py-0.5 rounded-control bg-surface-2 hover:bg-surface-3 border border-line/60 text-[11px] font-sans font-medium flex items-center gap-1 cursor-pointer"
          title="复制代码内容"
        >
          {copied ? (
            <>
              <span className="text-good font-bold">✓</span>
              <span>已复制</span>
            </>
          ) : (
            <>
              <span>📋</span>
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto leading-relaxed custom-scrollbar bg-surface-2/40">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MermaidRenderer({ code }: { code: string }) {
  return (
    <div className="my-4 p-4 rounded-panel border border-line bg-surface-2/60 flex flex-col items-center justify-center">
      <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-line text-xs text-secondary font-mono">
        <span className="font-semibold">📊 Mermaid 流程图表</span>
      </div>
      <pre className="text-xs font-mono text-ink overflow-x-auto w-full p-3 bg-surface rounded-control border border-line custom-scrollbar">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ContainerRenderer({
  container,
  onWikiLinkClick,
  onTodoLinkClick,
  onTaskToggle,
  interactive,
}: {
  container: ContainerNode;
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
  onTaskToggle?: (taskText: string, currentChecked: boolean) => void;
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
        border: 'border-good',
        bg: 'bg-good-soft/70',
        text: 'text-good',
        icon: '💡',
      },
      warning: {
        border: 'border-warning',
        bg: 'bg-warning-soft/70',
        text: 'text-warning',
        icon: '⚠️',
      },
      danger: {
        border: 'border-critical',
        bg: 'bg-critical-soft/70',
        text: 'text-critical',
        icon: '🚨',
      },
      note: {
        border: 'border-accent',
        bg: 'bg-accent-soft/70',
        text: 'text-accent',
        icon: '📌',
      },
      info: {
        border: 'border-sky-500',
        bg: 'bg-sky-50 dark:bg-sky-950/40',
        text: 'text-sky-700 dark:text-sky-300',
        icon: 'ℹ️',
      },
      details: {
        border: 'border-line',
        bg: 'bg-surface-2/70',
        text: 'text-ink',
        icon: '🔍',
      },
    };

    const style = colorMap[directive] ?? colorMap.tip!;

    return (
      <div
        className={`my-3.5 rounded-panel border-l-4 ${style.border} ${style.bg} p-4 shadow-2xs border border-transparent`}
      >
        <div className={`flex items-center gap-1.5 font-bold text-xs mb-1.5 ${style.text}`}>
          <span>{style.icon}</span>
          <span>{title}</span>
        </div>
        <div className="text-secondary text-xs leading-relaxed space-y-2">
          {children ? (
            children.map((child, idx) => (
              <BlockRenderer
                key={idx}
                block={child}
                onWikiLinkClick={onWikiLinkClick}
                onTodoLinkClick={onTodoLinkClick}
                onTaskToggle={onTaskToggle}
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
      <div className="my-3.5 p-4 rounded-panel border border-line bg-surface shadow-xs hover-lift transition-all">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {cardIcon && (
              <span className="text-base">{cardIcon.startsWith('lucide:') ? '📄' : cardIcon}</span>
            )}
            <span className="font-bold text-sm text-ink">{cardTitle}</span>
          </div>
          {cardLink && (
            <a
              href={cardLink}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent hover:underline font-medium"
            >
              访问 ↗
            </a>
          )}
        </div>
        <div className="text-xs text-secondary leading-relaxed">{rawContent}</div>
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
        onTaskToggle={onTaskToggle}
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
            <div className="flex-shrink-0 size-6 rounded-full bg-accent text-white font-bold text-xs flex items-center justify-center shadow-xs">
              {step.stepNumber}
            </div>
            <div className="pt-0.5 text-ink text-xs font-medium leading-relaxed">
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
      <div className="my-3.5 p-3.5 rounded-panel border border-line bg-surface-2 font-mono text-xs space-y-1 text-ink">
        {fileTreeItems?.map((item, idx) => (
          <div
            key={idx}
            style={{ paddingLeft: `${item.level * 16}px` }}
            className="flex items-center gap-1.5 text-secondary hover:text-ink transition-colors"
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
      <div className="my-4 pl-4 border-l-2 border-line/80 space-y-4">
        {timelineItems?.map((item, idx) => (
          <div key={idx} className="relative pl-4">
            <div className="absolute -left-[22px] top-1.5 size-3 rounded-full bg-accent border-2 border-surface shadow-xs" />
            <div className="flex items-baseline gap-2 flex-wrap">
              {item.date && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-accent-soft text-accent font-semibold border border-accent/20">
                  {item.date}
                </span>
              )}
              {item.title && (
                <span className="text-xs font-bold text-ink">
                  <InlineRenderer
                    inlines={item.inlines}
                    onWikiLinkClick={onWikiLinkClick}
                    onTodoLinkClick={onTodoLinkClick}
                  />
                </span>
              )}
            </div>
            {item.descriptionInlines && item.descriptionInlines.length > 0 && (
              <div className="text-xs text-secondary mt-1 leading-relaxed pl-0.5">
                <InlineRenderer
                  inlines={item.descriptionInlines}
                  onWikiLinkClick={onWikiLinkClick}
                  onTodoLinkClick={onTodoLinkClick}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // 7. Chat
  if (directive === 'chat') {
    return (
      <div className="my-4 space-y-3.5 p-4 rounded-panel bg-surface-2/60 border border-line">
        {chatItems?.map((chat, idx) => {
          const isUser = chat.role === 'user' || chat.role === 'right';
          const avatar = isUser ? '🧑' : '🤖';
          return (
            <div
              key={idx}
              className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className="size-7 rounded-full bg-surface border border-line flex items-center justify-center text-sm shadow-xs flex-shrink-0 select-none">
                {avatar}
              </div>
              <div className={`max-w-[82%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                {chat.author && (
                  <span className="text-[10px] text-muted font-medium mb-1 px-1">
                    {chat.author}
                  </span>
                )}
                <div
                  className={`px-3.5 py-2 rounded-2xl text-xs leading-relaxed shadow-xs ${
                    isUser
                      ? 'bg-accent text-white rounded-tr-none'
                      : 'bg-surface text-ink border border-line rounded-tl-none'
                  }`}
                >
                  <InlineRenderer
                    inlines={chat.inlines}
                    onWikiLinkClick={onWikiLinkClick}
                    onTodoLinkClick={onTodoLinkClick}
                  />
                </div>
              </div>
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
      <div className="my-4 p-4 rounded-panel border border-line bg-surface flex flex-col items-center justify-center gap-2.5 shadow-2xs">
        <div dangerouslySetInnerHTML={{ __html: svgHtml }} />
        <span className="text-[11px] text-secondary font-mono break-all max-w-xs text-center">
          {rawContent}
        </span>
      </div>
    );
  }

  // 9. Collapse
  if (directive === 'collapse') {
    return (
      <details className="my-3.5 rounded-panel border border-line bg-surface p-3.5 group shadow-2xs">
        <summary className="font-semibold text-xs text-ink cursor-pointer select-none">
          {title || '展开查看详细内容'}
        </summary>
        <div className="mt-2.5 pt-2.5 border-t border-line text-xs text-secondary leading-relaxed space-y-2">
          {children ? (
            children.map((child, idx) => (
              <BlockRenderer
                key={idx}
                block={child}
                onWikiLinkClick={onWikiLinkClick}
                onTodoLinkClick={onTodoLinkClick}
                onTaskToggle={onTaskToggle}
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
      <div className="my-4 rounded-panel border border-line overflow-hidden shadow-sm bg-surface">
        <div className="flex items-center justify-between px-3.5 py-2 bg-surface-2 border-b border-line">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-rose-400 inline-block" />
            <span className="size-2.5 rounded-full bg-amber-400 inline-block" />
            <span className="size-2.5 rounded-full bg-emerald-400 inline-block" />
          </div>
          <span className="text-xs text-muted font-mono">{title || 'Terminal'}</span>
          <div className="w-10" />
        </div>
        <div className="p-4 text-xs text-ink leading-relaxed font-mono">
          {children ? (
            children.map((child, idx) => (
              <BlockRenderer
                key={idx}
                block={child}
                onWikiLinkClick={onWikiLinkClick}
                onTodoLinkClick={onTodoLinkClick}
                onTaskToggle={onTaskToggle}
                interactive={interactive}
              />
            ))
          ) : (
            <pre>{rawContent}</pre>
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
            <div key={idx} className="p-3.5 rounded-panel border border-line bg-surface-2/60">
              <BlockRenderer
                block={child}
                onWikiLinkClick={onWikiLinkClick}
                onTodoLinkClick={onTodoLinkClick}
                onTaskToggle={onTaskToggle}
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
      <div className="my-4 aspect-video rounded-panel overflow-hidden border border-line shadow-sm">
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
      <div className="my-4 aspect-video rounded-panel overflow-hidden border border-line shadow-sm">
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
      <div className="my-4 p-4 rounded-panel border border-line bg-surface flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2 text-xs text-ink">
          <span>📑</span>
          <span>PDF 文档：{rawContent}</span>
        </div>
        <a
          href={rawContent}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1 bg-accent text-white rounded-control text-xs font-semibold hover:opacity-90 transition-opacity"
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
  onTaskToggle,
  interactive,
}: {
  tabItems: NonNullable<ContainerNode['tabItems']>;
  onWikiLinkClick?: (target: string) => void;
  onTodoLinkClick?: (todoId: string) => void;
  onTaskToggle?: (taskText: string, currentChecked: boolean) => void;
  interactive: boolean;
}) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (tabItems.length === 0) return null;

  const currentTab = tabItems[activeIdx] ?? tabItems[0];

  return (
    <div className="my-3.5 rounded-panel border border-line overflow-hidden bg-surface shadow-2xs">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-surface-2 border-b border-line overflow-x-auto">
        {tabItems.map((tab, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setActiveIdx(idx)}
            className={`px-3 py-1 rounded-control text-xs font-medium transition-all ${
              idx === activeIdx
                ? 'bg-surface text-accent font-bold shadow-2xs border border-line/60'
                : 'text-secondary hover:text-ink hover:bg-surface/50'
            }`}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div className="p-4 text-xs space-y-2">
        {currentTab?.children.map((child, idx) => (
          <BlockRenderer
            key={idx}
            block={child}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
            onTaskToggle={onTaskToggle}
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
        <strong className="font-bold text-ink">
          <InlineRenderer
            inlines={node.children}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
          />
        </strong>
      );

    case 'italic':
      return (
        <em className="italic text-ink">
          <InlineRenderer
            inlines={node.children}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
          />
        </em>
      );

    case 'strike':
      return (
        <del className="line-through text-muted">
          <InlineRenderer
            inlines={node.children}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
          />
        </del>
      );

    case 'code':
      return (
        <code className="px-1.5 py-0.5 rounded-control text-[11px] font-mono bg-surface-2 border border-line text-accent font-semibold">
          {node.code}
        </code>
      );

    case 'highlight':
      return (
        <mark className="px-1.5 py-0.5 rounded-control bg-warning-soft text-warning font-semibold border-b-2 border-warning/50">
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
      return <span className="inline-block px-0.5 text-accent">🏷️</span>;

    case 'wikilink':
      return (
        <span
          onClick={() => onWikiLinkClick?.(node.target)}
          className="text-accent hover:underline cursor-pointer font-semibold bg-accent-soft px-1.5 py-0.5 rounded-control border border-accent/20"
        >
          {node.alias || node.target}
        </span>
      );

    case 'math':
      return <span className="font-serif italic px-1 text-accent font-medium">{node.formula}</span>;

    case 'abbr':
      return (
        <abbr
          title={node.explanation}
          className="underline decoration-dotted decoration-muted cursor-help"
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
          className="text-accent font-semibold hover:underline"
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
          className="rounded-panel max-w-full my-2.5 shadow-2xs border border-line"
        />
      );

    case 'kbd':
      return (
        <kbd className="inline-block px-1.5 py-0.5 text-[11px] font-mono font-semibold rounded-control border border-line bg-surface-2 text-ink shadow-2xs align-middle">
          {node.text}
        </kbd>
      );

    case 'sub':
      return (
        <sub className="text-[10px] text-secondary">
          <InlineRenderer
            inlines={node.children}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
          />
        </sub>
      );

    case 'sup':
      return (
        <sup className="text-[10px] text-accent">
          <InlineRenderer
            inlines={node.children}
            onWikiLinkClick={onWikiLinkClick}
            onTodoLinkClick={onTodoLinkClick}
          />
        </sup>
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
      className={`cursor-pointer rounded-control px-1.5 py-0.5 transition-all select-none ${
        revealed
          ? 'bg-surface-2 border border-line text-ink'
          : 'bg-ink/80 text-transparent hover:bg-ink blur-[3px] hover:blur-none'
      }`}
      title={revealed ? '点击隐藏保密内容' : '点击刮开查看'}
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
    tip: 'bg-good-soft text-good border-good/30',
    warning: 'bg-warning-soft text-warning border-warning/30',
    danger: 'bg-critical-soft text-critical border-critical/30',
    info: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800',
    success: 'bg-good-soft text-good border-good/30',
    gray: 'bg-surface-2 text-secondary border-line',
  };

  const style = badgeStyles[badgeType] ?? badgeStyles.tip;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${style}`}
    >
      {text}
    </span>
  );
}

function extractInlineText(inlines: InlineNode[]): string {
  let str = '';
  for (const n of inlines) {
    if (n.type === 'text') str += n.value;
    else if ('children' in n && Array.isArray(n.children)) {
      str += extractInlineText(n.children);
    }
  }
  return str;
}
