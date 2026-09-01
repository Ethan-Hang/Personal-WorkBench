# 个人工作台 (Personal WorkBench)

本地优先的高性能个人工作台系统。当前已实现日历排程、今日工作台任务生命周期闭环（创建、编辑、排序、完成、取消完成、软删除回收站、彻底销毁）以及全链路平滑动效系统。

## 快速开始

```bash
npm run setup
npm run dev

# 清空并校验 npm 缓存（装依赖报损坏或校验失败时用）
npm run cache:clean
```

打开 http://localhost:5173

> **首次克隆后请跑 `npm run setup`，不要直接跑 `npm install`**——后者在没有 MSVC 工具链的
> 机器上必定失败。原因：`better-sqlite3` 带 `binding.gyp` 且没有 `install` 脚本，npm 会
> 默认触发 `node-gyp rebuild` 去源码编译。而这次编译本就是多余的——该包已自带
> `prebuilds/`（覆盖 win32 / darwin / linux 各架构，N-API 跨 Node 版本通用），运行时直接
> 加载对应平台的 `.node`，编译产物根本没人用。`setup` 用 `--ignore-scripts` 跳过它，
> 再单独把 husky 钩子装回来。
>
> 本项目要求 **Node ≥ 22.22.1**（`react-router` 与 `lint-staged` 的真实下限）。
> `.npmrc` 里的 `engine-strict=true` 会让版本不符在**安装期**就失败，而不是留到运行期。

服务端在 3000 端口，前端 5173 通过 Vite 代理转发 `/api`，浏览器统一走单一同源。

## 常用命令

| 命令                  | 作用                                                          |
| --------------------- | ------------------------------------------------------------- |
| `npm run setup`       | 安装依赖（跳过多余的原生编译）并装回 git 钩子；克隆后先跑这个 |
| `npm run dev`         | 同时启动后端与前端                                            |
| `npm run check`       | 格式 + 类型 + lint + 测试（提交前跑这个，必须全绿）           |
| `npm run test`        | 运行全部 Vitest 自动化测试 (800+ tests)                       |
| `npm run format`      | 使用 Prettier 自动格式化代码                                  |
| `npm run db:generate` | 改完 `packages/data/src/schema.ts` 后生成迁移                 |
| `npm run cache:clean` | 清空并校验 npm 缓存（装依赖报损坏或校验失败时用）             |

## 数据存储

本地 SQLite 数据库保存在 `data/local/accounts/<账号 id>/workbench.db`（已在 `.gitignore` 中），默认账号是 `local-default`。删掉整个 `data/local/` 即可从空库重来。

## 核心交互与体验特性

1. **定制整合型日期选择器 (`DatePicker`)**：
   - 整合输入框与日历 Popper，支持键盘 `YY/MM/DD` 智能掩码直输与日历点击双向同步；
   - 具有失焦合法性校验与即时错误细框提示；
   - 支持智能视口高度感知（底部空间不足时自动向上翻转）与模态弹窗层级提权（`z-[60]`，消除被遮挡问题）。

2. **待办事项全生命周期闭环**：
   - **完成与已完成归集**：完成事项自动进入专属折叠区域，可随时点击一键重新打开；
   - **真实执行度闭环**：今日执行度卡片独立计算 `已完成 / (进行中 + 已完成)` 真实百分比，并由 0 启动缓动插值；
   - **软删除回收站**：复用 `cancelled` 状态（见 `ADR-0009`），支持单项恢复/彻底销毁、多选批量恢复/销毁、全部恢复/清空，并配备撤销 Toast。

3. **高性能 GPU 硬件加速动效体系**：
   - **时序关键帧动效**：待办完成采用纯 CSS `@keyframes taskCompleteGlideOut`（打勾亮起 → `translate3d` 匀速滑出 → 高度坍缩）；
   - **状态隔离**：高频缓动循环封装在 `TodayExecutionCard` 内部，消灭 60fps 全量 React VDOM 重绘与掉帧卡顿；
   - **乐观同步更新**：动效结束瞬间由 `queryClient.setQueryData` 乐观更新本地缓存，彻底消除异步网络回拉延时导致的「瞬间闪现回跳」；
   - **全场景 0 ↔ 1 动效**：逾期警告横幅、待办列表与已完成折叠区在「0 到 1 产生」与「1 到 0 清空」全生命周期均具备平滑展开与折叠离场动效。

4. **工作台偏好系统与苹果风格胶囊开关 (`PreferencesContext` & `Switch`)**：
   - **全局偏好持久化**：支持时段问候语、逾期列表默认展开、全局动效控制与已完成任务展示，配置秒级持久化至 `localStorage`；
   - **Apple-Style 胶囊开关**：纯 GPU 加速的 `cubic-bezier(0.16, 1, 0.3, 1)` 弹性位移动画与微按压形变，高频极速连击不掉帧；
   - **无障碍动效联动**：支持 `data-reduced-motion` 全局动效降级，同时对基础物理交互控件保持轻量位移反馈。

5. **周历指挥台全屏视口沉浸与跨模块联动 (`CalendarPage`)**：
   - **零外层滚动纯 Flex 视口计算**：纯响应式高度自适应，24 小时时间轴弹性填满剩余空间，外层页面彻底消除滚动条；
   - **全天栏动态拖拽调高 (`Splitter Resizer Bar`)**：支持自由拖拽调节全天栏高度（`44px ~ 260px`），双击快速切换，偏好持久化并支持单元格内独立滚动；
   - **智能周导航与悬浮快速选择器**：ISO 周计算跨年无缝支持、快捷键（`←`/`→`/`T`）、年份滚轮纯净横向滚动、悬浮窗点击外部区域自动关闭；
   - **操作行为分流与跨模块直达**：左键单击看事项详情并支持一键跳转展开招聘岗位全套面试流程；右键单击直接唤起排期调整；超长标题鼠标悬停跑马灯平滑滚动。

6. **多账号管理与个人资料头像体系 (`AccountsPanel` & `Avatar`)**：
   - **每账号独立物理数据库**：账号切换在文件系统边界完成，零侵入 core 领域实体，全服务安全切换与迁移追平；
   - **头像优先级解析与 GitHub 自动联动**：默认展示经典用户矢量头像；绑定 GitHub 账号后自动拉取并呈现 GitHub 官方头像；
   - **多来源个性化设置**：支持本地图片智能居中裁剪与等比压缩存储至 `accounts.json`、内置 8 款精选矢量渐变预设头像，以及远程 HTTPS 图片链接；
   - **优雅离线降级与悬停交互**：图片加载异常自动无缝兜底；主卡片支持悬停编辑遮罩微交互。

7. **WebDAV 远程快照恢复与 Gist 零知识偏好同步体系 (`BackupPanel` & `GistSyncPanel`)**：
   - **WebDAV 一致性快照与五态恢复机**：基于 SQLite Online Backup API 避免 WAL 遗漏，全服务 503 拦截保护，支持行级差异比对、安全回滚与断电续命；
   - **Gist 设置与凭据零知识加密同步**：使用 `scrypt` + `AES-256-GCM` 派生加密，Secret Gist 明文 Header 用于轻量比对，支持口令解锁与冲突手动决策（从云端拉取覆写 / 本地覆写云端）；
   - **OS 系统凭据保管库优先**：优先使用 Windows Credential Manager / macOS Keychain 安全存储 GitHub Token 与同步口令，无保管库时明确警示并禁用明文口令持久化。

8. **本地快照与双向导入体系 (`LocalBackupPanel` & `LocalImportModal`)**：
   - **本地离线一致性快照**：独立于云端 WebDAV 的本地快照存储引擎，支持自定义输出目录与滚动清理保留策略；
   - **双向导入与高低风险隔离**：支持「覆盖当前账号（走带回退点的五态恢复机）」与「导入为独立新账号（零现有文件干扰、自动迁移补齐）」；
   - **智能路径解析与兼容防呆**：前端自动拼接备份目录，服务端支持纯文件名自动定位，彻底杜绝相对路径预检 404。

## 要改代码先读什么

1. `docs/superpowers/specs/2026-08-17-personal-workbench-design.md` — 架构设计与功能规范
2. `docs/adr/` — 架构决策记录（ADR）。**动 core 之前必读**。其中
   `docs/adr/0005-module-boundaries.md` 记录了三条铁律里唯一 lint 不强制的一条（铁律 3：模块自带迁移与注册项）——这条靠人守，不靠 CI。

## 加一个新模块

1. 在 `modules/<name>/` 建目录，参照 `modules/todo/` 的结构
2. 在 `packages/server/src/index.ts` 的 modules 数组加一项
3. 在 `packages/web/src/modules.ts` 的 uiModules 数组加一项
4. 在该模块的 `package.json` 里声明它自己的依赖：本地工作区包写 `"*"`，
   安装用 `npm install <pkg> -w <workspace>`；运行期真正 import 的进 `dependencies`，
   仅测试或仅类型用途的进 `devDependencies`。见
   `docs/adr/0006-workspace-dependency-declaration.md`
5. 模块自己的迁移放在自己目录下、写进 `ServerModuleDefinition.migrations`，
   **不要放进 core 的集中目录**

三条铁律里，**前两条由 ESLint 强制**，违反会在 `npm run lint` 时报错：

- **模块只能依赖 core，模块之间零依赖** —— import 别的模块或直连 `@workbench/data` 会被拦
- **core 永不感知模块** —— 在 core 里 import 任何外层都会被拦

第三条 **模块自带迁移与注册项** 没有任何自动检查，只能靠人守。把某个模块的迁移搬进 core 的集中目录，lint 和 CI 都不会报错，但「删模块 = 删一个目录 + 删一行注册」这个承诺就此失效。详见 `docs/adr/0005-module-boundaries.md`。

**如果加模块时你发现必须改 `packages/core/`，停下来想清楚**——这通常意味着某个 core 的假设错了，值得记一条新的 ADR。

## 架构决策记录 (ADRs) 索引

- `docs/adr/0001-local-first-architecture.md` — 本地优先架构
- `docs/adr/0002-unified-item-model.md` — 统一 Item 模型
- `docs/adr/0003-derived-urgency.md` — 动态衍生紧迫度
- `docs/adr/0004-time-storage.md` — 时间与时区存储规范
- `docs/adr/0005-module-boundaries.md` — 模块边界铁律
- `docs/adr/0006-workspace-dependency-declaration.md` — 工作区依赖显式声明
- `docs/adr/0007-module-scoped-item-deletion.md` — 模块级数据删除边界
- `docs/adr/0008-module-owned-storage-adapters.md` — 模块自有存储适配器
- `docs/adr/0009-todo-trash-reuses-cancelled-status.md` — 回收站复用 cancelled 状态
- `docs/adr/0010-todo-completion-and-reopen-lifecycle.md` — 待办完成、重开与已完成归集生命周期
- `docs/adr/0011-optimistic-ui-and-hardware-accelerated-animations.md` — 乐观缓存同步与 GPU 动效架构
- `docs/adr/0012-scheduling-is-a-cross-module-capability.md` — 排程是跨模块能力，归工作台所有
- `docs/adr/0013-minimalist-datetime-picker-with-direct-hand-manipulation.md` — 极简现代双指针模拟钟表与时分一体化日历组件架构
- `docs/adr/0014-timezone-management-and-three-way-deduction.md` — 全局时区上下文、UTC 标准化存储与时间段三者互推引擎架构
- `docs/adr/0015-in-place-accordion-table-and-fluid-process-stepper.md` — 原地展开表格、吸顶控制区与自适应流转推进图架构
- `docs/adr/0016-workbench-preferences-and-apple-style-switch.md` — 工作台行为偏好持久化与苹果风格胶囊开关架构
- `docs/adr/0017-weekly-calendar-viewport-containment-and-all-day-resizing.md` — 周历指挥台视口自适应锁定、全天栏动态缩放与跨模块交互规范
- `docs/adr/0018-settings-live-in-the-database.md` — 系统设置持久化与键值表模型
- `docs/adr/0019-accounts-and-per-account-database.md` — 账号体系与每账号独立数据库
- `docs/adr/0020-backup-snapshot-and-restore-state-machine.md` — 备份快照与恢复五态状态机
- `docs/adr/0021-zero-knowledge-encryption-for-cloud-credentials.md` — 云端凭据零知识加密与系统保管库优先
- `docs/adr/0022-local-backup-and-file-import.md` — 本地数据快照、多方向导入与安全路径解析
- `docs/adr/0023-habits-are-not-core-items.md` — 习惯不投影成 core Item，本地日期由前端提供
- `docs/adr/0024-http-kit-is-the-second-package-modules-may-depend-on.md` — http-kit 是模块可依赖的第二个包
- `docs/adr/0025-todo-owns-tables-for-subtasks-tags-and-recurrence.md` — todo 长出自有表（原编号 0014，已改编）
