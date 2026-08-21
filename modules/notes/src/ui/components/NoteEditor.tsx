import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { FolderNode, FolderView, NoteColor, NoteView, TodoLinkView } from '../../contract.js';
import { NOTE_COLORS } from '../../contract.js';
import { patchNote, postCreateTodo, postLinkTodo, deleteTodoLink, deleteNote } from '../api.js';
import { NoteMarkdownViewer } from '../markdown/renderer.js';
import { NoteFormatToolbar } from './NoteFormatToolbar.js';
import { NoteOutlineToc } from './NoteOutlineToc.js';

export interface NoteStats {
  words: number;
  chars: number;
  lines: number;
  readingTimeMinutes: number;
}

export function computeNoteStats(text: string): NoteStats {
  if (!text) {
    return { words: 0, chars: 0, lines: 1, readingTimeMinutes: 1 };
  }

  const lines = text.split(/\r\n|\r|\n/).length;
  const chars = text.length;

  // 中文字符数 + 英文单词数统计
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const nonChineseWords = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[\w-]+/g) || []).length;
  const words = chineseChars + nonChineseWords;

  // 按照平均每分钟 350 字估算阅读时长
  const readingTimeMinutes = Math.max(1, Math.ceil(words / 350));

  return { words, chars, lines, readingTimeMinutes };
}

export function formatReadingTime(minutes: number): string {
  return `约 ${minutes} 分钟阅读`;
}

export function getNoteColorBgClass(color: NoteColor): string {
  switch (color) {
    case 'yellow':
      return 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/40 text-amber-900 dark:text-amber-100';
    case 'green':
      return 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-100';
    case 'blue':
      return 'bg-sky-50/50 dark:bg-sky-950/20 border-sky-200/60 dark:border-sky-900/40 text-sky-900 dark:text-sky-100';
    case 'purple':
      return 'bg-purple-50/50 dark:bg-purple-950/20 border-purple-200/60 dark:border-purple-900/40 text-purple-900 dark:text-purple-100';
    case 'pink':
      return 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/40 text-rose-900 dark:text-rose-100';
    case 'gray':
      return 'bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200/60 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100';
  }
}

export function getNoteColorDotClass(color: NoteColor): string {
  switch (color) {
    case 'yellow':
      return 'bg-amber-400 border-amber-500';
    case 'green':
      return 'bg-emerald-400 border-emerald-500';
    case 'blue':
      return 'bg-sky-400 border-sky-500';
    case 'purple':
      return 'bg-purple-400 border-purple-500';
    case 'pink':
      return 'bg-rose-400 border-rose-500';
    case 'gray':
      return 'bg-zinc-400 border-zinc-500';
  }
}

export interface NoteEditorProps {
  note: NoteView;
  folders?: (FolderNode | FolderView)[];
  onUpdate?: (updated: NoteView) => void;
  onDelete?: (id: string) => void;
  onClose?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  className?: string;
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'conflict' | 'error';
export type ViewMode = 'edit' | 'split' | 'preview';

export function NoteEditor({
  note,
  folders = [],
  onUpdate,
  onDelete,
  onClose,
  isFullscreen = false,
  onToggleFullscreen,
  className = '',
}: NoteEditorProps) {
  // 草稿状态
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [color, setColor] = useState<NoteColor>(note.color);
  const [folderId, setFolderId] = useState<string | null>(note.folderId);
  const [isPinned, setIsPinned] = useState(note.isPinned);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [todoLinks, setTodoLinks] = useState<TodoLinkView[]>(note.todoLinks);

  // 内部版本控制与保存状态
  const [revision, setRevision] = useState(note.revision);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<Date>(new Date(note.updatedAt));

  // 交互视图控制
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isTocCollapsed, setIsTocCollapsed] = useState(false);
  const [isTodoDrawerOpen, setIsTodoDrawerOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [linkTodoIdInput, setLinkTodoIdInput] = useState('');

  // 元素引用
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 保存最新的 draft 状态供 flush 卸载时消费
  const draftRef = useRef({
    title,
    content,
    color,
    folderId,
    isPinned,
    tags,
    revision,
    hasPendingChanges: false,
  });

  draftRef.current = {
    title,
    content,
    color,
    folderId,
    isPinned,
    tags,
    revision,
    hasPendingChanges:
      title !== note.title ||
      content !== note.content ||
      color !== note.color ||
      folderId !== note.folderId ||
      isPinned !== note.isPinned ||
      JSON.stringify(tags) !== JSON.stringify(note.tags),
  };

  // 统计数据
  const stats = useMemo(() => computeNoteStats(content), [content]);

  // 执行落库保存
  const executeSave = useCallback(
    async (immediateDraft?: typeof draftRef.current) => {
      const currentDraft = immediateDraft || draftRef.current;
      setSaveStatus('saving');
      setErrorMessage(null);

      try {
        const updated = await patchNote(note.id, {
          title: currentDraft.title,
          content: currentDraft.content,
          color: currentDraft.color,
          folderId: currentDraft.folderId,
          isPinned: currentDraft.isPinned,
          tags: currentDraft.tags,
          revision: currentDraft.revision,
        });

        setRevision(updated.revision);
        setLastSavedTime(new Date(updated.updatedAt));
        setSaveStatus('saved');
        onUpdate?.(updated);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('409') || msg.includes('版本冲突')) {
          setSaveStatus('conflict');
          setErrorMessage('检测到其他端写入冲突 (409)，已保留当前本地草稿');
        } else {
          setSaveStatus('error');
          setErrorMessage(msg);
        }
      }
    },
    [note.id, onUpdate],
  );

  // 触发 500ms 防抖保存
  const triggerDebouncedSave = useCallback(() => {
    setSaveStatus('unsaved');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      executeSave();
    }, 500);
  }, [executeSave]);

  // 监听属性变化触发防抖
  const handleContentChange = (newVal: string) => {
    setContent(newVal);
    triggerDebouncedSave();
  };

  const handleTitleChange = (newVal: string) => {
    setTitle(newVal);
    triggerDebouncedSave();
  };

  const handleColorChange = (newColor: NoteColor) => {
    setColor(newColor);
    setIsColorPickerOpen(false);
    triggerDebouncedSave();
  };

  const handleFolderChange = (newFolderId: string | null) => {
    setFolderId(newFolderId);
    setIsFolderPickerOpen(false);
    triggerDebouncedSave();
  };

  const handleTogglePin = () => {
    setIsPinned((prev) => !prev);
    triggerDebouncedSave();
  };

  const handleAddTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim().replace(/^#/, '');
    if (!trimmed || tags.includes(trimmed)) return;
    const nextTags = [...tags, trimmed];
    setTags(nextTags);
    setNewTagInput('');
    triggerDebouncedSave();
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const nextTags = tags.filter((t) => t !== tagToRemove);
    setTags(nextTags);
    triggerDebouncedSave();
  };

  // 一键派发待办
  const handleCreateTodo = async () => {
    try {
      const res = await postCreateTodo(note.id, {
        title: newTodoTitle.trim() || undefined,
      });
      setTodoLinks((prev) => [...prev, res.link]);
      setNewTodoTitle('');
      onUpdate?.(res.note);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '创建待办失败');
    }
  };

  // 关联已有待办
  const handleLinkExistingTodo = async () => {
    if (!linkTodoIdInput.trim()) return;
    try {
      const res = await postLinkTodo(note.id, { todoItemId: linkTodoIdInput.trim() });
      setTodoLinks(res.links);
      setLinkTodoIdInput('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '关联待办失败');
    }
  };

  // 解除待办关联
  const handleRemoveTodoLink = async (todoItemId: string) => {
    try {
      await deleteTodoLink(note.id, todoItemId);
      setTodoLinks((prev) => prev.filter((l) => l.todoItemId !== todoItemId));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '解除关联失败');
    }
  };

  // 删除当前便签
  const handleDeleteNote = async () => {
    if (window.confirm('确定要彻底删除该便签吗？此操作无法撤销。')) {
      try {
        await deleteNote(note.id);
        onDelete?.(note.id);
        onClose?.();
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : '删除便签失败');
      }
    }
  };

  // 快捷键支持（Ctrl+B, Ctrl+I, Ctrl+S, Tab 缩进）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac =
      typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl+S / Cmd+S 立即手动落库保存
    if (modKey && e.key === 's') {
      e.preventDefault();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      executeSave();
      return;
    }

    // Tab 键插入 2 个空格缩进，Shift+Tab 反缩进
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (!e.shiftKey) {
        // 插入 2 个空格
        const updated = content.substring(0, start) + '  ' + content.substring(end);
        setContent(updated);
        triggerDebouncedSave();
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        }, 0);
      } else {
        // 反缩进
        if (content.substring(start - 2, start) === '  ') {
          const updated = content.substring(0, start - 2) + content.substring(end);
          setContent(updated);
          triggerDebouncedSave();
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = Math.max(0, start - 2);
          }, 0);
        }
      }
    }
  };

  // 组件卸载时如果存在未保存修改，立即 flush
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (draftRef.current.hasPendingChanges) {
        executeSave(draftRef.current);
      }
    };
  }, [executeSave]);

  const colorBgClass = getNoteColorBgClass(color);

  return (
    <div
      className={`flex flex-col h-full bg-surface text-ink border border-line/80 shadow-2xl rounded-panel overflow-hidden transition-all duration-200 ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : ''
      } ${className}`}
    >
      {/* 顶部主控制导航条 */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-line bg-surface/90 backdrop-blur z-20 select-none">
        {/* 左侧：色彩选择器、文件夹归属、置顶状态与保存状态指示 */}
        <div className="flex items-center gap-2.5">
          {/* 色彩选择器 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsColorPickerOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-control border border-line bg-surface-2/60 hover:bg-surface-3 transition"
              title="切换便签主题色"
            >
              <span className={`size-3 rounded-full border ${getNoteColorDotClass(color)}`} />
              <span className="text-xs text-secondary capitalize">{color}</span>
              <span className="text-[10px] text-muted">▼</span>
            </button>

            {isColorPickerOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-40 flex gap-1.5 p-2 rounded-panel border border-line bg-surface shadow-xl backdrop-blur">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleColorChange(c)}
                    className={`size-6 rounded-full border-2 transition ${getNoteColorDotClass(
                      c,
                    )} ${color === c ? 'ring-2 ring-amber-500 scale-110' : 'hover:scale-105'}`}
                    title={`主题色：${c}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 文件夹归属选择 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsFolderPickerOpen((prev) => !prev)}
              className="flex items-center gap-1 px-2 py-1 rounded-control border border-line bg-surface-2/60 hover:bg-surface-3 text-xs text-secondary hover:text-ink transition"
              title="移动到文件夹"
            >
              <span>📁</span>
              <span className="max-w-[100px] truncate">
                {folderId ? folders.find((f) => f.id === folderId)?.name || '未知文件夹' : '未分类'}
              </span>
              <span className="text-[10px] text-muted">▼</span>
            </button>

            {isFolderPickerOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-40 w-44 max-h-56 overflow-y-auto rounded-panel border border-line bg-surface p-1.5 shadow-xl backdrop-blur text-xs">
                <button
                  type="button"
                  onClick={() => handleFolderChange(null)}
                  className={`w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-2 transition ${
                    folderId === null ? 'font-semibold text-amber-600 dark:text-amber-400' : ''
                  }`}
                >
                  📁 未分类 (根目录)
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleFolderChange(f.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-2 transition truncate ${
                      folderId === f.id ? 'font-semibold text-amber-600 dark:text-amber-400' : ''
                    }`}
                  >
                    {f.icon || '📁'} {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 置顶按钮 */}
          <button
            type="button"
            onClick={handleTogglePin}
            className={`flex items-center gap-1 px-2 py-1 rounded-control border text-xs transition ${
              isPinned
                ? 'border-amber-400 bg-amber-100/60 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-semibold'
                : 'border-line bg-surface-2/60 text-muted hover:text-ink hover:bg-surface-3'
            }`}
            title={isPinned ? '取消置顶' : '置顶该便签'}
          >
            <span>📌</span>
            <span>{isPinned ? '已置顶' : '置顶'}</span>
          </button>

          {/* 实时保存状态指示 */}
          <div className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-surface-2 text-secondary">
            {saveStatus === 'saved' && (
              <>
                <span className="text-emerald-500 font-bold">✓</span>
                <span className="text-muted text-[11px]">已保存</span>
              </>
            )}
            {saveStatus === 'saving' && (
              <>
                <span className="inline-block size-2 rounded-full bg-amber-500 animate-ping" />
                <span className="text-amber-600 dark:text-amber-400 text-[11px]">保存中...</span>
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <span className="size-2 rounded-full bg-amber-400" />
                <span className="text-muted text-[11px]">未保存更改</span>
              </>
            )}
            {saveStatus === 'conflict' && (
              <>
                <span className="text-rose-500 font-bold">⚠️</span>
                <span className="text-rose-600 dark:text-rose-400 text-[11px] font-semibold">
                  版本冲突 (409)
                </span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <span className="text-rose-500 font-bold">✕</span>
                <span className="text-rose-600 dark:text-rose-400 text-[11px]">保存失败</span>
              </>
            )}
          </div>
        </div>

        {/* 右侧：视图切换器、待办联动、全屏切换与关闭按钮 */}
        <div className="flex items-center gap-2">
          {/* 视图切换 (edit / split / preview) */}
          <div className="flex items-center rounded-control border border-line bg-surface-2/70 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`px-2 py-0.5 rounded transition ${
                viewMode === 'edit'
                  ? 'bg-surface shadow text-ink font-semibold'
                  : 'text-secondary hover:text-ink'
              }`}
              title="纯编辑模式"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-2 py-0.5 rounded transition ${
                viewMode === 'split'
                  ? 'bg-surface shadow text-ink font-semibold'
                  : 'text-secondary hover:text-ink'
              }`}
              title="双栏分栏预览模式"
            >
              分栏
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-2 py-0.5 rounded transition ${
                viewMode === 'preview'
                  ? 'bg-surface shadow text-ink font-semibold'
                  : 'text-secondary hover:text-ink'
              }`}
              title="纯阅读阅读模式"
            >
              阅读
            </button>
          </div>

          {/* 待办联动抽屉开关 */}
          <button
            type="button"
            onClick={() => setIsTodoDrawerOpen((prev) => !prev)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-control border text-xs transition ${
              isTodoDrawerOpen || todoLinks.length > 0
                ? 'border-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                : 'border-line bg-surface-2 hover:bg-surface-3 text-secondary hover:text-ink'
            }`}
            title="查看或派发关联待办"
          >
            <span>☑</span>
            <span>待办</span>
            {todoLinks.length > 0 && (
              <span className="size-4 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[10px] font-mono">
                {todoLinks.length}
              </span>
            )}
          </button>

          {/* 大纲开关 */}
          <button
            type="button"
            onClick={() => setIsTocCollapsed((prev) => !prev)}
            className={`p-1.5 rounded-control border border-line text-xs transition ${
              !isTocCollapsed
                ? 'bg-surface-3 text-ink font-semibold'
                : 'bg-surface-2 text-secondary hover:text-ink'
            }`}
            title={isTocCollapsed ? '展开大纲目录' : '收起大纲目录'}
          >
            📑
          </button>

          {/* 全屏/沉浸式切换 */}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="p-1.5 rounded-control border border-line bg-surface-2 hover:bg-surface-3 text-secondary hover:text-ink text-xs transition"
              title={isFullscreen ? '退出全屏沉浸模式' : '进入全屏沉浸模式'}
            >
              {isFullscreen ? '⤓' : '⤢'}
            </button>
          )}

          {/* 关闭/完成 */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-control bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs shadow transition"
            >
              完成
            </button>
          )}
        </div>
      </header>

      {/* 错误或冲突提示条 */}
      {errorMessage && (
        <div className="flex items-center justify-between px-4 py-2 bg-rose-100 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs">
          <div className="flex items-center gap-1.5">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => executeSave()}
              className="underline font-semibold hover:text-rose-950 dark:hover:text-white"
            >
              立即重试保存
            </button>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-muted hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 主体编辑区与右侧大纲容器 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 左侧核心编辑内容 */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* 标题输入区与标签条 */}
          <div
            className={`px-6 pt-5 pb-2 border-b border-line/40 ${colorBgClass} transition-colors`}
          >
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  textareaRef.current?.focus();
                }
              }}
              placeholder="未命名便签..."
              className="w-full text-2xl font-bold bg-transparent text-ink placeholder:text-muted/60 focus:outline-none border-none tracking-tight"
            />

            {/* 标签行 */}
            <div className="flex items-center flex-wrap gap-1.5 mt-3 text-xs">
              <span className="text-muted text-[11px]">🏷 标签:</span>
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface/80 border border-line text-secondary hover:text-ink transition"
                >
                  <span>#{t}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t)}
                    className="hover:text-rose-500 text-muted"
                  >
                    ×
                  </button>
                </span>
              ))}

              {/* 添加新标签 */}
              <div className="inline-flex items-center gap-1">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddTag(newTagInput);
                    }
                  }}
                  placeholder="+ 新标签 (Enter 确认)"
                  className="px-2 py-0.5 text-xs rounded-full border border-dashed border-line bg-surface/40 text-ink placeholder:text-muted focus:outline-none focus:border-amber-500 w-32"
                />
              </div>
            </div>
          </div>

          {/* 格式化工具栏（仅在编辑与分栏模式下展示） */}
          {viewMode !== 'preview' && (
            <NoteFormatToolbar
              textareaRef={textareaRef}
              value={content}
              onChange={handleContentChange}
            />
          )}

          {/* 双栏 / 单栏编辑器与渲染预览区 */}
          <div className="flex-1 flex overflow-hidden">
            {/* Markdown 源码输入框 */}
            {viewMode !== 'preview' && (
              <div
                className={`h-full flex flex-col ${
                  viewMode === 'split' ? 'w-1/2 border-r border-line' : 'w-full'
                }`}
              >
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="在此开始沉浸式写作... (支持 Markdown 语法与 Plume 扩展容器)"
                  className="flex-1 w-full p-6 text-sm font-mono leading-relaxed bg-surface text-ink placeholder:text-muted/60 focus:outline-none resize-none overflow-y-auto custom-scrollbar"
                />
              </div>
            )}

            {/* Typora 级富 Markdown 实时预览区 */}
            {viewMode !== 'edit' && (
              <div
                ref={previewContainerRef}
                className={`h-full overflow-y-auto p-6 bg-surface/50 ${
                  viewMode === 'split' ? 'w-1/2' : 'w-full max-w-4xl mx-auto'
                } custom-scrollbar`}
              >
                <NoteMarkdownViewer content={content} interactive />
              </div>
            )}
          </div>
        </div>

        {/* 右侧可折叠大纲目录 (TOC) */}
        <NoteOutlineToc
          content={content}
          containerRef={previewContainerRef}
          isCollapsed={isTocCollapsed}
          onToggleCollapse={() => setIsTocCollapsed((prev) => !prev)}
        />

        {/* 待办联动抽屉 / 面板 */}
        {isTodoDrawerOpen && (
          <aside className="absolute right-0 top-0 bottom-0 z-30 w-80 bg-surface/95 border-l border-line shadow-2xl backdrop-blur-xl p-4 flex flex-col text-xs animate-slide-in">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-1.5 font-bold text-ink text-sm">
                <span>☑ 关联待办清单</span>
                <span className="text-xs text-muted font-normal">({todoLinks.length})</span>
              </div>
              <button
                type="button"
                onClick={() => setIsTodoDrawerOpen(false)}
                className="size-6 flex items-center justify-center rounded hover:bg-surface-2 text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>

            {/* 一键派发新待办 */}
            <div className="py-3 border-b border-line space-y-2">
              <span className="font-semibold text-ink">🚀 一键派发待办：</span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  placeholder={title ? `使用标题: ${title}` : '输入待办标题...'}
                  className="flex-1 px-2.5 py-1.5 rounded border border-line bg-surface-2 text-ink placeholder:text-muted focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleCreateTodo}
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold whitespace-nowrap shadow transition"
                >
                  派发
                </button>
              </div>
            </div>

            {/* 关联已有待办 */}
            <div className="py-3 border-b border-line space-y-2">
              <span className="font-semibold text-ink">🔗 关联已有 Todo ID：</span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={linkTodoIdInput}
                  onChange={(e) => setLinkTodoIdInput(e.target.value)}
                  placeholder="如 todo-item-xxx"
                  className="flex-1 px-2.5 py-1.5 rounded border border-line bg-surface-2 text-ink placeholder:text-muted focus:outline-none focus:border-indigo-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handleLinkExistingTodo}
                  className="px-3 py-1.5 rounded border border-line bg-surface-2 hover:bg-surface-3 text-ink font-semibold whitespace-nowrap transition"
                >
                  关联
                </button>
              </div>
            </div>

            {/* 已关联列表 */}
            <div className="flex-1 overflow-y-auto py-2 space-y-2 custom-scrollbar">
              {todoLinks.length === 0 ? (
                <div className="py-8 text-center text-muted">
                  <p>暂无关联待办</p>
                  <p className="text-[10px] mt-1">可点击上方按钮快速将便签转化为 Todo</p>
                </div>
              ) : (
                todoLinks.map((link) => (
                  <div
                    key={link.todoItemId}
                    className="p-2.5 rounded-control border border-line bg-surface-2/60 flex items-start justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`size-2 rounded-full ${
                            link.status === 'done' || link.status === 'completed'
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                          }`}
                        />
                        <span className="font-semibold text-ink truncate">{link.title}</span>
                      </div>
                      <div className="text-[10px] text-muted mt-1 font-mono">
                        ID: {link.todoItemId}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveTodoLink(link.todoItemId)}
                      className="text-muted hover:text-rose-500 text-xs px-1"
                      title="解除关联"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 底部状态信息栏 */}
      <footer className="flex items-center justify-between px-4 py-1.5 border-t border-line bg-surface-2/80 text-[11px] text-secondary select-none">
        <div className="flex items-center gap-3">
          <span>
            字数: <strong className="text-ink font-mono">{stats.words}</strong>
          </span>
          <span>
            字符: <strong className="text-ink font-mono">{stats.chars}</strong>
          </span>
          <span>
            行数: <strong className="text-ink font-mono">{stats.lines}</strong>
          </span>
          <span className="text-muted">|</span>
          <span>{formatReadingTime(stats.readingTimeMinutes)}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-muted font-mono">Rev: {revision}</span>
          <span className="text-muted">最后保存: {lastSavedTime.toLocaleTimeString()}</span>
          <button
            type="button"
            onClick={handleDeleteNote}
            className="text-rose-500 hover:text-rose-700 hover:underline transition"
          >
            删除便签
          </button>
        </div>
      </footer>
    </div>
  );
}
