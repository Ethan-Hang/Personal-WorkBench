# 0024. http-kit 是模块可依赖的第二个包

日期：2026-08-22
状态：已接受

## 背景

架构扫描（2026-08-22）在服务端一侧发现两件事，它们其实是同一件：

**其一，模块模板长出了两种形状。** `modules/{todo,habit,notes}/src/server/errors.ts`
三份 `DomainError` / `notFound` / `conflict` / `invalid` / `toHttp` 除注释外逐字节相同——
这是刻意为保住铁律 1 付的代价，三个文件里都有注释说明。但 `modules/campus-recruit`
根本没走这套：它在 `service.ts` 自定义 `CampusNotFoundError extends Error`，
在 `routes.ts` 内联两个 helper，且**完全没有 `conflict`**。

后果不是「多写了一百行」，而是：本项目的首要目标是「让第 10 个模块的加入成本与第 2 个
相同」，其前提是**只有一份可抄的模板**。有两份时，下一个模块照抄有一半概率抄错，
而抄错的那一份会把领域校验错误落成 500。

**其二，路由层是 shallow 的。** 五个模块的 `routes.ts` 合计 843 行，`safeParse`
出现 72 处，每个 handler 都是同一套「校验 → 不合法回 400 → 调 service → 领域错误落 4xx」
的手抄。interface（一条路由的注册）与 implementation（它做的事）几乎一样宽。

这两件事必须一起解决：`toHttp` 与 `defineRoute` 只有放在一起才吃得掉那套四步样板，
分两次做要动两遍同样的文件。

## 决策

### 1. 新建 `packages/http-kit`，它是模块可依赖的第二个包

铁律 1 的措辞从「**模块只能依赖 core**」改为「**模块只能依赖 core 与 http-kit**」。

依赖方向：`modules → http-kit → core`。

包内只有两样东西，都不含任何领域概念：

- `DomainError` / `notFound` / `conflict` / `invalid` / `toHttp`
- `defineRoute(spec, handler)`

### 2. 落点为什么不是别处

被否决的三个位置，各有硬理由：

- **`packages/server`（架构扫描报告最初的提法，是错的）。** 它是组合根，
  `index.ts` 已经 import 了全部五个模块。模块反过来 import 它会形成
  `server → modules → server` 的**包级循环**。这条被 `eslint.config.js` 里
  `packages/http-kit` 那一块守住。
- **`packages/core`。** core 的定义是「纯领域逻辑，零 IO 依赖，不知道任何模块存在」。
  HTTP 状态码是传输层概念，`defineRoute` 还要吃 Zod。把它们塞进 core 会让
  core 第一次背上传输层语义。
- **`packages/ui`。** 那是浏览器侧的共享基座。服务端路由胶水进 web 产物毫无道理，
  同样由 lint 守住。

### 3. 命名踩到的一个坑，值得记下来

最初的名字是 `@workbench/module-kit`。它**会被 `eslint.config.js` 里
`@workbench/module-*` 这条 glob 命中**——那条规则正是用来禁止模块间依赖的，
于是新包一出生就被禁止被模块 import，而报错信息会说「违反铁律 1：模块之间零依赖」，
指向一个完全错误的方向。改名为 `@workbench/http-kit` 后与所有既有 glob 无交集。

**给下一个包的教训：新包命名前先对着 `eslint.config.js` 的 glob 过一遍。**

### 4. `defineRoute` 的三条承重细节

- **params 先于 query 先于 body 校验。** 路径就错了还去报 body 的错，
  会把调用方引向错误的地方。
- **缺 body 时按 `{}` 校验**，因而报的是字段级消息而不是「期望对象，收到 undefined」。
  notes 的 `createTodo` 原本手写 `request.body ?? {}` 才拿到这个行为，现在是所有路由的默认。
- **未知错误继续冒泡**（经 `toHttp`），否则拿不到请求编号也进不了日志。

## 后果

**好的：**

- 五个模块的 `routes.ts` 从 843 行降到 722 行，`safeParse` 调用点从 **72 处降到 0**。
  `routes.ts` 退化成「路径 ↔ service」的对照表。
- 模板收敛回一种。campus-recruit 的 `CampusNotFoundError` 就此消失，
  它的「投递不存在」「轮次不存在」现在与其余四个模块走同一条 404 通路。
- 400 的响应形状不可能再各写各的。
- 新增第 6 个模块时，错误映射与路由校验的成本归零。

**代价：**

- **铁律 1 从「一个例外都没有」变成「有一个例外」。** 这是本次真正的代价：
  规则越简单越守得住，而「只能依赖 core」比「只能依赖 core 与 http-kit」好记。
  为控制这条口子，`packages/http-kit` 有专门的 lint 块禁止它依赖模块、data、server、
  web 与 ui，且**包内不得出现任何领域词汇**——一旦这里出现「便签」「习惯」，
  它就从胶水变成了第二个 core，本决策应当被重新审视。
- 模块的 `package.json` 多一条依赖声明（ADR-0006 要求如实声明）。

## 一处需要更正的前置判断

架构扫描报告与 TASK-073 最初的验收条件写的是「campus-recruit 必须补上 `conflict()`」。
**这条基于一个错误前提**：campus-recruit 现今的领域逻辑里**没有任何冲突类场景**，
它抛出的全部是「不存在」。本次因此没有为它发明新的业务规则——它得到的是
「`conflict` 可用」，而不是「`conflict` 被用上了」。

## 相关

- ADR-0005 模块边界三条铁律（本决策修订其中铁律 1 的措辞）
- ADR-0006 工作区包必须声明自身依赖
- ADR-0008 模块自有存储适配器由组合根注入
