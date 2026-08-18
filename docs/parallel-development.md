# 并行开发约定

两人同时开发时的目录归属、分支规则与交接点。**开工前先读这一页。**

---

## 1. 分支：不用迭代号

**`main` 是主干。所有分支从 `main` 切，做完合回 `main`。**

分支名按**功能**命名，不带迭代号：

```
✅  feat/theme-layer          feat/workbench-module        fix/calendar-drag
❌  feat/iteration-2          feat/iteration-4-theme
```

理由不是审美。曾经有一个叫 `feat/iteration-1-walking-skeleton` 的分支，里面装着
秋招模块（原计划的迭代 5）、设计基座（原计划的迭代 4）和一堆事故加固。**迭代号会漂移，
功能名不会。** 名字一旦开始撒谎，"我该从哪切出来"就成了每天要猜一次的问题。

同理，工作流不再编号——见主设计文档 §14.3。

## 2. 目录归属：谁碰哪里

| 目录                            | 归属     | 说明                             |
| ------------------------------- | -------- | -------------------------------- |
| `packages/ui/**`                | 前端     | 视觉系统的家。后端不改这里的样式 |
| `modules/*/src/ui/**`           | 前端     | 页面与交互                       |
| `packages/web/**`               | 前端     | 外壳、导航、主题装配             |
| `packages/core/**`              | 后端     | **动它之前先读 `docs/adr/`**     |
| `packages/data/**`              | 后端     | schema 与迁移                    |
| `packages/server/**`            | 后端     | 装配与模块注册                   |
| `modules/*/src/server/**`       | 后端     | service、路由、投影              |
| `modules/*/src/storage/**`      | 后端     | SQLite 适配器（ADR-0008）        |
| **`modules/*/src/contract.ts`** | **共同** | **交接点。改它之前先说一声**     |

> `modules/workbench` 目前只有服务端。它的 `src/ui/` 建起来之后归前端，规则同上。

## 3. 交接点只有一个：`contract.ts`

每个模块的 `src/contract.ts` 里同时放着两样东西，前后端共用同一份：

- **端点路径**（`TODO_API` / `CAMPUS_API`）：传 `ID_PARAM` 得到 Fastify 注册模式，传真实 id 得到请求路径
- **请求 / 响应形状**（Zod schema）：服务端校验入参，客户端 `.parse()` 校验响应

由此得到两条对协作重要的性质：

- **写前端只需要读 `contract.ts`**，不必读 `src/server/`
- **后端改了形状，前端会在接缝处大声失败**，而不是页面静默变空

所以：**改 `contract.ts` = 改契约 = 影响对方。** 其余目录各改各的，互不通知也没关系。

## 4. 已知缺口，动手前先知道

- **UI 没有任何自动化测试。** Vitest 的 `include` 刻意不收集 `.tsx`——改坏渲染 CI 依然全绿。
  这在只有一个页面时是对的取舍，页面多起来后就是没有安全网。要改这条策略，请同时更新
  `CLAUDE.md` 的测试策略段，不要默默违反。
- **前端不能脱离后端运行。** 没有 mock 层，`npm run dev:web` 单跑所有请求都会失败。
- **传输层每个模块各写一份 `request()`。** 修一次要改 N 遍。第三个模块出现时再考虑抽取。

## 5. 避免踩踏的排序

某些工作会动同一个文件，先后顺序比同时开工便宜。

### 已发生的一次逆序（保留作为教训）

本节原本写着：「`modules/workbench` 的结构搬迁要先于主题层动今日页面」——因为后端会把
`TodayPage.tsx` 从 `modules/todo` 搬到 `modules/workbench`，若前端已在旧位置重做样式，
那次 `git mv` 会打乱他的工作。

**实际顺序反了。** 主题层先动，`TodayPage.tsx` 从 60 行涨到 1300 行，且顺带写了 todo 的
回收站、编辑与批量操作（`src/server/**` 与 `contract.ts`，均非前端归属）。后果：

- 搬迁成本从「改几个 import」变成了「大规模冲突」；
- 工作台模块因此拆成两步：后端先建 `modules/workbench` 的服务端切片（不碰任何 `.tsx`），
  UI 搬迁作为 `contract.ts` 交接点推后由前端完成；
- 两个 `today` 端点（`/api/todo/today` 与 `/api/workbench/today`）会短暂并存。

**教训：并行开发里真正昂贵的不是改错文件，是做错顺序。**
改错文件有 lint 和审查拦得住；做错顺序只能靠人开工前读这一页。

### 当前生效的排序约束

- **不要再往 `modules/todo` 里加跨模块能力。** 它现在兼职工作台（`/api/todo/today` 不按
  `sourceModule` 过滤），每多一条跨模块逻辑，将来搬到 `modules/workbench` 就多一分成本。
- **UI 搬迁开始前，两边先对一次 `contract.ts`。** 它是唯一的交接点（§3）。

### UI 搬迁该读什么

后端已交付 `modules/workbench/src/contract.ts`，里面有全部四个端点与响应形状。
与 `TODO_API.today` 相比的差异：

- 字段名从 `tasks` 改为 `scheduled`（`overdue` / `completed` 不变）；
- 每条多出 `kind`（task / event）与 `scheduled`（core 的两分支形状，周日历需要）；
  **`TODO_API` 的 `TaskView` 也新增了 `scheduled`**，且是必填字段；
- **没有 `canEdit`。** 工作台不知道哪个模块允许编辑——那是各模块自己的规则，
  它只透出 `sourceModule`。`TodayPage.tsx` 里那些 `sourceModule === TODO_MODULE_ID`
  判断的正解是给 `UiModuleDefinition` 加一个能力声明，由前端注册表回答。

## 6. 提交前

`npm run check` 四步全绿才算过：format → typecheck → lint → test。

**Node 版本有硬性下限**（`engines.node >= 22`，`engine-strict=true`）。版本不符时
`npm install` 会以 `EBADENGINE` 直接失败并打印所需版本——这是刻意的：曾有人因 Node 过旧
撞上运行时故障，症状伪装成 SQLite 问题，排查方向被带偏很久。

## 7. 待办：主干还没对齐

⚠！本节描述的是一个**正在变差的**情况，并行开发正式展开前必须解决。

§1 说「所有分支从 `main` 切」，**但这条目前不能照做**：

| 引用                                  | 位置                                             |
| ------------------------------------- | ------------------------------------------------ |
| `main` / `origin/main` / `gitee/main` | 停在 `a5604d7`（Walking Skeleton 实现计划文档）  |
| `origin/HEAD`                         | 指向已废弃的 `feat/iteration-1-walking-skeleton` |
| 实际主干                              | `feat/theme-layer`，**领先 `main` 26 个提交**    |

从 `main` 切分支会丢掉秋招模块、整个 `packages/ui`、错误追踪与主题层——即几乎全部现有工作。
新人 `clone` 下来默认检出的又是那个已废弃的迭代分支。

**需仓库所有者做三件事**（都只能由他操作）：

1. 把已完成的分支合回 `main`，让 `main` 重新成为真实主干；
2. 把 `origin/HEAD` 指回 `main`；
3. 删掉或归档 `feat/iteration-1-walking-skeleton`。

**在此之前，新分支从 `feat/theme-layer` 切，不从 `main` 切。**
