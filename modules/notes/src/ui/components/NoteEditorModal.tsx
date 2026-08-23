import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { FolderNode, FolderView, NoteView } from '../../contract.js';
import { NoteEditor } from './NoteEditor.js';

export interface NoteEditorModalProps {
  isOpen: boolean;
  note: NoteView | null;
  folders?: (FolderNode | FolderView)[];
  onClose: () => void;
  onNoteUpdated?: (updated: NoteView) => void;
  onNoteDeleted?: (id: string) => void;
}

export function NoteEditorModal({
  isOpen,
  note,
  folders = [],
  onClose,
  onNoteUpdated,
  onNoteDeleted,
}: NoteEditorModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }

    if (!shouldRender) return;

    setIsClosing(true);
    const timer = setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [isOpen, shouldRender]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, onClose]);

  if (!shouldRender || !note) return null;

  const content = (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 transition-all duration-200 ${
        isFullscreen ? 'p-0!' : ''
      }`}
    >
      {/* 沉浸式毛玻璃全屏背景遮罩 */}
      <div
        className={`fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md transition-opacity duration-200 ease-out ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 弹窗核心主体 */}
      <div
        className={`relative z-10 w-full h-[90vh] max-h-[900px] transition-all duration-200 ease-out ${
          isFullscreen
            ? 'w-screen! h-screen! max-h-none! max-w-none! rounded-none'
            : 'max-w-5xl rounded-panel'
        } ${isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100 animate-scale-in'}`}
      >
        <NoteEditor
          note={note}
          folders={folders}
          onUpdate={onNoteUpdated}
          onDelete={onNoteDeleted}
          onClose={onClose}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
          className="h-full"
        />
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}
