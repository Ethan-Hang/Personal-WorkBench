import React, { useState } from 'react';
import { Modal, Button, IconImage } from '@workbench/ui';
import type { NoteView } from '../../contract.js';
import {
  exportToHtml,
  exportToMarkdown,
  exportToPdf,
  exportToPng,
  type ExportOptions,
} from '../exportEngine.js';
import { IconFileText, IconShare } from './icons.js';

export interface NoteExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: NoteView | null;
}

export function NoteExportModal({ isOpen, onClose, note }: NoteExportModalProps) {
  const [includeFrontmatter, setIncludeFrontmatter] = useState(true);
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  if (!note) return null;

  const exportOptions: ExportOptions = {
    includeFrontmatter,
    includeWatermark,
  };

  const handleExport = async (format: 'md' | 'html' | 'pdf' | 'png') => {
    setIsExporting(true);
    setExportSuccess(null);
    try {
      if (format === 'md') {
        exportToMarkdown(note, exportOptions);
        setExportSuccess('Markdown 源文件导出成功');
      } else if (format === 'html') {
        exportToHtml(note, exportOptions);
        setExportSuccess('自包含 HTML 导出成功');
      } else if (format === 'pdf') {
        exportToPdf(note, exportOptions);
        setExportSuccess('已打开打印与 PDF 导出窗口');
      } else if (format === 'png') {
        await exportToPng(note, exportOptions);
        setExportSuccess('高清 PNG 长图导出成功');
      }
    } catch {
      // ignore
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="导出便签" maxWidth="max-w-xl">
      <div className="flex flex-col gap-5 py-1">
        {/* 顶部便签信息卡片 */}
        <div className="flex items-center justify-between p-3.5 rounded-panel bg-surface-2 border border-line text-xs">
          <div className="flex flex-col gap-0.5 truncate">
            <span className="font-bold text-ink text-sm truncate">
              {note.title.trim() || '无标题便签'}
            </span>
            <span className="text-secondary text-xs">
              {note.tags.length > 0 ? note.tags.map((t) => `#${t}`).join(' ') : '无标签'} ·{' '}
              {note.content.length} 字符
            </span>
          </div>
          <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-accent-soft text-accent capitalize border border-accent/20">
            {note.color}
          </span>
        </div>

        {/* 导出成功提示 */}
        {exportSuccess && (
          <div className="p-3 rounded-control bg-good-soft text-good border border-good/30 text-xs flex items-center justify-between animate-popover-enter font-medium">
            <span>✓ {exportSuccess}</span>
            <button
              type="button"
              onClick={() => setExportSuccess(null)}
              className="text-good hover:opacity-80 ml-2 font-bold cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* 4 种导出格式选项矩阵 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 1. Markdown 导出 */}
          <div className="flex flex-col justify-between p-4 rounded-panel border border-line bg-surface hover:border-accent/40 hover:bg-surface-2/60 transition-all group shadow-2xs">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="size-7 rounded-control bg-accent-soft text-accent flex items-center justify-center">
                  <IconFileText size={15} />
                </div>
                <span className="font-bold text-ink text-sm">Markdown 源文件</span>
              </div>
              <p className="text-xs text-secondary leading-relaxed mb-3">
                导出为 UTF-8 <code>.md</code> 纯文本文件，附带 YAML Frontmatter 元数据，兼容
                Obsidian、Typora。
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => handleExport('md')}
              disabled={isExporting}
              className="w-full text-xs py-1.5 cursor-pointer"
            >
              下载 .md 文件
            </Button>
          </div>

          {/* 2. 独立单文件 HTML 导出 */}
          <div className="flex flex-col justify-between p-4 rounded-panel border border-line bg-surface hover:border-accent/40 hover:bg-surface-2/60 transition-all group shadow-2xs">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="size-7 rounded-control bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <IconShare size={15} />
                </div>
                <span className="font-bold text-ink text-sm">独立离线 HTML</span>
              </div>
              <p className="text-xs text-secondary leading-relaxed mb-3">
                导出为单文件 <code>.html</code>
                ，内嵌全套排版样式与高亮，支持离线在任何浏览器中完美呈现。
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => handleExport('html')}
              disabled={isExporting}
              className="w-full text-xs py-1.5 cursor-pointer"
            >
              下载 .html 文件
            </Button>
          </div>

          {/* 3. PNG 高清长图导出 */}
          <div className="flex flex-col justify-between p-4 rounded-panel border border-line bg-surface hover:border-accent/40 hover:bg-surface-2/60 transition-all group shadow-2xs">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="size-7 rounded-control bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <IconImage size={15} />
                </div>
                <span className="font-bold text-ink text-sm">PNG 高清分享长图</span>
              </div>
              <p className="text-xs text-secondary leading-relaxed mb-3">
                将便签转换为 2x
                视网膜高清图片卡片，保留主题色与排版，适合社交媒体或即时通讯工具分享。
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => handleExport('png')}
              disabled={isExporting}
              className="w-full text-xs py-1.5 cursor-pointer"
            >
              生成并下载图片
            </Button>
          </div>

          {/* 4. PDF 文档打印导出 */}
          <div className="flex flex-col justify-between p-4 rounded-panel border border-line bg-surface hover:border-accent/40 hover:bg-surface-2/60 transition-all group shadow-2xs">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="size-7 rounded-control bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <IconFileText size={15} />
                </div>
                <span className="font-bold text-ink text-sm">PDF 文档 / 打印</span>
              </div>
              <p className="text-xs text-secondary leading-relaxed mb-3">
                针对 A4 纸张排版进行分页优化，调起系统原生打印窗口，支持直接保存为 PDF 文档。
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => handleExport('pdf')}
              disabled={isExporting}
              className="w-full text-xs py-1.5 cursor-pointer"
            >
              打开打印 / 另存为 PDF
            </Button>
          </div>
        </div>

        {/* 导出偏好微调 */}
        <div className="flex flex-col gap-2 pt-2 border-t border-line text-xs text-secondary">
          <span className="font-bold text-ink text-[11px] uppercase tracking-wider">导出选项</span>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeFrontmatter}
                onChange={(e) => setIncludeFrontmatter(e.target.checked)}
                className="size-3.5 rounded border-line text-accent focus:ring-accent"
              />
              <span>包含 YAML 元数据 (Markdown)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeWatermark}
                onChange={(e) => setIncludeWatermark(e.target.checked)}
                className="size-3.5 rounded border-line text-accent focus:ring-accent"
              />
              <span>页脚署名水印 (HTML/PNG)</span>
            </label>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </Modal>
  );
}
