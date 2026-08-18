# 0006. 工作区包必须声明自身依赖

日期：2026-08-17
状态：已接受

## 背景

本仓库是 npm workspaces 单仓库。npm 的依赖提升（hoisting）会让一个包即使不声明
依赖也能正常 import——因此"能跑"不构成依赖声明正确的证据。

实现迭代 1 期间，一次代码审查发现 `packages/data` 的 `package.json` 没有任何依赖声明，
而它实际使用的 `drizzle-orm`、`better-sqlite3`、`@workbench/core` 全部躺在根 manifest 里。
功能上毫无问题，测试全绿。

## 决策

每个 `packages/*` 与 `modules/*` 的 `package.json` 都必须在自己的
`dependencies` / `devDependencies` 中声明它实际 import 的一切。

- 本地工作区包写 `"*"`，npm workspaces 会解析到本地包
- 安装一律用 `npm install <pkg> -w <workspace>`，不得装到根 manifest 靠提升生效
- 仅在运行期真正 import 的进 `dependencies`；仅测试或仅类型用途的进 `devDependencies`
- 例外：仅由根 npm script 调用的 CLI 工具（如 `drizzle-kit`）留在根 devDependencies

## 后果

- 每个包的 manifest 成为它依赖面的可读声明。读一个包的 `package.json` 就能知道
  它被允许碰什么——这正是 ADR-0005 三条铁律所依赖的那种"边界可读"
- `@workbench/data` 被声明为 `modules/todo` 的 **devDependency** 而非 dependency，
  在 manifest 层面诚实表达了"测试可以用真实数据库，生产代码不许碰数据层"这条边界。
  这是 lint 规则之外的第二重表达，且是人可读的
- 代价：新建包时多几行样板，且 npm 自动写入的 `^0.0.0` 需手工改成 `"*"`
- 关闭的选项：不能再依赖提升来省事。这是刻意的摩擦
