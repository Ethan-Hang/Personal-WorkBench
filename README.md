# 个人工作台

本地优先的个人工作台。当前处于迭代 1（Walking Skeleton），已实现今日工作台的
任务创建、排序与完成。

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:5173

服务端在 3000 端口，前端 5173 通过 Vite 代理转发 `/api`，浏览器只看到一个源。

## 常用命令

| 命令                  | 作用                                          |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | 同时启动后端与前端                            |
| `npm run check`       | 格式 + 类型 + lint + 测试（提交前跑这个）     |
| `npm run test`        | 只跑测试                                      |
| `npm run db:generate` | 改完 `packages/data/src/schema.ts` 后生成迁移 |

## 数据在哪

`data/local/workbench.db`（已在 .gitignore 中）。删掉它即可从空库重来。

## 要改代码先读什么

1. `docs/superpowers/specs/2026-08-17-personal-workbench-design.md` — 架构设计
2. `docs/adr/` — 六条架构决策及其理由。**动 core 之前必读**。其中
   `docs/adr/0005-module-boundaries.md` 记录了三条铁律里唯一 lint 不强制的
   一条（铁律 3：模块自带迁移与注册项）——这条靠人守，不靠 CI。

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

第三条 **模块自带迁移与注册项** 没有任何自动检查，只能靠人守。把某个模块的迁移
搬进 core 的集中目录，lint 和 CI 都不会报错，但「删模块 = 删一个目录 + 删一行注册」
这个承诺就此失效。详见 `docs/adr/0005-module-boundaries.md`。

**如果加模块时你发现必须改 `packages/core/`，停下来想清楚**——这通常意味着
某个 core 的假设错了，值得记一条新的 ADR。
