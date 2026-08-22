import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { FolderNode, FolderView, NoteColor, NoteView, TodoLinkView } from '../../contract.js';
import { NOTE_COLORS } from '../../contract.js';
import {
  postNote,
  patchNote,
  postCreateTodo,
  postLinkTodo,
  deleteTodoLink,
  deleteNote,
} from '../api.js';
import { createAutosave, type Autosave, type SaveStatus } from '../autosave.js';
import { isModifierPressed } from '../keyboard.js';
import { NoteMarkdownViewer } from '../markdown/renderer.js';
import { NoteFormatToolbar, applyMarkdownFormat, type FormatType } from './NoteFormatToolbar.js';
import { NoteOutlineToc } from './NoteOutlineToc.js';
import { NoteExportModal } from './NoteExportModal.js';
import { IconCheckSquare, IconChevronDown, IconFolder } from '@workbench/ui';
import { IconFileText, IconMaximize2, IconMinimize2, IconPin, IconShare } from './icons.js';

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

export const NOTE_COLOR_CONFIG: Record<
  NoteColor,
  { label: string; bgClass: string; dotClass: string }
> = {
  yellow: {
    label: '暖阳黄',
    bgClass:
      'bg-amber-50 border-amber-200 dark:bg-amber-950/70 dark:border-amber-500/50 text-ink shadow-xs',
    dotClass: 'bg-amber-400 border-amber-500 dark:bg-amber-300 dark:border-amber-400 shadow-2xs',
  },
  green: {
    label: '薄荷绿',
    bgClass:
      'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/70 dark:border-emerald-500/50 text-ink shadow-xs',
    dotClass:
      'bg-emerald-400 border-emerald-500 dark:bg-emerald-300 dark:border-emerald-400 shadow-2xs',
  },
  blue: {
    label: '清泉蓝',
    bgClass:
      'bg-sky-50 border-sky-200 dark:bg-sky-950/70 dark:border-sky-500/50 text-ink shadow-xs',
    dotClass: 'bg-sky-400 border-sky-500 dark:bg-sky-300 dark:border-sky-400 shadow-2xs',
  },
  purple: {
    label: '薰衣草',
    bgClass:
      'bg-purple-50 border-purple-200 dark:bg-purple-950/70 dark:border-purple-500/50 text-ink shadow-xs',
    dotClass:
      'bg-purple-400 border-purple-500 dark:bg-purple-300 dark:border-purple-400 shadow-2xs',
  },
  pink: {
    label: '樱花粉',
    bgClass:
      'bg-rose-50 border-rose-200 dark:bg-rose-950/70 dark:border-rose-400/50 text-ink shadow-xs',
    dotClass: 'bg-rose-400 border-rose-500 dark:bg-rose-300 dark:border-rose-400 shadow-2xs',
  },
  gray: {
    label: '极简灰',
    bgClass:
      'bg-surface border-zinc-200 dark:bg-surface-2 dark:border-zinc-700/80 text-ink shadow-xs',
    dotClass: 'bg-zinc-400 border-zinc-500 dark:bg-zinc-300 dark:border-zinc-400 shadow-2xs',
  },
};

export function getNoteColorBgClass(color: NoteColor): string {
  return (
    NOTE_COLOR_CONFIG[color]?.bgClass ??
    'bg-surface-2 border-zinc-300/70 dark:border-zinc-700/60 text-ink'
  );
}

export function getNoteColorDotClass(color: NoteColor): string {
  return NOTE_COLOR_CONFIG[color]?.dotClass ?? 'bg-zinc-400 border-zinc-500/40 shadow-2xs';
}

export function getNoteColorLabel(color: NoteColor): string {
  return NOTE_COLOR_CONFIG[color]?.label ?? color;
}

export interface NoteEditorProps {
  note: NoteView;
  folders?: (FolderNode | FolderView)[];
  onUpdate?: (updated: NoteView) => void;
  onDelete?: (id: string) => void;
  onClose?: () => void;
  onBack?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  className?: string;
}

/** 保存状态的定义已上移至 ui/autosave.ts；此处再导出以免破坏既有 import 点。 */
export type { SaveStatus };
export type ViewMode = 'edit' | 'split' | 'preview';

/**
 * 编辑器退出时该做什么。
 *
 * 这段取舍原先在 `handleSafeClose` 与 `handleSafeBack` 里各写一遍——两个函数
 * 除了最后调 `onClose` 还是 `onBack` 之外逐字相同，共约 70 行。抽成纯函数后
 * 既能直接测，两个入口也真正共用同一份判断。
 *
 * 两条不显然的规则：
 *
 * - **空内容 + 已入库 → 删除。** 把便签清空再退出，意思是「不要它了」，
 *   留一条空记录在列表里是噪音。
 * - **空内容 + 未入库草稿 → 什么都不做。** 对一个后端根本不存在的
 *   `draft-` id 发 DELETE 只会拿到 404。
 */
export type ExitAction = 'delete' | 'save' | 'none';

export function decideExitAction(input: {
  title: string;
  content: string;
  hasPendingChanges: boolean;
  isDraft: boolean;
}): { action: ExitAction; delayMs: number } {
  const isEmpty = !input.title.trim() && !input.content.trim();

  if (isEmpty) {
    return { action: input.isDraft ? 'none' : 'delete', delayMs: 220 };
  }
  // 未入库草稿即使「没有改动」也要存：它的内容还一个字都没落库过。
  return {
    action: input.hasPendingChanges || input.isDraft ? 'save' : 'none',
    delayMs: 200,
  };
}

/** 交给 autosave 的草稿快照。**刻意不含 revision**——版本号由状态机持有。 */
export interface NoteDraft {
  title: string;
  content: string;
  color: NoteColor;
  folderId: string | null;
  isPinned: boolean;
  tags: string[];
}

export function NoteEditor({
  note,
  folders = [],
  onUpdate,
  onDelete,
  onClose,
  onBack,
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
  const [lastSavedTime, setLastSavedTime] = useState<Date>(new Date(note.updatedAt));
  const currentNoteIdRef = useRef(note.id);

  // 保存的并发与版本语义全部交给 autosave 状态机（见 ui/autosave.ts）。
  // 它不认识 React，因此那四条不变量——单一在途请求、补发带最新 revision、
  // pending 是标记不是队列、失败也释放在途标记——都由 autosave.test.ts 直接守着，
  // 不必挂载组件。094e103 修的竞态就活在这里。
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const autosaveRef = useRef<Autosave<NoteDraft> | null>(null);
  if (autosaveRef.current === null) {
    autosaveRef.current = createAutosave<NoteDraft, NoteView>({
      initialRevision: note.revision,
      save: (draft, revisionAtSave) =>
        currentNoteIdRef.current.startsWith('draft-')
          ? // 首次落库创建真实便签：没有版本号可带
            postNote({
              title: draft.title,
              content: draft.content,
              color: draft.color,
              folderId: draft.folderId,
              isPinned: draft.isPinned,
              tags: draft.tags,
            })
          : // 增量更新：revision 由状态机给，不取草稿里的快照
            patchNote(currentNoteIdRef.current, {
              title: draft.title,
              content: draft.content,
              color: draft.color,
              folderId: draft.folderId,
              isPinned: draft.isPinned,
              tags: draft.tags,
              revision: revisionAtSave,
            }),
      revisionOf: (updated) => updated.revision,
      onStatus: setSaveStatus,
      onSaved: (updated) => {
        currentNoteIdRef.current = updated.id;
        setRevision(updated.revision);
        setLastSavedTime(new Date(updated.updatedAt));
        onUpdateRef.current?.(updated);
      },
      isConflict: (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        return msg.includes('409') || msg.includes('版本冲突');
      },
    });
  }
  const autosave = autosaveRef.current;

  // 监听外部 note 更新
  useEffect(() => {
    currentNoteIdRef.current = note.id;
    autosave.adoptRevision(note.revision);
    setRevision(autosave.revision);
  }, [note.id, note.revision, autosave]);

  // 交互视图控制
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isTocCollapsed, setIsTocCollapsed] = useState(false);
  const [isTodoDrawerOpen, setIsTodoDrawerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [linkTodoIdInput, setLinkTodoIdInput] = useState('');
  const [todoActionError, setTodoActionError] = useState<string | null>(null);

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
    hasPendingChanges: false,
  });

  draftRef.current = {
    title,
    content,
    color,
    folderId,
    isPinned,
    tags,
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

  // 执行落库保存。并发与版本语义都在 autosave 里，这里只剩「该不该存」这一个判断。
  const executeSave = useCallback(
    async (immediateDraft?: typeof draftRef.current) => {
      const currentDraft = immediateDraft || draftRef.current;
      const isBlank = !currentDraft.title.trim() && !currentDraft.content.trim();

      // 全新未入库草稿且内容完全空白时不向后端写入空数据。
      // 这条留在组件里而不进 autosave：它是便签的领域判断，不是保存的并发语义。
      if (currentNoteIdRef.current.startsWith('draft-') && isBlank) {
        setSaveStatus('saved');
        return;
      }

      await autosave.save(currentDraft);
    },
    [autosave],
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
    setTodoActionError(null);
    if (currentNoteIdRef.current.startsWith('draft-')) {
      await executeSave();
    }
    try {
      const res = await postCreateTodo(currentNoteIdRef.current, {
        title: newTodoTitle.trim() || undefined,
      });
      setTodoLinks((prev) => [...prev, res.link]);
      setNewTodoTitle('');
      onUpdate?.(res.note);
    } catch (err) {
      setTodoActionError(err instanceof Error ? err.message : '创建待办失败');
    }
  };

  // 关联已有待办
  const handleLinkExistingTodo = async () => {
    if (!linkTodoIdInput.trim()) return;
    setTodoActionError(null);
    if (currentNoteIdRef.current.startsWith('draft-')) {
      await executeSave();
    }
    try {
      const res = await postLinkTodo(currentNoteIdRef.current, {
        todoItemId: linkTodoIdInput.trim(),
      });
      setTodoLinks(res.links);
      setLinkTodoIdInput('');
    } catch (err) {
      setTodoActionError(err instanceof Error ? err.message : '关联待办失败');
    }
  };

  // 解除待办关联
  const handleRemoveTodoLink = async (todoItemId: string) => {
    setTodoActionError(null);
    try {
      await deleteTodoLink(currentNoteIdRef.current, todoItemId);
      setTodoLinks((prev) => prev.filter((l) => l.todoItemId !== todoItemId));
    } catch (err) {
      setTodoActionError(err instanceof Error ? err.message : '解除关联失败');
    }
  };

  // 删除当前便签
  const handleDeleteNote = async () => {
    if (window.confirm('确定要彻底删除该便签吗？此操作无法撤销。')) {
      if (currentNoteIdRef.current.startsWith('draft-')) {
        handleSafeClose();
        return;
      }
      try {
        await deleteNote(currentNoteIdRef.current);
        onDelete?.(currentNoteIdRef.current);
        onClose?.();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '删除便签失败');
      }
    }
  };

  // 安全退出与返回：如果便签未输入任何标题或内容（空便签），自动在退出时平滑清理删除并带淡出折叠过渡
  /**
   * 安全退出：关闭与返回共用同一份判断（见 decideExitAction），只有「去哪」不同。
   * 此前这两个流程是两段近乎逐字相同的代码。
   */
  const exitSafely = useCallback(
    async (leave: () => void) => {
      if (isExiting) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const isDraft = currentNoteIdRef.current.startsWith('draft-');
      const { action, delayMs } = decideExitAction({
        title: draftRef.current.title,
        content: draftRef.current.content,
        hasPendingChanges: draftRef.current.hasPendingChanges,
        isDraft,
      });

      setIsExiting(true);

      if (action === 'delete') {
        try {
          await deleteNote(currentNoteIdRef.current);
          onDelete?.(currentNoteIdRef.current);
        } catch {
          // 删不掉就算了：用户要走的是这一步，不该被它挡住。
        }
      } else if (action === 'save') {
        await executeSave();
      }

      setTimeout(leave, delayMs);
    },
    [isExiting, onDelete, executeSave],
  );

  const handleSafeClose = useCallback(() => exitSafely(() => onClose?.()), [exitSafely, onClose]);

  const handleSafeBack = useCallback(
    () =>
      exitSafely(() => {
        if (onBack) onBack();
        else if (onClose) onClose();
      }),
    [exitSafely, onBack, onClose],
  );

  // 富文本快捷格式化辅助函数
  const applyFormatToTextarea = useCallback(
    (format: FormatType) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const result = applyMarkdownFormat({
        text: content,
        selectionStart: start,
        selectionEnd: end,
        format,
      });
      setContent(result.text);
      triggerDebouncedSave();
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(result.newSelectionStart, result.newSelectionEnd);
      }, 0);
    },
    [content, triggerDebouncedSave],
  );

  // 全局快捷键监听（Ctrl+S 立即保存, Ctrl+Enter 完成, Esc 层级退出/关闭, Ctrl+E 视图切换, F11 全屏）
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const modKey = isModifierPressed(e);

      // 1. Ctrl+S / Cmd+S 立即手动落库保存
      if (modKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        executeSave();
        return;
      }

      // 2. Ctrl+Enter / Cmd+Enter 完成并退出
      if (modKey && e.key === 'Enter') {
        e.preventDefault();
        handleSafeClose();
        return;
      }

      // 3. Esc 键层级退出
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isExportModalOpen) {
          setIsExportModalOpen(false);
        } else if (isColorPickerOpen) {
          setIsColorPickerOpen(false);
        } else if (isFolderPickerOpen) {
          setIsFolderPickerOpen(false);
        } else if (isTodoDrawerOpen) {
          setIsTodoDrawerOpen(false);
        } else {
          handleSafeClose();
        }
        return;
      }

      // 4. Ctrl+E: 循环切换编辑器视图 (edit -> split -> preview -> edit)
      if (modKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        setViewMode((prev) => {
          if (prev === 'edit') return 'split';
          if (prev === 'split') return 'preview';
          return 'edit';
        });
        return;
      }

      // 5. F11 或 Alt+Enter: 切换全屏沉浸模式
      if (e.key === 'F11' || (e.altKey && e.key === 'Enter')) {
        if (onToggleFullscreen) {
          e.preventDefault();
          onToggleFullscreen();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [
    executeSave,
    handleSafeClose,
    isColorPickerOpen,
    isFolderPickerOpen,
    isExportModalOpen,
    isTodoDrawerOpen,
    onToggleFullscreen,
  ]);

  // 编辑器文本框内快捷键（Ctrl+B/I/K/Shift+X/Shift+C, Tab 缩进）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const modKey = isModifierPressed(e);

    // 常用格式化快捷键
    if (modKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      applyFormatToTextarea('bold');
      return;
    }
    if (modKey && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      applyFormatToTextarea('italic');
      return;
    }
    if (modKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      applyFormatToTextarea('link');
      return;
    }
    if (modKey && e.shiftKey && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      applyFormatToTextarea('strike');
      return;
    }
    if (modKey && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      applyFormatToTextarea('code');
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
      const currentDraft = draftRef.current;
      const isEmpty = !currentDraft.title.trim() && !currentDraft.content.trim();
      if (!isEmpty && currentDraft.hasPendingChanges) {
        executeSave(currentDraft);
      }
    };
  }, [executeSave]);

  const handleTaskToggle = (taskText: string, currentChecked: boolean) => {
    const targetCheck = currentChecked ? '\\[x\\]' : '\\[ \\]';
    const newCheck = currentChecked ? '- [ ]' : '- [x]';
    const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(-\\s+${targetCheck}\\s+)(${escaped})`, 'i');

    if (regex.test(content)) {
      const updated = content.replace(regex, `${newCheck} $2`);
      setContent(updated);
      triggerDebouncedSave();
    }
  };

  const colorBgClass = getNoteColorBgClass(color);

  return (
    <div
      className={`flex flex-1 flex-col h-full min-h-0 bg-surface text-ink border border-line/80 shadow-2xl rounded-panel overflow-hidden transition-all duration-260 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isExiting
          ? 'opacity-0 scale-[0.98] -translate-y-2 pointer-events-none'
          : 'opacity-100 scale-100 translate-y-0'
      } ${isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : ''} ${className}`}
    >
      {/* 顶部主控制导航条 */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-line bg-surface/90 backdrop-blur z-20 select-none shrink-0">
        {/* 左侧：返回按钮、色彩选择器、文件夹归属、置顶状态与保存状态指示 */}
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={handleSafeBack}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-control border border-line bg-surface-2/80 hover:bg-surface-3 text-ink font-semibold text-xs transition active:scale-95 cursor-pointer shadow-2xs mr-1"
              title="返回便签列表 (Esc)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              <span>返回列表</span>
            </button>
          )}

          {/* 色彩选择器 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsColorPickerOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-control border border-line bg-surface hover:bg-surface-2 transition-all cursor-pointer shadow-2xs"
              title="切换便签主题色"
            >
              <span
                className={`size-2.5 rounded-full border border-black/15 ${getNoteColorDotClass(color)}`}
              />
              <span className="text-xs text-secondary font-medium">{getNoteColorLabel(color)}</span>
              <IconChevronDown size={11} className="text-muted" />
            </button>

            {isColorPickerOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-40 flex gap-1.5 p-2 rounded-panel border border-line bg-surface shadow-xl backdrop-blur animate-popover-enter">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleColorChange(c)}
                    className={`size-5 rounded-full border border-black/15 transition-transform cursor-pointer ${getNoteColorDotClass(
                      c,
                    )} ${color === c ? 'ring-2 ring-accent scale-115' : 'hover:scale-115'}`}
                    title={`主题色：${getNoteColorLabel(c)}`}
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
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-control border border-line bg-surface hover:bg-surface-2 text-xs text-secondary hover:text-ink transition-all cursor-pointer shadow-2xs"
              title="移动到文件夹"
            >
              <IconFolder size={13} className="text-muted" />
              <span className="max-w-[100px] truncate">
                {folderId ? folders.find((f) => f.id === folderId)?.name || '未知文件夹' : '未分类'}
              </span>
              <IconChevronDown size={11} className="text-muted" />
            </button>

            {isFolderPickerOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-40 w-44 max-h-56 overflow-y-auto rounded-panel border border-line bg-surface p-1.5 shadow-xl backdrop-blur text-xs">
                <button
                  type="button"
                  onClick={() => handleFolderChange(null)}
                  className={`w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-2 transition flex items-center gap-1.5 ${
                    folderId === null ? 'font-semibold text-accent' : 'text-secondary'
                  }`}
                >
                  <IconFolder size={13} className="text-muted" />
                  <span>未分类 (根目录)</span>
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleFolderChange(f.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-2 transition truncate flex items-center gap-1.5 ${
                      folderId === f.id ? 'font-semibold text-accent' : 'text-secondary'
                    }`}
                  >
                    <IconFolder size={13} className="text-muted" />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 置顶按钮 */}
          <button
            type="button"
            onClick={handleTogglePin}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-control border text-xs font-medium transition-all shadow-2xs cursor-pointer ${
              isPinned
                ? 'border-warning/50 bg-warning-soft text-warning font-semibold'
                : 'border-line bg-surface text-secondary hover:text-ink hover:bg-surface-2'
            }`}
            title={isPinned ? '取消置顶' : '置顶该便签'}
          >
            <IconPin size={13} className={isPinned ? 'text-warning' : 'text-muted'} />
            <span>{isPinned ? '已置顶' : '置顶'}</span>
          </button>

          {/* 实时保存状态指示 */}
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface-2/80 text-secondary border border-line/40">
            {saveStatus === 'saved' && (
              <>
                <span className="text-good font-bold text-[11px]">✓</span>
                <span className="text-muted text-[11px]">已保存</span>
              </>
            )}
            {saveStatus === 'saving' && (
              <>
                <span className="inline-block size-2 rounded-full bg-accent animate-ping" />
                <span className="text-accent text-[11px]">保存中...</span>
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <span className="size-2 rounded-full bg-warning" />
                <span className="text-muted text-[11px]">未保存</span>
              </>
            )}
            {saveStatus === 'conflict' && (
              <>
                <span className="text-warning font-bold">⚠️</span>
                <span className="text-warning text-[11px] font-medium">版本冲突已保留</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <span className="text-critical font-bold">✕</span>
                <span className="text-critical text-[11px]">保存失败</span>
              </>
            )}
          </div>
        </div>

        {/* 右侧：视图切换器、待办联动、全屏切换与关闭按钮 */}
        <div className="flex items-center gap-2">
          {/* 视图切换 (Apple / Linear 分段控制) */}
          <div className="flex items-center rounded-control border border-line bg-surface-2/80 p-0.5 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`px-2.5 py-0.5 rounded-[7px] transition-all cursor-pointer ${
                viewMode === 'edit'
                  ? 'bg-surface shadow-2xs text-ink font-semibold'
                  : 'text-secondary hover:text-ink'
              }`}
              title="纯编辑模式"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-2.5 py-0.5 rounded-[7px] transition-all cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-surface shadow-2xs text-ink font-semibold'
                  : 'text-secondary hover:text-ink'
              }`}
              title="双栏分栏预览模式"
            >
              分栏
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-2.5 py-0.5 rounded-[7px] transition-all cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-surface shadow-2xs text-ink font-semibold'
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
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-control border text-xs font-medium transition-all shadow-2xs cursor-pointer ${
              isTodoDrawerOpen || todoLinks.length > 0
                ? 'border-accent/40 bg-accent-soft text-accent font-semibold'
                : 'border-line bg-surface text-secondary hover:text-ink hover:bg-surface-2'
            }`}
            title="查看或派发关联待办"
          >
            <IconCheckSquare size={13} />
            <span>待办</span>
            {todoLinks.length > 0 && (
              <span className="size-4 flex items-center justify-center rounded-full bg-accent text-white text-[10px] font-mono">
                {todoLinks.length}
              </span>
            )}
          </button>

          {/* 大纲开关 */}
          <button
            type="button"
            onClick={() => setIsTocCollapsed((prev) => !prev)}
            className={`p-1.5 rounded-control border text-xs transition-all shadow-2xs cursor-pointer ${
              !isTocCollapsed
                ? 'border-line bg-surface text-ink font-semibold shadow-2xs'
                : 'border-line bg-surface-2 text-muted hover:text-ink'
            }`}
            title={isTocCollapsed ? '展开大纲目录' : '收起大纲目录'}
          >
            <IconFileText size={14} />
          </button>

          {/* 导出中心 */}
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-control border border-line bg-surface hover:bg-surface-2 text-secondary hover:text-ink text-xs font-medium transition-all shadow-2xs cursor-pointer"
            title="导出便签 (Markdown / HTML / PNG / PDF)"
          >
            <IconShare size={13} />
            <span>导出</span>
          </button>

          {/* 全屏/沉浸式切换 */}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="p-1.5 rounded-control border border-line bg-surface hover:bg-surface-2 text-secondary hover:text-ink text-xs transition-all shadow-2xs cursor-pointer"
              title={isFullscreen ? '退出全屏沉浸模式' : '进入全屏沉浸模式'}
            >
              {isFullscreen ? <IconMinimize2 size={13} /> : <IconMaximize2 size={13} />}
            </button>
          )}

          {/* 完成按钮 */}
          {onClose && (
            <button
              type="button"
              onClick={handleSafeClose}
              className="px-3.5 py-1 rounded-control bg-ink text-surface hover:opacity-90 active:scale-[0.98] font-medium text-xs shadow-xs transition-all cursor-pointer"
              title="完成并保存 (Ctrl+Enter / Esc)"
            >
              完成
            </button>
          )}
        </div>
      </header>

      {/* 主体编辑区与右侧大纲容器 */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* 左侧核心编辑内容 */}
        <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
          {/* 标题输入区与标签条 */}
          <div
            className={`px-6 pt-5 pb-2 border-b border-line/40 ${colorBgClass} transition-colors shrink-0`}
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
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Markdown 源码输入框 */}
            {viewMode !== 'preview' && (
              <div
                className={`h-full flex flex-col min-h-0 ${
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
                className={`h-full min-h-0 overflow-y-auto p-6 bg-surface/50 ${
                  viewMode === 'split' ? 'w-1/2' : 'w-full max-w-4xl mx-auto'
                } custom-scrollbar`}
              >
                <NoteMarkdownViewer content={content} onTaskToggle={handleTaskToggle} interactive />
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
                className="size-6 flex items-center justify-center rounded hover:bg-surface-2 text-muted hover:text-ink cursor-pointer"
              >
                ✕
              </button>
            </div>

            {todoActionError && (
              <div className="p-2 rounded bg-critical-soft text-critical border border-critical/30 text-xs font-medium flex items-center justify-between">
                <span>{todoActionError}</span>
                <button
                  type="button"
                  onClick={() => setTodoActionError(null)}
                  className="text-critical hover:opacity-80 ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

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
      <footer className="flex items-center justify-between px-4 py-1.5 border-t border-line bg-surface-2/80 text-[11px] text-secondary select-none shrink-0">
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

      {/* 导出中心模态弹窗 */}
      <NoteExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        note={{
          ...note,
          title,
          content,
          color,
          folderId,
          isPinned,
          tags,
          todoLinks,
          revision,
          updatedAt: lastSavedTime.toISOString(),
        }}
      />
    </div>
  );
}
