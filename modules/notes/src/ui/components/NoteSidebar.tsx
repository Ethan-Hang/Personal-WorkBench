import React, { useState } from 'react';
import type { FolderNode, FolderView, NoteStatus } from '../../contract.js';
import type { StatsResponse, TagsResponse } from '../api.js';
import {
  IconChevronDown,
  IconChevronRight,
  IconEdit,
  IconFileText,
  IconPlus,
  IconTrash,
} from '@workbench/ui';
import { IconArchive } from './icons.js';

export interface NoteSidebarProps {
  folders: FolderNode[];
  selectedFolderId: string | null; // null for All, 'unfiled' for unfiled, or folder UUID
  selectedStatus: NoteStatus;
  selectedTag: string | null;
  stats?: StatsResponse;
  tags?: TagsResponse;
  onSelectFolder: (folderId: string | null) => void;
  onSelectStatus: (status: NoteStatus) => void;
  onSelectTag: (tag: string | null) => void;
  onCreateFolder: (parentId?: string | null) => void;
  onEditFolder: (folder: FolderView) => void;
  onDeleteFolder: (folderId: string) => void;
  onEmptyTrash?: () => void;
  className?: string;
}

interface FolderTreeItemProps {
  node: FolderNode;
  selectedFolderId: string | null;
  selectedStatus: NoteStatus;
  selectedTag: string | null;
  level: number;
  onSelectFolder: (folderId: string | null) => void;
  onCreateSubfolder: (parentId: string) => void;
  onEditFolder: (folder: FolderView) => void;
  onDeleteFolder: (folderId: string) => void;
}

function FolderTreeItem({
  node,
  selectedFolderId,
  selectedStatus,
  selectedTag,
  level,
  onSelectFolder,
  onCreateSubfolder,
  onEditFolder,
  onDeleteFolder,
}: FolderTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasChildren = node.children && node.children.length > 0;
  const isSelected =
    selectedStatus === 'active' && selectedTag === null && selectedFolderId === node.id;

  const currentFolderView: FolderView = {
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    icon: node.icon,
    color: node.color,
    sortOrder: node.sortOrder,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    noteCount: node.noteCount ?? 0,
  };

  return (
    <div className="flex flex-col select-none">
      <div
        className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-control text-xs font-medium cursor-pointer transition-all ${
          isSelected
            ? 'bg-accent-soft text-accent font-bold border border-accent/20 shadow-2xs'
            : 'text-secondary hover:text-ink hover:bg-surface-2 border border-transparent'
        }`}
        style={{ paddingLeft: `${Math.max(10, level * 14 + 10)}px` }}
        onClick={() => onSelectFolder(node.id)}
      >
        <div className="flex items-center gap-1.5 truncate flex-1 mr-1">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className="p-0.5 -ml-1 text-muted hover:text-ink rounded transition-colors cursor-pointer"
            >
              {isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            </button>
          ) : (
            <span className="w-3" />
          )}

          <span className="text-sm shrink-0">{node.icon || '📁'}</span>
          <span className="truncate">{node.name}</span>
        </div>

        {/* 文件夹操作动作 */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateSubfolder(node.id);
            }}
            title="新建子文件夹"
            className="p-1 rounded-control hover:bg-surface text-muted hover:text-accent transition-colors cursor-pointer"
          >
            <IconPlus size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditFolder(currentFolderView);
            }}
            title="编辑文件夹"
            className="p-1 rounded-control hover:bg-surface text-muted hover:text-ink transition-colors cursor-pointer"
          >
            <IconEdit size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFolder(node.id);
            }}
            title="删除文件夹"
            className="p-1 rounded-control hover:bg-critical-soft text-muted hover:text-critical transition-colors cursor-pointer"
          >
            <IconTrash size={12} />
          </button>
        </div>
      </div>

      {/* 递归渲染子文件夹 */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              selectedFolderId={selectedFolderId}
              selectedStatus={selectedStatus}
              selectedTag={selectedTag}
              level={level + 1}
              onSelectFolder={onSelectFolder}
              onCreateSubfolder={onCreateSubfolder}
              onEditFolder={onEditFolder}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function NoteSidebar({
  folders,
  selectedFolderId,
  selectedStatus,
  selectedTag,
  stats,
  tags,
  onSelectFolder,
  onSelectStatus,
  onSelectTag,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onEmptyTrash,
  className = '',
}: NoteSidebarProps) {
  const isAllNotes =
    selectedStatus === 'active' && selectedFolderId === null && selectedTag === null;
  const isUnfiled =
    selectedStatus === 'active' && selectedFolderId === 'unfiled' && selectedTag === null;
  const isArchived = selectedStatus === 'archived';
  const isTrashed = selectedStatus === 'trashed';

  return (
    <aside
      className={`w-64 shrink-0 flex flex-col justify-between border-r border-line bg-surface-2/30 p-3 h-full overflow-y-auto ${className}`}
      data-testid="notes-sidebar"
    >
      <div className="flex flex-col gap-5">
        {/* 系统基础视图 */}
        <div className="flex flex-col gap-1">
          <div className="px-2 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase">
            便签概览
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectStatus('active');
              onSelectFolder(null);
              onSelectTag(null);
            }}
            className={`flex items-center justify-between px-2.5 py-2 rounded-control text-xs font-medium transition-all cursor-pointer ${
              isAllNotes
                ? 'bg-accent-soft text-accent font-bold border border-accent/20 shadow-2xs'
                : 'text-secondary hover:text-ink hover:bg-surface-2 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-2">
              <IconFileText size={15} />
              <span>全部便签</span>
            </div>
            {stats && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface border border-line/60 text-secondary font-mono">
                {stats.active}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectStatus('active');
              onSelectFolder('unfiled');
              onSelectTag(null);
            }}
            className={`flex items-center justify-between px-2.5 py-2 rounded-control text-xs font-medium transition-all cursor-pointer ${
              isUnfiled
                ? 'bg-accent-soft text-accent font-bold border border-accent/20 shadow-2xs'
                : 'text-secondary hover:text-ink hover:bg-surface-2 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">📄</span>
              <span>未分类</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectStatus('archived');
              onSelectFolder(null);
              onSelectTag(null);
            }}
            className={`flex items-center justify-between px-2.5 py-2 rounded-control text-xs font-medium transition-all cursor-pointer ${
              isArchived
                ? 'bg-accent-soft text-accent font-bold border border-accent/20 shadow-2xs'
                : 'text-secondary hover:text-ink hover:bg-surface-2 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-2">
              <IconArchive size={15} />
              <span>已归档</span>
            </div>
            {stats && stats.archived > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface border border-line/60 text-secondary font-mono">
                {stats.archived}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectStatus('trashed');
              onSelectFolder(null);
              onSelectTag(null);
            }}
            className={`flex items-center justify-between px-2.5 py-2 rounded-control text-xs font-medium transition-all cursor-pointer ${
              isTrashed
                ? 'bg-critical-soft text-critical font-bold border border-critical/30 shadow-2xs'
                : 'text-secondary hover:text-ink hover:bg-surface-2 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-2">
              <IconTrash size={15} />
              <span>废纸篓</span>
            </div>
            {stats && stats.trashed > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-critical-soft text-critical font-bold border border-critical/30 font-mono">
                {stats.trashed}
              </span>
            )}
          </button>
        </div>

        {/* 文件夹目录树 */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase">
            <span>文件夹</span>
            <button
              type="button"
              onClick={() => onCreateFolder(null)}
              className="p-1 rounded-control hover:bg-surface text-muted hover:text-accent transition-colors cursor-pointer shadow-2xs"
              title="新建根文件夹"
            >
              <IconPlus size={13} />
            </button>
          </div>

          {folders.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-muted/80 bg-surface/50 rounded-panel border border-dashed border-line">
              暂无文件夹
              <button
                type="button"
                onClick={() => onCreateFolder(null)}
                className="block mx-auto mt-1.5 text-accent hover:underline text-[11px] font-semibold cursor-pointer"
              >
                + 点击新建
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {folders.map((node) => (
                <FolderTreeItem
                  key={node.id}
                  node={node}
                  selectedFolderId={selectedFolderId}
                  selectedStatus={selectedStatus}
                  selectedTag={selectedTag}
                  level={0}
                  onSelectFolder={onSelectFolder}
                  onCreateSubfolder={(pId) => onCreateFolder(pId)}
                  onEditFolder={onEditFolder}
                  onDeleteFolder={onDeleteFolder}
                />
              ))}
            </div>
          )}
        </div>

        {/* 标签聚合列表 */}
        {tags && tags.tags.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase">
              <span>标签</span>
              <span className="text-[10px] text-muted font-mono">{tags.tags.length}</span>
            </div>

            <div className="flex flex-wrap gap-1 px-1">
              {tags.tags.map((tag) => {
                const isTagActive = selectedTag === tag.name;
                return (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() => {
                      if (isTagActive) {
                        onSelectTag(null);
                      } else {
                        onSelectTag(tag.name);
                      }
                    }}
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full transition-all border cursor-pointer ${
                      isTagActive
                        ? 'bg-accent text-white border-accent shadow-2xs font-semibold'
                        : 'bg-surface text-secondary hover:text-ink hover:bg-surface-2 border-line'
                    }`}
                  >
                    <span>#{tag.name}</span>
                    <span className="text-[9px] opacity-80 font-mono">({tag.count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 底部统计与废纸篓清理 */}
      {isTrashed && stats && stats.trashed > 0 && onEmptyTrash && (
        <div className="pt-3 mt-4 border-t border-line">
          <button
            type="button"
            onClick={onEmptyTrash}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs text-critical hover:bg-critical/20 bg-critical-soft rounded-control border border-critical/30 transition-all font-semibold cursor-pointer shadow-2xs"
          >
            <IconTrash size={13} />
            <span>清空废纸篓 ({stats.trashed})</span>
          </button>
        </div>
      )}
    </aside>
  );
}
