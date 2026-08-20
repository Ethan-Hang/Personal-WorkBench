import { describe, expect, it } from 'vitest';
import { resolveAvatarUrl } from './Avatar.js';

describe('resolveAvatarUrl', () => {
  it('当 account 为空时返回 null', () => {
    expect(resolveAvatarUrl(null)).toBeNull();
    expect(resolveAvatarUrl(undefined)).toBeNull();
  });

  it('优先使用用户自定义的 avatar', () => {
    const url = resolveAvatarUrl({
      displayName: '测试用户',
      avatar: 'data:image/png;base64,custom',
      kind: 'github',
      github: { login: 'octocat', userId: 12345, avatarUrl: 'https://github.com/avatar.png' },
    });
    expect(url).toBe('data:image/png;base64,custom');
  });

  it('未设置自定义 avatar 时，如果绑定了 GitHub，优先使用 github.avatarUrl', () => {
    const url = resolveAvatarUrl({
      displayName: 'GitHub 用户',
      kind: 'github',
      github: {
        login: 'octocat',
        userId: 12345,
        avatarUrl: 'https://avatars.githubusercontent.com/u/12345?v=4',
      },
    });
    expect(url).toBe('https://avatars.githubusercontent.com/u/12345?v=4');
  });

  it('未设置自定义 avatar 且 github 无 avatarUrl 时，根据 userId 派生 GitHub 头像', () => {
    const url = resolveAvatarUrl({
      displayName: 'GitHub 用户',
      kind: 'github',
      github: { login: 'octocat', userId: 12345 },
    });
    expect(url).toBe('https://avatars.githubusercontent.com/u/12345?v=4');
  });

  it('未设置自定义 avatar 且 github 仅有 login 时，根据 login 派生 GitHub 头像', () => {
    const url = resolveAvatarUrl({
      displayName: 'GitHub 用户',
      kind: 'github',
      github: { login: 'octocat', userId: 0 },
    });
    expect(url).toBe('https://github.com/octocat.png');
  });

  it('普通本地账号且未设置自定义 avatar 时返回 null（由组件使用默认头像图标）', () => {
    const url = resolveAvatarUrl({
      displayName: '本地账号',
      kind: 'local',
    });
    expect(url).toBeNull();
  });
});
