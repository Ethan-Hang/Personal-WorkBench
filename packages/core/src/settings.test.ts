import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  isSettingKey,
  parseSettingsPatch,
  resolveSettings,
} from './settings.js';

describe('DEFAULT_SETTINGS', () => {
  it('十五个键齐全，且与现有 localStorage 时代的默认值一致', () => {
    expect(SETTING_KEYS).toHaveLength(15);
    expect(DEFAULT_SETTINGS).toEqual({
      'theme.mode': 'system',
      'theme.palette': 'warm',
      'timezone.id': 'Asia/Shanghai',
      'timezone.dstMode': 'auto',
      'workbench.showGreeting': true,
      'workbench.autoExpandOverdue': false,
      'workbench.enableAnimations': true,
      'workbench.showCompletedTasks': true,
      'workbench.moduleOrder': [],
      'workbench.disabledModules': [],
      'backup.autoEnabled': false,
      'backup.retentionCount': 10,
      'localBackup.targetDir': '',
      'localBackup.autoEnabled': false,
      'localBackup.retentionCount': 5,
    });
  });

  it('自动备份默认关：默认配置下零出站网络请求', () => {
    expect(DEFAULT_SETTINGS['backup.autoEnabled']).toBe(false);
  });
});

describe('本地备份设置', () => {
  it('目标目录默认为空串，表示落在 data/local/backups 而不是某个写死的绝对路径', () => {
    expect(DEFAULT_SETTINGS['localBackup.targetDir']).toBe('');
  });

  it('自动本地快照默认关：磁盘占用不该在用户不知情时增长', () => {
    expect(DEFAULT_SETTINGS['localBackup.autoEnabled']).toBe(false);
  });

  it('目标目录接受任意路径字符串，并去掉首尾空白', () => {
    const resolved = resolveSettings({ 'localBackup.targetDir': '  D:/backups  ' });
    expect(resolved['localBackup.targetDir']).toBe('D:/backups');
  });

  it('目标目录是非字符串时回落默认，不让脏值变成一个写不进去的路径', () => {
    for (const dirty of [null, 42, true, {}]) {
      expect(resolveSettings({ 'localBackup.targetDir': dirty })['localBackup.targetDir']).toBe('');
    }
  });

  it('本地保留份数与 WebDAV 那份各自独立，改一个不动另一个', () => {
    const resolved = resolveSettings({ 'localBackup.retentionCount': 3 });
    expect(resolved['localBackup.retentionCount']).toBe(3);
    expect(resolved['backup.retentionCount']).toBe(10);
  });
});

describe('idList codec（模块顺序）', () => {
  it('默认空数组：没表达过偏好时按注册表原序渲染，且一个模块都没关', () => {
    expect(DEFAULT_SETTINGS['workbench.moduleOrder']).toEqual([]);
    expect(DEFAULT_SETTINGS['workbench.disabledModules']).toEqual([]);
  });

  it('接受字符串数组', () => {
    const s = resolveSettings({ 'workbench.moduleOrder': ['notes', 'habit'] });
    expect(s['workbench.moduleOrder']).toEqual(['notes', 'habit']);
  });

  it('去重——同一个 id 出现两次会让消费方渲染出两个同名条目', () => {
    const s = resolveSettings({ 'workbench.moduleOrder': ['habit', 'notes', 'habit'] });
    expect(s['workbench.moduleOrder']).toEqual(['habit', 'notes']);
  });

  it('非数组、含空串或含非字符串一律回落默认', () => {
    expect(resolveSettings({ 'workbench.moduleOrder': 'habit' })['workbench.moduleOrder']).toEqual(
      [],
    );
    expect(
      resolveSettings({ 'workbench.moduleOrder': ['habit', ''] })['workbench.moduleOrder'],
    ).toEqual([]);
    expect(
      resolveSettings({ 'workbench.moduleOrder': ['habit', 3] })['workbench.moduleOrder'],
    ).toEqual([]);
  });

  it('不校验成员是否还装着——卸载一个模块不该让整条顺序变脏值', () => {
    const s = resolveSettings({ 'workbench.moduleOrder': ['已卸载的模块', 'habit'] });
    expect(s['workbench.moduleOrder']).toEqual(['已卸载的模块', 'habit']);
  });
});

describe('count codec', () => {
  it('接受范围内的整数', () => {
    expect(resolveSettings({ 'backup.retentionCount': 3 })['backup.retentionCount']).toBe(3);
  });

  it('越界、小数与非数字一律回落默认', () => {
    for (const dirty of [0, 101, 2.5, '10', null, Number.NaN]) {
      expect(resolveSettings({ 'backup.retentionCount': dirty })['backup.retentionCount']).toBe(10);
    }
  });

  it('写入路径上越界值直接报错，不静默吞掉', () => {
    const result = parseSettingsPatch({ 'backup.retentionCount': 0 });
    expect(result.ok).toBe(false);
  });
});

describe('resolveSettings', () => {
  it('空库返回全套默认值', () => {
    expect(resolveSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('库里有的键覆盖默认值，没有的补默认', () => {
    const resolved = resolveSettings({ 'theme.mode': 'dark' });
    expect(resolved['theme.mode']).toBe('dark');
    expect(resolved['theme.palette']).toBe('warm');
  });

  it('脏值静默回落默认，不抛', () => {
    const resolved = resolveSettings({
      'theme.mode': 'chartreuse',
      'workbench.showGreeting': 'yes',
      'timezone.id': 42,
    });
    expect(resolved['theme.mode']).toBe('system');
    expect(resolved['workbench.showGreeting']).toBe(true);
    expect(resolved['timezone.id']).toBe('Asia/Shanghai');
  });

  it('未知键被忽略，不出现在结果里', () => {
    const resolved = resolveSettings({ 'theme.nonsense': 'x' });
    expect(Object.keys(resolved).sort()).toEqual([...SETTING_KEYS].sort());
  });

  it('接受任何真实 IANA 时区，不限于 UI 展示列表里的那十几个', () => {
    expect(resolveSettings({ 'timezone.id': 'America/Argentina/Ushuaia' })['timezone.id']).toBe(
      'America/Argentina/Ushuaia',
    );
  });

  it('拒绝不存在的时区 id', () => {
    expect(resolveSettings({ 'timezone.id': 'Mars/Olympus_Mons' })['timezone.id']).toBe(
      'Asia/Shanghai',
    );
  });

  it('null 与 undefined 都回落默认', () => {
    expect(resolveSettings({ 'theme.mode': null })['theme.mode']).toBe('system');
    expect(resolveSettings({ 'theme.mode': undefined })['theme.mode']).toBe('system');
  });
});

describe('isSettingKey', () => {
  it('认识已知键，不认识别的', () => {
    expect(isSettingKey('theme.mode')).toBe(true);
    expect(isSettingKey('theme.nope')).toBe(false);
  });
});

describe('parseSettingsPatch', () => {
  it('全部合法时返回解析后的 patch', () => {
    const result = parseSettingsPatch({ 'theme.mode': 'dark', 'workbench.showGreeting': false });
    expect(result).toEqual({
      ok: true,
      patch: { 'theme.mode': 'dark', 'workbench.showGreeting': false },
    });
  });

  it('未知键直接失败，并在错误里点名', () => {
    const result = parseSettingsPatch({ 'theme.nope': 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('theme.nope');
  });

  it('值不合法直接失败，不静默回落——写入路径与读取路径口径不同', () => {
    const result = parseSettingsPatch({ 'theme.mode': 'chartreuse' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('theme.mode');
  });

  it('空补丁失败', () => {
    expect(parseSettingsPatch({}).ok).toBe(false);
  });

  it('非对象失败', () => {
    expect(parseSettingsPatch(null).ok).toBe(false);
    expect(parseSettingsPatch([]).ok).toBe(false);
    expect(parseSettingsPatch('theme.mode=dark').ok).toBe(false);
    expect(parseSettingsPatch(undefined).ok).toBe(false);
  });
});
