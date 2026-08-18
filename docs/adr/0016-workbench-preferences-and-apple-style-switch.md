# ADR-0016: Workbench Preferences Persistence and Apple-Style Capsule Switch Control

## Status

Accepted

## Context

个人工作台（Personal WorkBench）需要支持用户对系统行为与交互习惯的个性化定制（如时段问候语、逾期任务展开策略、动画过渡开关、已完成任务视图呈现等）。
此前存在以下问题：

1. **偏好仅局部存储且无法生效**：设置页中的偏好项仅作为组件内部临时的 `useState`，未持久化到本地存储，离开设置页或刷新后配置重置，且业务页面（如今日执行舱）无法读取；
2. **缺乏全局偏好基础设施**：未建立与 `ThemeContext`、`TimezoneContext` 同级的偏好管理上下文；
3. **控件交互简陋且易受 Layout 抖动影响**：原偏好切换使用原生单选/复选勾选框，缺乏视觉质感与微交互反馈；且在高频连续点击时，包含 `width` 过渡的动画会触发浏览器 Layout Reflow（重排），导致位移动画在连续触发时被打断或吞帧。

## Decision

我们决定在 `@workbench/ui` 建立统一的工作台偏好体系与高性能胶囊开关控件：

### 1. 全局偏好上下文架构（`PreferencesContext`）

- 定义标准 `WorkbenchPreferences` 契约：
  - `showGreeting`（`boolean`，默认 `true`）：今日执行舱顶部个性化时段问候语展示；
  - `autoExpandOverdue`（`boolean`，默认 `false`）：进入今日工作台时逾期列表默认展开状态；
  - `enableAnimations`（`boolean`，默认 `true`）：全局界面动效、数字缓动与微悬浮开关；
  - `showCompletedTasks`（`boolean`，默认 `true`）：待办列表底部已完成事项折叠分组呈现；
- **自动持久化**：与 `localStorage` 同步（Key: `workbench_preferences`），在首屏 HTML 加载脚本中预解析，防止首屏样式与动效闪烁；
- **高频原子级更新**：提供 `togglePreference(key)` 与支持 `(prev) => next` 函数式更新的 `setPreference`，消除高频连击时的闭包陈旧状态问题；
- **无障碍动效联动**：当 `enableAnimations` 为 `false` 时，在根节点挂载 `data-reduced-motion="true"`，全局将动效与过渡耗时归零。

### 2. 苹果风格胶囊切换开关（Apple-Style Capsule `Switch`）

- **几何与视觉质感**：采用标准 iOS / macOS 胶囊跑道药丸设计（`rounded-full`），具有细腻的阴影与内凹轨道质感；
- **纯 GPU 硬件加速位移**：滑块位移使用 `transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]` 搭配 `will-change-transform` 与 `transform-gpu`，彻底消除 `width` 导致的 Layout Reflow，在任意高频极速连击下均能平滑换向与过渡；
- **悬停与微交互**：滑块在悬停时提供 `scale-105` 微放大与轨道亮度增益，微按压时具备 `scale-95` 弹性手感；
- **Reduced-Motion 智能豁免**：在全局禁用动效模式下，专门为 `[role="switch"]` 保留轻量平滑的位移反馈，避免机械式物理控件失去基本视觉响应；
- **A11y 支持**：完整兼容 `role="switch"`、`aria-checked`、`aria-label` 与键盘空格/回车操作。

## Consequences

- **Positive**:
  - 用户可在设置页随心定制工作台行为偏好，设置即时保存、全站即时响应并跨会话持久化；
  - Switch 组件提供了与 macOS/iOS 原生体验对标的平滑弹性动效与精致质感；
  - 高频连续快速点击下 100% 保持流畅，无跳帧、无动画中断；
  - 架构清晰正交，未来扩充第 5、第 6 项工作台偏好时只需扩展 interface 契约。
- **Negative**:
  - 业务页面需要通过 `usePreferences()` 消费配置，但接口极为精简，零额外学习成本。
