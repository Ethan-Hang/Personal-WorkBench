import { PageHeader, Panel, Chip, IconSparkles } from '@workbench/ui';

export function AboutPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="系统信息"
        title="关于个人工作台"
        subtitle="一个专为长期使用设计的本地优先、全栈模块化个人工作台"
      />

      {/* 核心理念卡片 */}
      <section className="relative overflow-hidden rounded-panel border border-accent/30 bg-gradient-to-br from-accent-soft/80 via-surface to-surface p-6 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wider">
          <IconSparkles size={16} />
          <span>核心使命</span>
        </div>
        <h2 className="mt-2 text-xl font-extrabold text-ink tracking-tight sm:text-2xl">
          把计划变成真实行动，让模块扩展永不塌房
        </h2>
        <p className="mt-2 text-xs text-secondary leading-relaxed max-w-2xl">
          本项目首要目标不是实现某几个固定功能，而是：
          <strong className="text-ink">让第 10 个模块的加入成本，与第 2 个模块完全相同。</strong>
          从今日执行舱到领域模块，全链路本地运行，零云端依赖，数据完全掌握在自己手中。
        </p>
      </section>

      {/* 三条架构铁律 */}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-bold text-ink">三条架构铁律</h3>
          <p className="text-xs text-secondary">确保项目长期演进不腐化的物理约束</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
          <Panel
            title="铁律 1 · 零依赖"
            action={<Chip tone="accent">ESLint 强制</Chip>}
            className="hover-lift"
          >
            <p className="text-secondary leading-relaxed">
              模块只能依赖 <code>core</code>，模块之间零依赖。任何跨模块直接 import 会被 CI
              物理拦截。
            </p>
          </Panel>

          <Panel
            title="铁律 2 · core 纯净"
            action={<Chip tone="good">OCP 原则</Chip>}
            className="hover-lift"
          >
            <p className="text-secondary leading-relaxed">
              <code>core</code> 永不感知业务模块。加十个全新领域模块，core 一行不改。
            </p>
          </Panel>

          <Panel
            title="铁律 3 · 自带迁移"
            action={<Chip tone="warning">物理隔离</Chip>}
            className="hover-lift"
          >
            <p className="text-secondary leading-relaxed">
              模块自带迁移与注册项。卸载模块 = 删一个目录 + 删一行注册，零残留。
            </p>
          </Panel>
        </div>
      </section>

      {/* 技术栈一览 */}
      <Panel title="现代全栈主流选型" hint="成熟生态 · 零黑盒">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
          <div className="rounded-control bg-surface-2/60 p-3">
            <div className="font-bold text-ink">前端框架</div>
            <div className="text-muted mt-0.5">React 19 + Vite 6</div>
          </div>
          <div className="rounded-control bg-surface-2/60 p-3">
            <div className="font-bold text-ink">样式系统</div>
            <div className="text-muted mt-0.5">Tailwind CSS v4</div>
          </div>
          <div className="rounded-control bg-surface-2/60 p-3">
            <div className="font-bold text-ink">服务端</div>
            <div className="text-muted mt-0.5">Fastify (Node LTS)</div>
          </div>
          <div className="rounded-control bg-surface-2/60 p-3">
            <div className="font-bold text-ink">本地数据库</div>
            <div className="text-muted mt-0.5">SQLite + Drizzle ORM</div>
          </div>
        </div>
      </Panel>

      {/* 快捷键 */}
      <Panel title="操作指南与快捷键" hint="高效交互">
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1.5 border-b border-line">
            <span className="text-secondary">全局呼出快捷搜索</span>
            <kbd className="rounded border border-line bg-surface-2 px-2 py-0.5 font-bold text-ink">
              ⌘K / Ctrl+K
            </kbd>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-line">
            <span className="text-secondary">快速收集箱提交任务</span>
            <kbd className="rounded border border-line bg-surface-2 px-2 py-0.5 font-bold text-ink">
              Enter
            </kbd>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-secondary">切换侧边栏展开/收起</span>
            <span className="text-muted">点击侧栏顶部折叠按钮</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
