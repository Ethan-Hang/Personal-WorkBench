import { useState } from 'react';
import {
  Button,
  Switch,
  Chip,
  PageHeader,
  Panel,
  useTheme,
  usePreferences,
  PALETTES,
  type ThemeMode,
  TimezoneMapSelector,
  IconSun,
  IconMoon,
  IconMonitor,
  IconPalette,
  IconDatabase,
  IconCheck,
  IconClock,
  IconSparkles,
  IconBriefcase,
  IconUser,
  IconCloud,
} from '@workbench/ui';
import { AccountsPanel } from '../accounts/AccountsPanel.js';
import { BackupPanel } from '../sync/BackupPanel.js';
import { LocalBackupPanel } from '../sync/LocalBackupPanel.js';

type SettingsTab = 'appearance' | 'timezone' | 'preferences' | 'accounts' | 'storage' | 'modules';

export function SettingsPage() {
  const { mode, palette, setMode, setPalette } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>('accounts');
  const [storageSubTab, setStorageSubTab] = useState<'local' | 'webdav'>('local');
  const [resetToast, setResetToast] = useState(false);

  // 全局持久化工作台偏好
  const { preferences, togglePreference, resetPreferences } = usePreferences();

  function handleResetPreferences() {
    resetPreferences();
    setResetToast(true);
    setTimeout(() => setResetToast(false), 2500);
  }

  const modeOptions: Array<{
    id: ThemeMode;
    title: string;
    description: string;
    icon: typeof IconSun;
  }> = [
    {
      id: 'light',
      title: '浅色模式',
      description: '明亮通透，适合白天与光线充足环境',
      icon: IconSun,
    },
    {
      id: 'dark',
      title: '深色模式',
      description: '深炭黑与石板灰层次，柔和护眼，专注沉浸',
      icon: IconMoon,
    },
    {
      id: 'system',
      title: '跟随系统',
      description: '自动响应操作系统的深浅色外观偏好',
      icon: IconMonitor,
    },
  ];

  const subNavItems: Array<{
    id: SettingsTab;
    label: string;
    icon: typeof IconUser;
    badge?: string;
  }> = [
    { id: 'accounts', label: '账号管理', icon: IconUser },
    { id: 'appearance', label: '主题与外观', icon: IconPalette },
    { id: 'timezone', label: '时区与时间', icon: IconClock },
    { id: 'preferences', label: '工作台偏好', icon: IconSparkles },
    { id: 'storage', label: '数据与存储', icon: IconDatabase },
    { id: 'modules', label: '已安装模块', icon: IconBriefcase, badge: '2' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="系统设置"
        title="偏好与个性化"
        subtitle="调整主题配色、时区与夏令时、工作台习惯与本地数据引擎"
      />

      {/* 嵌套式设置布局：左侧二级导航栏（靠左对齐） + 右侧设置详情面板 */}
      <div className="flex flex-col md:flex-row gap-6 items-start justify-start">
        {/* 左侧嵌套设置导航栏 */}
        <aside className="w-full md:w-52 shrink-0">
          <div className="rounded-panel border border-line bg-surface p-1.5 shadow-2xs space-y-0.5">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
              偏好分类
            </div>
            {subNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`group relative flex w-full items-center justify-between rounded-control px-3 py-2.5 text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-surface-2 text-ink font-bold shadow-2xs'
                      : 'text-secondary hover:bg-surface-2/60 hover:text-ink'
                  }`}
                >
                  {/* 左侧精致的主题强调指示线，映衬主导航，避免大面积突兀的高饱和色块 */}
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-accent" />
                  )}

                  <div className="flex items-center gap-2.5">
                    <Icon
                      size={16}
                      className={
                        isActive
                          ? 'text-accent'
                          : 'text-muted group-hover:text-secondary transition-colors'
                      }
                    />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        isActive ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* 右侧设置主内容面板 */}
        <main className="flex-1 min-w-0 w-full">
          {activeTab === 'appearance' && (
            <div key="appearance" className="space-y-6 animate-slide-right-in">
              {/* 显示模式 */}
              <section className="space-y-3">
                <div>
                  <h2 className="text-base font-bold text-ink">显示模式</h2>
                  <p className="text-xs text-secondary">选择界面在不同环境下的明暗呈现</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {modeOptions.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = mode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMode(opt.id)}
                        className={`relative flex flex-col items-start rounded-panel border p-4 text-left transition-all hover-lift ${
                          isSelected
                            ? 'border-accent bg-accent-soft/50 shadow-xs ring-2 ring-accent/30'
                            : 'border-line bg-surface hover:border-line hover:bg-surface-2/60'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <div
                            className={`flex size-9 items-center justify-center rounded-xl transition-colors ${
                              isSelected ? 'bg-accent text-white' : 'bg-surface-2 text-secondary'
                            }`}
                          >
                            <Icon size={18} />
                          </div>
                          {isSelected && (
                            <span className="flex size-5 items-center justify-center rounded-full bg-accent text-white">
                              <IconCheck size={13} />
                            </span>
                          )}
                        </div>

                        <div className="mt-3">
                          <div className="text-sm font-bold text-ink">{opt.title}</div>
                          <div className="mt-1 text-xs text-muted leading-relaxed">
                            {opt.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 配色方案 */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-ink">配色方案</h2>
                    <p className="text-xs text-secondary">5 套精细调配的色彩系统，秒级即时切换</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {PALETTES.map((p) => {
                    const isSelected = palette === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPalette(p.id)}
                        className={`relative flex flex-col justify-between rounded-panel border p-4 text-left transition-all hover-lift ${
                          isSelected
                            ? 'border-accent bg-accent-soft/40 shadow-xs ring-2 ring-accent/30'
                            : 'border-line bg-surface hover:border-line hover:bg-surface-2/60'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className="size-4 rounded-full border border-black/10 shadow-xs dark:border-white/20"
                                style={{ backgroundColor: p.primaryColor }}
                              />
                              <span className="text-sm font-bold text-ink">{p.name}</span>
                            </div>
                            {isSelected && (
                              <Chip tone="accent" icon={<IconCheck size={11} />}>
                                当前应用
                              </Chip>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-muted leading-relaxed">{p.description}</p>
                        </div>

                        {/* 调色板预览条 */}
                        <div className="mt-4 flex items-center gap-1.5 rounded-control bg-surface-2 p-1.5 border border-line/40">
                          <div
                            className="h-4 flex-1 rounded"
                            style={{ backgroundColor: p.primaryColor }}
                            title="强调色"
                          />
                          <div
                            className="h-4 flex-1 rounded border border-black/5"
                            style={{ backgroundColor: p.previewBg }}
                            title="背景色"
                          />
                          <div
                            className="h-4 flex-1 rounded border border-black/5"
                            style={{ backgroundColor: p.previewCard }}
                            title="卡片表面色"
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'timezone' && (
            <div key="timezone" className="space-y-6 animate-slide-right-in">
              <div>
                <h2 className="text-base font-bold text-ink">时区与国际时间</h2>
                <p className="text-xs text-secondary">
                  配置工作区生效时区与夏/冬令时计算策略。所有定时排程与日程数据均以 UTC
                  国际标准存储。
                </p>
              </div>

              <TimezoneMapSelector />
            </div>
          )}

          {activeTab === 'preferences' && (
            <div key="preferences" className="space-y-6 animate-slide-right-in">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-ink">工作台行为偏好</h2>
                  <p className="text-xs text-secondary">
                    定制今日执行舱的问候语、逾期折叠、已完成视图与动效体验，设置即时保存生效
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={handleResetPreferences}>
                  {resetToast ? '✓ 已恢复默认偏好' : '恢复默认偏好'}
                </Button>
              </div>

              <Panel>
                <div className="divide-y divide-line text-xs">
                  {/* 时段问候语 */}
                  <div
                    onClick={() => togglePreference('showGreeting')}
                    className="flex items-center justify-between py-3.5 first:pt-0 cursor-pointer hover:bg-surface-2/40 -mx-4 px-4 transition-colors select-none"
                  >
                    <div className="pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink text-[13px]">显示时段问候语</span>
                        {preferences.showGreeting ? (
                          <Chip tone="accent">已启用</Chip>
                        ) : (
                          <Chip tone="neutral">已关闭</Chip>
                        )}
                      </div>
                      <div className="text-muted mt-1 leading-relaxed">
                        在今日执行舱顶部显示「早上好/下午好，今天专注三件事」与排程概况（关闭后展示简洁规范标题）
                      </div>
                    </div>
                    <Switch
                      checked={preferences.showGreeting}
                      onChange={() => togglePreference('showGreeting')}
                      label="显示时段问候语"
                    />
                  </div>

                  {/* 逾期任务默认展开 */}
                  <div
                    onClick={() => togglePreference('autoExpandOverdue')}
                    className="flex items-center justify-between py-3.5 cursor-pointer hover:bg-surface-2/40 -mx-4 px-4 transition-colors select-none"
                  >
                    <div className="pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink text-[13px]">逾期任务默认自动展开</span>
                        {preferences.autoExpandOverdue ? (
                          <Chip tone="warning">默认展开</Chip>
                        ) : (
                          <Chip tone="neutral">默认收起</Chip>
                        )}
                      </div>
                      <div className="text-muted mt-1 leading-relaxed">
                        进入今日工作台时默认直接展开逾期事项警告列表，无需手动点击展开查看
                      </div>
                    </div>
                    <Switch
                      checked={preferences.autoExpandOverdue}
                      onChange={() => togglePreference('autoExpandOverdue')}
                      tone="warning"
                      label="逾期任务默认自动展开"
                    />
                  </div>

                  {/* 界面动效与平滑过渡 */}
                  <div
                    onClick={() => togglePreference('enableAnimations')}
                    className="flex items-center justify-between py-3.5 cursor-pointer hover:bg-surface-2/40 -mx-4 px-4 transition-colors select-none"
                  >
                    <div className="pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink text-[13px]">界面动效与平滑过渡</span>
                        {preferences.enableAnimations ? (
                          <Chip tone="good">已启用</Chip>
                        ) : (
                          <Chip tone="neutral">已关闭</Chip>
                        )}
                      </div>
                      <div className="text-muted mt-1 leading-relaxed">
                        开启组件进入滑行动效、数字缓动与卡片微悬浮提升（关闭可降低渲染开销，提升纯粹速度）
                      </div>
                    </div>
                    <Switch
                      checked={preferences.enableAnimations}
                      onChange={() => togglePreference('enableAnimations')}
                      tone="good"
                      label="界面动效与平滑过渡"
                    />
                  </div>

                  {/* 显示今日已完成事项 */}
                  <div
                    onClick={() => togglePreference('showCompletedTasks')}
                    className="flex items-center justify-between py-3.5 last:pb-0 cursor-pointer hover:bg-surface-2/40 -mx-4 px-4 transition-colors select-none"
                  >
                    <div className="pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink text-[13px]">
                          显示今日已完成任务分组
                        </span>
                        {preferences.showCompletedTasks ? (
                          <Chip tone="good">已展示</Chip>
                        ) : (
                          <Chip tone="neutral">已隐藏</Chip>
                        )}
                      </div>
                      <div className="text-muted mt-1 leading-relaxed">
                        在今日执行舱待办列表底部展示「今日已完成事项」回顾抽屉与达成勾选记录
                      </div>
                    </div>
                    <Switch
                      checked={preferences.showCompletedTasks}
                      onChange={() => togglePreference('showCompletedTasks')}
                      tone="good"
                      label="显示今日已完成任务分组"
                    />
                  </div>
                </div>
              </Panel>
            </div>
          )}

          {activeTab === 'accounts' && (
            <AccountsPanel onNavigateToStorage={() => setActiveTab('storage')} />
          )}

          {activeTab === 'storage' && (
            <div key="storage" className="space-y-6 animate-slide-right-in">
              {/* 存储子分类切换器 */}
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStorageSubTab('local')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-control text-xs font-semibold transition-all ${
                      storageSubTab === 'local'
                        ? 'bg-accent text-white shadow-2xs'
                        : 'bg-surface-2 text-secondary hover:text-ink hover:bg-surface-2/80'
                    }`}
                  >
                    <IconDatabase size={14} />
                    <span>本地数据与快照</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStorageSubTab('webdav')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-control text-xs font-semibold transition-all ${
                      storageSubTab === 'webdav'
                        ? 'bg-accent text-white shadow-2xs'
                        : 'bg-surface-2 text-secondary hover:text-ink hover:bg-surface-2/80'
                    }`}
                  >
                    <IconCloud size={14} />
                    <span>WebDAV 云端备份</span>
                  </button>
                </div>
              </div>

              {storageSubTab === 'local' ? <LocalBackupPanel /> : <BackupPanel />}
            </div>
          )}

          {activeTab === 'modules' && (
            <div key="modules" className="space-y-6 animate-slide-right-in">
              <div>
                <h2 className="text-base font-bold text-ink">已安装业务模块</h2>
                <p className="text-xs text-secondary">遵循模块隔离铁律，每个模块为全栈垂直切片</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <Panel
                  title="待办模块 (todo)"
                  hint="内置核心"
                  action={<Chip tone="accent">核心模块</Chip>}
                >
                  <div className="text-xs space-y-2 text-secondary">
                    <div>
                      <strong>职责</strong>：提供今日执行舱、任务创建、权重排序与完成标记。
                    </div>
                    <div>
                      <strong>路由</strong>：<code>/today</code>
                    </div>
                  </div>
                </Panel>

                <Panel
                  title="秋招管理模块 (campus-recruit)"
                  hint="领域扩展"
                  action={<Chip tone="good">已激活</Chip>}
                >
                  <div className="text-xs space-y-2 text-secondary">
                    <div>
                      <strong>职责</strong>：秋招投递进度追踪、面试轮次记录、转化漏斗分析。
                    </div>
                    <div>
                      <strong>路由</strong>：<code>/campus</code>, <code>/campus/stats</code>
                    </div>
                    <div>
                      <strong>数据表</strong>：<code>campus_recruit_applications</code>,{' '}
                      <code>campus_recruit_events</code>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
