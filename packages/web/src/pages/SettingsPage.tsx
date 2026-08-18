import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  PageHeader,
  Panel,
  useTheme,
  PALETTES,
  type ThemeMode,
  IconSun,
  IconMoon,
  IconMonitor,
  IconPalette,
  IconDatabase,
  IconCheck,
  IconClock,
} from '@workbench/ui';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { mode, palette, setMode, setPalette } = useTheme();
  const [cacheCleared, setCacheCleared] = useState(false);

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

  function handleClearCache() {
    void queryClient.invalidateQueries();
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 3000);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        eyebrow="系统设置"
        title="偏好与个性化"
        subtitle="调整主题配色、显示模式、工作台交互与本地数据状态"
      />

      {/* 1. 显示模式选择 */}
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
                  <div className="mt-1 text-xs text-muted leading-relaxed">{opt.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. 配色方案选择 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-ink">主题配色方案</h2>
            <p className="text-xs text-secondary">内置 5 套精细调配的色彩系统，秒级即时切换</p>
          </div>
          <IconPalette size={18} className="text-muted" />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* 3. 本地数据与系统状态 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-ink">本地数据与存储</h2>
          <p className="text-xs text-secondary">
            个人工作台采用本地优先架构，数据持久化于本地 SQLite
          </p>
        </div>

        <Panel>
          <div className="space-y-4 text-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-3.5">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-good-soft text-good">
                  <IconDatabase size={18} />
                </div>
                <div>
                  <div className="font-bold text-ink">SQLite 数据库状态</div>
                  <div className="text-muted mt-0.5">本地数据文件路径：data/local/workbench.db</div>
                </div>
              </div>
              <Chip tone="good">正常运行 · 零延迟</Chip>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-3.5">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <IconClock size={18} />
                </div>
                <div>
                  <div className="font-bold text-ink">查询与前端缓存</div>
                  <div className="text-muted mt-0.5">TanStack Query 本地响应与自动失效更新</div>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearCache}>
                {cacheCleared ? '✓ 已刷新缓存' : '强制刷新缓存'}
              </Button>
            </div>

            <div className="pt-1 text-muted leading-relaxed">
              <strong>本地优先承诺</strong>：所有待办事项、日历排程与秋招投递数据均存储在本地 SQLite
              数据库中。 删除模块仅清理模块扩展表与数据，核心任务安全无虞。
            </div>
          </div>
        </Panel>
      </section>

      {/* 4. 架构原则 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-ink">系统架构设计</h2>
          <p className="text-xs text-secondary">让第 10 个模块的加入成本，与第 2 个模块相同</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-panel border border-line bg-surface p-4">
            <span className="font-bold text-accent">铁律 1 · 零依赖</span>
            <p className="mt-1 text-muted leading-relaxed">
              模块只能依赖 core，模块之间零依赖。由 ESLint import 规则物理强制。
            </p>
          </div>
          <div className="rounded-panel border border-line bg-surface p-4">
            <span className="font-bold text-good">铁律 2 · core 纯净</span>
            <p className="mt-1 text-muted leading-relaxed">
              core 永不感知业务模块。加十个模块，core 一行不改。
            </p>
          </div>
          <div className="rounded-panel border border-line bg-surface p-4">
            <span className="font-bold text-goal">铁律 3 · 自带迁移</span>
            <p className="mt-1 text-muted leading-relaxed">
              模块自带迁移与注册项。删模块 = 删一个目录 + 删一行注册。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
