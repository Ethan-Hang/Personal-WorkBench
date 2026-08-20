import { useState, type ReactNode } from 'react';
import { IconCamera, IconGithub, IconUser } from './icons.js';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'hero';

export interface AvatarAccountInfo {
  displayName?: string;
  avatar?: string | null;
  kind?: 'local' | 'github';
  github?: {
    login?: string;
    userId?: number;
    avatarUrl?: string;
  } | null;
}

export interface AvatarProps {
  /** 账户信息对象（自动派生头像与回退） */
  account?: AvatarAccountInfo | null;
  /** 直接传入头像图片地址（优先级最高） */
  src?: string | null;
  /** 账号类型 */
  kind?: 'local' | 'github';
  /** GitHub 绑定信息 */
  github?: {
    login?: string;
    userId?: number;
    avatarUrl?: string;
  } | null;
  /** 账号显示名称（用于图片加载失败时的首字母备用或 alt 属性） */
  name?: string;
  /** 尺寸规格 */
  size?: AvatarSize;
  /** 是否展示在线/活跃状态绿点 */
  showStatus?: boolean;
  /** 是否处于可编辑模式（悬停显示相机遮罩） */
  editable?: boolean;
  /** 点击编辑回调 */
  onEdit?: () => void;
  /** 点击回调 */
  onClick?: () => void;
  /** 附加 className */
  className?: string;
  /** 子元素或自定义叠加内容 */
  children?: ReactNode;
}

const SIZE_MAP: Record<
  AvatarSize,
  { container: string; icon: number; status: string; editIcon: number }
> = {
  xs: { container: 'size-6 text-[10px]', icon: 13, status: 'size-2', editIcon: 10 },
  sm: { container: 'size-8 text-xs', icon: 16, status: 'size-2.5', editIcon: 12 },
  md: { container: 'size-10 text-sm', icon: 20, status: 'size-3', editIcon: 14 },
  lg: { container: 'size-12 text-base', icon: 24, status: 'size-3.5', editIcon: 16 },
  xl: { container: 'size-14 text-lg', icon: 28, status: 'size-3.5', editIcon: 18 },
  '2xl': { container: 'size-16 text-xl', icon: 32, status: 'size-4', editIcon: 20 },
  hero: { container: 'size-20 text-2xl', icon: 40, status: 'size-5', editIcon: 24 },
};

/**
 * 依据账号信息解析出最合适的头像图片 URL。
 * 优先级：用户自定义 avatar > GitHub avatar > null（使用系统默认图标）
 */
export function resolveAvatarUrl(info?: AvatarAccountInfo | null): string | null {
  if (!info) return null;
  if (info.avatar && info.avatar.trim().length > 0) {
    return info.avatar.trim();
  }
  if (info.kind === 'github' || info.github) {
    if (info.github?.avatarUrl && info.github.avatarUrl.trim().length > 0) {
      return info.github.avatarUrl.trim();
    }
    if (info.github?.userId && info.github.userId > 0) {
      return `https://avatars.githubusercontent.com/u/${info.github.userId}?v=4`;
    }
    if (info.github?.login && info.github.login.trim().length > 0) {
      return `https://github.com/${encodeURIComponent(info.github.login.trim())}.png`;
    }
  }
  return null;
}

export function Avatar({
  account,
  src,
  kind: propKind,
  github: propGithub,
  name: propName,
  size = 'md',
  showStatus = false,
  editable = false,
  onEdit,
  onClick,
  className = '',
  children,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const kind = propKind ?? account?.kind ?? (account?.github ? 'github' : 'local');
  const github = propGithub ?? account?.github;
  const name = propName ?? account?.displayName ?? (github ? github.login : 'User');

  // 计算图片源
  const resolvedSrc =
    src !== undefined
      ? src && src.trim().length > 0
        ? src.trim()
        : null
      : resolveAvatarUrl(account);

  const sizeCfg = SIZE_MAP[size] ?? SIZE_MAP.md;
  const isGithubKind = kind === 'github';

  const isClickable = Boolean(onClick || onEdit);
  const handleClick = onEdit || onClick;

  return (
    <div
      className={`relative inline-flex shrink-0 select-none items-center justify-center rounded-full transition-all ${
        sizeCfg.container
      } ${
        resolvedSrc && !imageError
          ? 'border border-line/60 bg-surface shadow-2xs'
          : isGithubKind
            ? 'border-2 border-ink/20 bg-ink text-surface shadow-xs'
            : 'border-2 border-accent/30 bg-accent-soft text-accent shadow-xs'
      } ${isClickable ? 'cursor-pointer group hover:opacity-95' : ''} ${className}`}
      onClick={isClickable ? handleClick : undefined}
      title={isClickable && editable ? '点击更换头像' : name}
    >
      {resolvedSrc && !imageError ? (
        <img
          src={resolvedSrc}
          alt={name}
          onError={() => setImageError(true)}
          className="size-full rounded-full object-cover"
        />
      ) : isGithubKind ? (
        <IconGithub size={sizeCfg.icon} />
      ) : (
        <IconUser size={sizeCfg.icon} />
      )}

      {/* 悬停编辑遮罩层 */}
      {editable && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          aria-label="更换头像"
        >
          <IconCamera size={sizeCfg.editIcon} />
        </div>
      )}

      {/* 在线/活跃状态绿点 */}
      {showStatus && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-surface bg-good ${sizeCfg.status}`}
          title="活跃"
        />
      )}

      {children}
    </div>
  );
}
