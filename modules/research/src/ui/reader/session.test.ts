import { describe, expect, it } from 'vitest';
import {
  EMPTY_READER_TAB_SESSION,
  activateReaderTab,
  closeReaderTab,
  parseReaderTabSession,
  renameReaderTab,
  sleepIdleReaderTabs,
} from './reader-tabs.js';

describe('reader tab session', () => {
  it('最多保留四个 live 文档并让最旧后台标签休眠', () => {
    let session = EMPTY_READER_TAB_SESSION;
    for (let index = 1; index <= 5; index += 1) {
      session = activateReaderTab(session, `asset-${index}`, index * 1_000);
    }

    expect(session.tabs.filter((tab) => !tab.sleeping)).toHaveLength(4);
    expect(session.tabs.find((tab) => tab.assetId === 'asset-1')?.sleeping).toBe(true);
    expect(session.activeAssetId).toBe('asset-5');
  });

  it('后台满三十秒休眠，重新激活时只唤醒目标标签', () => {
    let session = activateReaderTab(EMPTY_READER_TAB_SESSION, 'asset-a', 0);
    session = activateReaderTab(session, 'asset-b', 1_000);

    expect(sleepIdleReaderTabs(session, 30_999)).toBe(session);
    session = sleepIdleReaderTabs(session, 31_000);
    expect(session.tabs.find((tab) => tab.assetId === 'asset-a')?.sleeping).toBe(true);
    session = activateReaderTab(session, 'asset-a', 40_000);
    expect(session.tabs.find((tab) => tab.assetId === 'asset-a')?.sleeping).toBe(false);
    expect(session.tabs.find((tab) => tab.assetId === 'asset-b')?.backgroundedAt).toBe(40_000);
  });

  it('关闭活动标签后激活相邻标签，关闭最后一个后返回空会话', () => {
    let session = activateReaderTab(EMPTY_READER_TAB_SESSION, 'asset-a', 0);
    session = activateReaderTab(session, 'asset-b', 1);
    session = activateReaderTab(session, 'asset-c', 2);
    session = closeReaderTab(session, 'asset-b', 3);
    expect(session.activeAssetId).toBe('asset-c');
    session = closeReaderTab(session, 'asset-c', 4);
    expect(session.activeAssetId).toBe('asset-a');
    expect(closeReaderTab(session, 'asset-a', 5)).toEqual(EMPTY_READER_TAB_SESSION);
  });

  it('持久化读取丢弃损坏和重复条目，并允许补写标题', () => {
    const session = parseReaderTabSession(
      JSON.stringify({
        activeAssetId: 'asset-a',
        tabs: [
          { assetId: 'asset-a', title: '', sleeping: false, lastActiveAt: 1 },
          { assetId: 'asset-a', title: '重复', sleeping: false, lastActiveAt: 2 },
          { wrong: true },
        ],
      }),
    );
    expect(session.tabs).toHaveLength(1);
    expect(renameReaderTab(session, 'asset-a', '  Paper A  ').tabs[0]?.title).toBe('Paper A');
    expect(parseReaderTabSession('{broken')).toEqual(EMPTY_READER_TAB_SESSION);
  });
});
