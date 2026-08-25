import { NavLink, Route, Routes, Navigate, useLocation, useNavigate } from 'react-router';
import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ModuleLabelProvider,
  SettingsProvider,
  ThemeProvider,
  TimezoneProvider,
  PreferencesProvider,
  usePreferences,
  SlotProvider,
  type SlotMap,
  type SlotEntry,
  AppShell,
  useTheme,
  PALETTES,
  IconSun,
  IconMoon,
  IconMonitor,
  IconPalette,
  IconSettings,
  IconInfo,
  IconHome,
  IconCalendar,
  IconBriefcase,
  IconBarChart,
  IconCheckSquare,
  IconFlame,
  IconFileText,
  IconBookOpen,
  type ShellNavGroup,
  type CommandItemDescriptor,
} from '@workbench/ui';
import { uiModules } from './modules.js';
import {
  applyModuleOrder,
  enabledModules,
  isModuleDisabled,
  CORE_MODULE_IDS,
} from './moduleLayout.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { AboutPage } from './pages/AboutPage.js';
import { createHttpSettingsStore } from './settingsStore.js';
import { RestoreOverlay } from './sync/RestoreOverlay.js';
import { SidebarBackupStatus } from './sync/SidebarBackupStatus.js';
import { fetchToday, fetchUnscheduled, WORKBENCH_SLOTS } from '@workbench/module-workbench/ui';
import { TodayHabitCard, TodayCheckinMetric } from '@workbench/module-habit/ui';
import { fetchApplications } from '@workbench/module-campus-recruit/ui';
import type { WorkbenchItem } from '@workbench/module-workbench/contract';
import type { ApplicationView } from '@workbench/module-campus-recruit/contract';

// 模块作用域建一次即可：store 无状态，重建会白白丢掉内部引用。
const settingsStore = createHttpSettingsStore();

/**
 * 跨模块界面装配表：谁的界面出现在谁的页面上，只在这里决定。
 *
 * 组合根是**唯一**能同时 import 两个模块的地方（spec §4.2 铁律 1），
 * 所以工作台想在今日页上摆习惯打卡，走的不是 `import`，而是工作台声明插槽、
 * 习惯导出组件、这里把两者接上。模块之间因此仍然互不认识。
 *
 * 每条贡献都记着 `moduleId`：关掉一个模块要连它贡献到别处的界面一起撤掉，
 * 否则关掉习惯之后，今日页上那张打卡卡片还在——那才是真正会被当成 bug 报的形态。
 *
 * 模块作用域建一次即可：元素是不可变的，重建只会让消费方每帧收到新引用。
 */
const SLOT_CONTRIBUTIONS: ReadonlyArray<{
  moduleId: string;
  slot: string;
  entry: SlotEntry;
}> = [
  {
    moduleId: 'habit',
    slot: WORKBENCH_SLOTS.todayMetrics,
    entry: { id: 'habit-checkin', node: <TodayCheckinMetric /> },
  },
  {
    moduleId: 'habit',
    slot: WORKBENCH_SLOTS.todayAside,
    entry: { id: 'habit-today', node: <TodayHabitCard /> },
  },
  {
    moduleId: 'habit',
    slot: WORKBENCH_SLOTS.calendarAside,
    entry: { id: 'habit-today', node: <TodayHabitCard variant="calendar" /> },
  },
];

function buildSlots(disabledModules: readonly string[]): SlotMap {
  const out: Record<string, SlotEntry[]> = {};
  for (const c of SLOT_CONTRIBUTIONS) {
    if (isModuleDisabled(c.moduleId, disabledModules)) continue;
    (out[c.slot] ??= []).push(c.entry);
  }
  return out;
}

/**
 * 模块 id → 展示名，由注册表直接得出。
 */
const MODULE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  uiModules.map((m) => [m.id, m.title]),
);

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, setMode, setPalette } = useTheme();
  const { preferences } = usePreferences();

  // 关掉的模块从这里就消失，下面的导航、路由与命令面板因此只可能看到开着的那些。
  // 核心模块由 isModuleDisabled 兜住，永远关不掉（见 moduleLayout.ts）。
  const activeModules = enabledModules(uiModules, preferences.disabledModules);
  const navEntries = activeModules.flatMap((m) => m.nav);
  const firstPath = navEntries[0]?.path;

  // 查询工作台今日与待排程事项
  const todayQuery = useQuery({
    queryKey: ['workbench', 'today'],
    queryFn: fetchToday,
  });

  const unscheduledQuery = useQuery({
    queryKey: ['workbench', 'unscheduled'],
    queryFn: fetchUnscheduled,
  });

  // 查询招聘投递与轮次详情。**刻意不传 seasonId：命令面板要跨季搜索**——
  // 只搜当前季的话，换季时搜不到别的季的公司，那是退步
  const campusQuery = useQuery({
    queryKey: ['campus', 'applications', null],
    queryFn: () => fetchApplications(),
  });

  // 将注册的 UI 模块组织为侧边栏导航分组。
  // 「专业模块」按偏好里的顺序排；注册表仍是真相，顺序只是一份提示（见 moduleOrder.ts）。
  const navGroups: ShellNavGroup[] = [
    {
      label: '核心工作',
      items: activeModules
        .filter((m) => CORE_MODULE_IDS.has(m.id))
        .flatMap((m) => m.nav)
        .map((n) => ({ path: n.path, label: n.label })),
    },
    {
      label: '专业模块',
      items: applyModuleOrder(
        activeModules.filter((m) => !CORE_MODULE_IDS.has(m.id)),
        preferences.moduleOrder,
      )
        .flatMap((m) => m.nav)
        .map((n) => ({ path: n.path, label: n.label })),
    },
  ].filter((g) => g.items.length > 0);

  // 聚合生成全局搜索与命令项 (Command Palette)
  const commandItems = useMemo<CommandItemDescriptor[]>(() => {
    const items: CommandItemDescriptor[] = [];

    // 1. 快捷命令：外观与主题
    items.push({
      id: 'cmd-theme-toggle',
      category: 'command',
      title: mode === 'dark' ? '切换为浅色模式' : '切换为深色模式',
      subtitle: '外观设置',
      keywords: ['theme', 'dark', 'light', 'mode', 'shese', 'moshi', 'anhei'],
      icon: mode === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />,
      shortcut: '⌘D',
      onSelect: () => setMode(mode === 'dark' ? 'light' : 'dark'),
    });

    items.push({
      id: 'cmd-theme-system',
      category: 'command',
      title: '外观模式：跟随系统',
      subtitle: '外观设置',
      keywords: ['system', 'auto', 'gensui'],
      icon: <IconMonitor size={15} />,
      onSelect: () => setMode('system'),
    });

    // 各色板切换命令
    for (const p of PALETTES) {
      items.push({
        id: `cmd-palette-${p.id}`,
        category: 'command',
        title: `切换主题配色：${p.name}`,
        subtitle: p.description,
        keywords: ['palette', 'color', 'zhuti', 'peise', p.name],
        icon: <IconPalette size={15} />,
        onSelect: () => setPalette(p.id),
      });
    }

    // 2. 页面快速导航
    items.push({
      id: 'nav-settings',
      category: 'navigation',
      title: '偏好设置',
      subtitle: '时区、主题、数据同步与多账号',
      keywords: ['settings', 'preferences', 'shezhi', 'zhanghao'],
      icon: <IconSettings size={15} />,
      shortcut: '⌘,',
      onSelect: () => navigate('/settings'),
    });

    items.push({
      id: 'nav-about',
      category: 'navigation',
      title: '关于工作台',
      subtitle: '本地优先架构与版本信息',
      keywords: ['about', 'version', 'guanyu'],
      icon: <IconInfo size={15} />,
      onSelect: () => navigate('/about'),
    });

    // 动态挂载各模块的导航
    for (const mod of activeModules) {
      for (const nav of mod.nav) {
        let icon: ReactNode = <IconBriefcase size={15} />;
        if (nav.path === '/today' || nav.path === '/') icon = <IconHome size={15} />;
        else if (nav.path === '/calendar') icon = <IconCalendar size={15} />;
        else if (nav.path === '/campus/stats') icon = <IconBarChart size={15} />;
        else if (nav.path === '/habits') icon = <IconFlame size={15} />;
        else if (nav.path === '/notes') icon = <IconFileText size={15} />;
        else if (nav.path === '/research') icon = <IconBookOpen size={15} />;

        items.push({
          id: `nav-mod-${mod.id}-${nav.path}`,
          category: 'navigation',
          title: nav.label,
          subtitle: `${mod.title} · 页面直达`,
          keywords: [nav.label, mod.title, mod.id, nav.path],
          icon,
          onSelect: () => navigate(nav.path),
        });
      }
    }

    // 3. 待办与日程事项 (Workbench / Core Items)
    const rawWorkbenchItems: WorkbenchItem[] = [
      ...(todayQuery.data?.scheduled ?? []),
      ...(todayQuery.data?.overdue ?? []),
      ...(todayQuery.data?.completed ?? []),
      ...(unscheduledQuery.data?.items ?? []),
    ];

    const seenItemIds = new Set<string>();
    for (const item of rawWorkbenchItems) {
      if (seenItemIds.has(item.id)) continue;
      seenItemIds.add(item.id);

      const badges: string[] = [];
      badges.push(
        item.sourceModule === 'todo'
          ? '待办'
          : item.sourceModule === 'campus-recruit'
            ? '秋招事项'
            : item.sourceModule,
      );

      if (item.importance === 'high') badges.push('高优');
      if (item.status === 'done') badges.push('已完成');
      else if (item.urgency === 'overdue') badges.push('逾期');

      // 提取副标题时间与说明信息
      let timeDesc = '';
      if (item.scheduled?.kind === 'all-day') {
        timeDesc = `排程: ${item.scheduled.date}`;
      } else if (item.scheduled?.kind === 'timed') {
        timeDesc = `排程: ${item.scheduled.start.slice(11, 16)}`;
      } else if (item.dueAt) {
        timeDesc = `截止: ${item.dueAt.slice(0, 10)}`;
      }

      const subtitleParts = [
        item.status === 'done' ? '[已完成]' : item.urgency === 'overdue' ? '[逾期]' : '[待办]',
        timeDesc,
        item.notes,
      ].filter(Boolean);

      items.push({
        id: `item-${item.id}`,
        category: 'item',
        title: item.title,
        subtitle: subtitleParts.join(' · '),
        keywords: [
          item.title,
          item.notes ?? '',
          item.sourceModule,
          item.status,
          item.importance,
          'daiban',
          'task',
          'todo',
          'richeng',
          'shixiang',
        ],
        badges,
        icon: <IconCheckSquare size={15} />,
        onSelect: () => {
          if (item.sourceModule === 'campus-recruit') {
            navigate('/campus');
          } else {
            navigate('/today');
          }
        },
      });
    }

    // 4. 招聘投递与各轮次详情 (Campus Recruit Applications & Rounds)
    //    命令面板跨季搜索，所以每条结果都要标出它属于哪一季——
    //    否则搜到一条别的季的投递时，人不知道自己在看什么
    // 关掉招聘管理时连它的搜索结果一起撤掉：⌘K 里还能搜到并跳进一个没有路由的页面，
    // 比留着导航更让人困惑
    const applications: ApplicationView[] = isModuleDisabled(
      'campus-recruit',
      preferences.disabledModules,
    )
      ? []
      : (campusQuery.data?.applications ?? []);
    for (const app of applications) {
      // 4.1 投递主条目 (公司 + 岗位)
      const appBadges = [app.seasonName, `${app.priority}级`, app.status.label];
      const appSubtitleParts = [
        app.seasonName,
        app.status.label,
        app.salary ? `薪资: ${app.salary}` : null,
        app.city ? `城市: ${app.city}` : null,
        app.channel ? `渠道: ${app.channel}` : null,
        app.notes ? `备注: ${app.notes}` : null,
      ].filter(Boolean);

      items.push({
        id: `campus-app-${app.id}`,
        category: 'domain',
        title: `${app.company} · ${app.position}`,
        subtitle: appSubtitleParts.join(' · '),
        keywords: [
          app.company,
          app.position,
          app.city ?? '',
          app.industry ?? '',
          app.channel ?? '',
          app.referral ?? '',
          app.notes ?? '',
          app.salary ?? '',
          app.companyType ?? '',
          app.seasonName,
          'qiuzhao',
          'gangwei',
          'toudi',
          'campus',
          'gongsi',
        ],
        badges: appBadges,
        icon: <IconBriefcase size={15} />,
        onSelect: () => navigate(`/campus?id=${encodeURIComponent(app.id)}`),
      });

      // 4.2 投递下的各轮次详情 (技术面、HR面、笔试、测评等)
      for (const round of app.rounds) {
        const outcomeBadge =
          round.outcome === 'passed' ? '已通过' : round.outcome === 'failed' ? '未通过' : '待进行';

        const roundSubtitleParts = [
          `${app.company} · 轮次 #${round.sequence}`,
          round.format ? `形式: ${round.format}` : null,
          round.scheduledAt ? `时间: ${round.scheduledAt.replace('T', ' ').slice(0, 16)}` : null,
          round.notes ? `备注: ${round.notes}` : null,
        ].filter(Boolean);

        items.push({
          id: `campus-round-${round.id}`,
          category: 'domain',
          title: `${app.company} - ${round.name}`,
          subtitle: roundSubtitleParts.join(' · '),
          keywords: [
            app.company,
            app.position,
            round.name,
            round.kind,
            round.format ?? '',
            round.notes ?? '',
            'mianshi',
            'bishi',
            'lunci',
            'ceping',
          ],
          badges: ['面试轮次', outcomeBadge],
          icon: <IconBriefcase size={15} />,
          onSelect: () => navigate(`/campus?id=${encodeURIComponent(app.id)}`),
        });
      }
    }

    return items;
  }, [
    mode,
    setMode,
    setPalette,
    navigate,
    todayQuery.data,
    unscheduledQuery.data,
    campusQuery.data,
    preferences.disabledModules,
  ]);

  return (
    <AppShell
      navGroups={navGroups}
      activePath={location.pathname}
      LinkComponent={NavLink}
      commandItems={commandItems}
      dbStatus="本地 SQLite 已就绪 · 零延迟"
      sidebarFooter={({ isCollapsed }) => <SidebarBackupStatus isCollapsed={isCollapsed} />}
    >
      <Routes>
        {firstPath !== undefined && (
          <Route path="/" element={<Navigate to={firstPath} replace />} />
        )}
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/about" element={<AboutPage />} />
        {activeModules.flatMap((m) =>
          m.routes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element as ReactNode} />
          )),
        )}
        {/* 关掉的模块留在书签或历史里的 URL 会走到这里。没有这条兜底就是白屏——
            页面既不渲染也不报错，看起来像应用坏了而不是「这个模块关着」。 */}
        {firstPath !== undefined && (
          <Route path="*" element={<Navigate to={firstPath} replace />} />
        )}
      </Routes>
      <RestoreOverlay />
    </AppShell>
  );
}

/**
 * 只为在 PreferencesProvider 内部取到偏好而存在的一层——插槽内容要跟着模块开关走。
 */
function ModuleSlots({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences();
  const slots = useMemo(
    () => buildSlots(preferences.disabledModules),
    [preferences.disabledModules],
  );
  return <SlotProvider slots={slots}>{children}</SlotProvider>;
}

export function App() {
  return (
    <SettingsProvider store={settingsStore}>
      <ThemeProvider>
        <TimezoneProvider>
          <PreferencesProvider>
            <ModuleLabelProvider labels={MODULE_LABELS}>
              <ModuleSlots>
                <AppContent />
              </ModuleSlots>
            </ModuleLabelProvider>
          </PreferencesProvider>
        </TimezoneProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}
