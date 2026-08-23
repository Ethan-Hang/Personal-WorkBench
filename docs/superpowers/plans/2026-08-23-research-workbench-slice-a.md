# Research Workbench Slice A Implementation Plan

**Goal:** 连续完成 A1“论文导入与安全存储闭环”和 A2“完整文献库治理与迁移出口”，交付一个可以独立管理论文身份、文件、元数据、目录、标签、检索和迁移包的可信文献库。

**Architecture:** `modules/research` 拥有完整领域模型、迁移、Repository、文件生命周期、元数据客户端、服务端路由和 UI。数据库只保存领域关系与位置状态，文件内容使用账号隔离的 SHA-256 内容寻址目录；托管文件和链接文件共享 `Asset`，但各自保留 `AssetLocation`。A1 先证明导入、去重、恢复和安全删除，A2 在同一稳定模型上补齐批量治理、检索、可撤销合并和迁移出口。

**Tech Stack:** TypeScript strict、Node.js 22、Fastify 5、SQLite/better-sqlite3、Drizzle ORM、Zod 4、React 19、TanStack Query 5、Tailwind CSS 4、Vitest 4、`pdfjs-dist@6.2.108` legacy build、`fast-xml-parser@5.11.0`。

**Spec:** `docs/superpowers/specs/2026-08-21-research-workbench-design.md`

## 执行方式

- 本文件是完整切片 A 的唯一实施计划。先完成 A1，再连续进入 A2，不另建 A2 计划文件。
- A2 的产品范围已经确定；A1 验收后根据实际表结构和接口，只在本文件中校准 A2 的逐文件步骤，不重新讨论已确认的领域语义。
- 每个提交都是可运行、可验证的绿色检查点，不提交 WIP。全程只做本地提交，不 push。
- 开工前、A1 完成后和切片 A 最终验收前执行 `git fetch origin --prune`，检查远端变化；需要合并时先确认工作区干净并解决实际冲突。
- 生产模块代码只依赖 `@workbench/core`、`@workbench/http-kit`、`@workbench/ui` 和外部库，不依赖其他业务模块或 `@workbench/data`。
- 数据库实现只放在 `modules/research/src/storage/**`。Repository 接口、服务、路由和文件系统服务不接触 Drizzle 或 `better-sqlite3`。
- research 不把论文记录投影为 core `Item`。只有后续出现真实可执行动作时再建立投影。
- 测试只使用独立临时目录、临时数据库和生成语料，不读写 `data/local` 中的用户资料。
- 默认测试不访问外部元数据服务。HTTP 响应使用固定快照；真实 Crossref、DataCite、arXiv、OpenAlex 请求放入 opt-in 验证脚本。
- 跨平台验证按测试模块记录。当前文件语义模块在 macOS 已测、Windows 待测；Windows 待测不阻塞数据库、领域服务、API 或 UI。涉及文件路径、占用、移动、删除或原子提交的改动，要同步维护 Windows 验证脚本和文档指令；反向开发时同理补记 macOS 状态。

## 稳定领域边界

### 身份与关系

- `Work` 表示作品，允许没有附件和不完整元数据。
- `Edition` 表示作品的具体版本；一个作品可有多个版本。
- `Asset` 表示按字节 hash 识别的内容；同 hash 只建一个 `Asset`。
- `AssetLocation` 表示内容所在位置；同一 `Asset` 可同时有一个托管位置和多个链接位置。
- `Attachment` 把 `Edition` 与 `Asset` 连接起来，并保存附件角色和显示名称。
- DOI、arXiv ID 等标识符用于重复候选，不设数据库硬唯一；hash 不同但标识符相同的文件不得自动合并。
- 字段值与字段来源分开保存；人工确认值优先级最高，后续识别和刷新只能新增建议。

### 文件生命周期

```text
selected
  -> hashing
  -> staged (managed only)
  -> object_ready | linked_verified
  -> database_committed
  -> available

available
  -> missing | changed | recycled
missing
  -> available (same hash relink)
  -> replacement_candidate (different hash)
recycled
  -> available (restore)
  -> permanently_deleted (zero references + second check)
```

- 托管对象路径固定为 `sha256/<前2位>/<后2位>/<完整 digest>`。
- 临时文件必须位于解析后的托管根目录内，保证最终 rename 不跨设备。
- 托管写入执行“流式 hash/复制 → fsync/关闭 → 目标 hash 校验 → 原子 rename”。目标已存在时校验并复用，禁止盲目覆盖。
- 链接位置同时保存用户输入路径与 `realpath`；不为实际 I/O 路径做小写化或 Unicode 规范化。
- `dev/ino` 只作本机运行时提示，不作为可迁移身份。
- 链接原文件永不由 WorkBench 删除。托管对象只有在永久清理前再次确认无有效附件和导出引用后才删除。
- `EBUSY`、`EPERM`、`EACCES`、`ENOSPC`、`EXDEV` 和缺失分别保留机器可读原因。

### 账号隔离与路径注入

- research Repository 使用动态 `getSqlite()`，账号切换后自动指向当前账号数据库。
- 组合根向 research 注入动态的 `accountId()` 和 `managedRoot()`：账号模式使用 `<WORKBENCH_DATA_DIR>/accounts/<account-id>/research/managed`；`WORKBENCH_DB` 单库模式使用 `<WORKBENCH_DATA_DIR>/research/managed`。
- 文件服务每次操作时解析当前账号根，不缓存跨账号绝对路径。
- 浏览器不能读取用户本地绝对路径。链接模式通过本地 server 唤起系统文件选择器或用户手工输入路径；网页文件上传只用于托管导入。

## 数据模型

首个迁移一次建立 A1 与 A2 共用的稳定表，避免 A2 反向拆改身份和文件表。A1 暂时不用的表仍保持最小字段，不提前实现对应服务。

| 表                              | 主要职责                                                       |
| ------------------------------- | -------------------------------------------------------------- |
| `research_works`                | 作品身份、规范标题、类型、年份、首选版本、回收状态、合并重定向 |
| `research_editions`             | 版本身份、载体、出版字段、所属 Work                            |
| `research_contributors`         | 版本作者及顺序、角色、ORCID                                    |
| `research_identifiers`          | DOI、arXiv、ISBN、ISSN、PMID、URL 等规范值与原值               |
| `research_assets`               | SHA-256、字节数、MIME、内容状态                                |
| `research_asset_locations`      | 托管/链接位置、原始路径、解析路径、文件状态和最近检查          |
| `research_attachments`          | Edition 与 Asset 的关系、角色、显示名、回收状态                |
| `research_collections`          | 层级目录、系统视图、保存查询及排序                             |
| `research_collection_entries`   | Work 的多目录归属                                              |
| `research_tags`                 | 规范标签、颜色、说明、回收状态                                 |
| `research_tag_aliases`          | 标签旧名、别名与规范 Tag 映射                                  |
| `research_work_tags`            | Work 与 Tag 的多对多关系                                       |
| `research_work_relations`       | 相关、扩展、修订、引用等人工关系                               |
| `research_source_records`       | PDF、文件名和外部服务的原始响应、版本与获取时间                |
| `research_metadata_assertions`  | 字段级候选值、来源、观察时间、人工确认和当前选择               |
| `research_external_source_maps` | 外部 ID 与内部 Work/Edition 的映射及刷新状态                   |
| `research_import_sessions`      | 导入批次、状态、创建时间和对账结果                             |
| `research_import_items`         | 单文件阶段、临时路径、候选决策、错误码和可重试状态             |
| `research_merge_records`        | Work/Tag 合并前后快照、重定向和撤销状态                        |
| `research_export_jobs`          | 迁移包选项、文件清单、缺失报告和完成状态                       |

迁移同时创建用于标题、作者、标识符和维护状态的普通索引；A2 的 FTS5 虚拟表及触发器在同一模块迁移账本的后续迁移中加入。所有外键开启并明确 `restrict`/`cascade`，永久删除只能经 service 完成。

## 文件清单

### 模块与装配

- Create: `modules/research/package.json`
- Create: `modules/research/drizzle.config.ts`
- Create: `modules/research/migrations/0000_research_foundation.sql`
- Create: `modules/research/migrations/meta/_journal.json`
- Create: `modules/research/src/contract.ts`
- Create: `modules/research/src/server/index.ts`
- Create: `modules/research/src/server/repository.ts`
- Create: `modules/research/src/server/routes.ts`
- Create: `modules/research/src/server/service.ts`
- Create: `modules/research/src/storage/schema.ts`
- Create: `modules/research/src/storage/sqlite-repository.ts`
- Create: `modules/research/src/testing/harness.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/web/src/modules.ts`
- Modify: `tsconfig.json`
- Modify: `package-lock.json`

### A1 文件与元数据

- Create: `modules/research/src/files/file-system.ts`
- Create: `modules/research/src/files/content-store.ts`
- Create: `modules/research/src/files/reconcile.ts`
- Create: `modules/research/src/ingest/pdf-extractor.ts`
- Create: `modules/research/src/ingest/pdf-worker.mjs`
- Create: `modules/research/src/ingest/identifiers.ts`
- Create: `modules/research/src/ingest/metadata.ts`
- Create: `modules/research/src/metadata/client.ts`
- Create: `modules/research/src/metadata/crossref.ts`
- Create: `modules/research/src/metadata/datacite.ts`
- Create: `modules/research/src/metadata/arxiv.ts`
- Create: `modules/research/src/metadata/openalex.ts`
- Create: `modules/research/src/metadata/coordinator.ts`
- Create: `modules/research/src/server/file-picker.ts`

### A1 UI

- Create: `modules/research/src/ui/index.tsx`
- Create: `modules/research/src/ui/api.ts`
- Create: `modules/research/src/ui/ResearchLibraryPage.tsx`
- Create: `modules/research/src/ui/components/ImportDialog.tsx`
- Create: `modules/research/src/ui/components/MetadataReview.tsx`
- Create: `modules/research/src/ui/components/LibraryList.tsx`
- Create: `modules/research/src/ui/components/CollectionSidebar.tsx`
- Create: `modules/research/src/ui/components/FileStatus.tsx`

### A2 治理、检索与导出

- Create: `modules/research/migrations/0001_research_search.sql`
- Create: `modules/research/src/library/collections.ts`
- Create: `modules/research/src/library/tags.ts`
- Create: `modules/research/src/library/duplicates.ts`
- Create: `modules/research/src/library/relations.ts`
- Create: `modules/research/src/library/search.ts`
- Create: `modules/research/src/interop/canonical-export.ts`
- Create: `modules/research/src/interop/export-package.ts`
- Create: `modules/research/src/ui/components/InboxPanel.tsx`
- Create: `modules/research/src/ui/components/SearchBar.tsx`
- Create: `modules/research/src/ui/components/TagManager.tsx`
- Create: `modules/research/src/ui/components/DuplicateReview.tsx`
- Create: `modules/research/src/ui/components/ExportDialog.tsx`

文件名可以在实现时按职责微调，但不能改变本计划定义的模块边界、生命周期和验收语义。

## A1：论文导入与安全存储闭环

### Task 1：建立模块骨架、契约和稳定迁移

**提交：** `feat(research): scaffold slice A domain and contracts`

- [x] 在 `modules/research/package.json` 声明 server、contract、storage、ui 和 ui/api 导出，锁定 `pdfjs-dist@6.2.108` 与 `fast-xml-parser@5.11.0`。
- [x] 在 `contract.ts` 定义版本化 `/api/research/v1` 路径、ID、分页、Work/Edition/Asset/Location/Attachment、字段来源、导入草稿、文件状态和机器可读错误 Zod schema。
- [x] 为 managed/link、导入阶段、位置状态、元数据来源、重复候选决策和删除动作使用显式枚举，不把语义藏进自由字符串。
- [x] 编写契约测试：最小 Work、unknown 类型、不完整字段、带多来源建议、缺失位置和失败导入均可解析；非法状态组合被拒绝。
- [x] 创建 A1/A2 共用表和索引；迁移账本只属于 research 模块。
- [x] 为 schema 添加真实 SQLite 迁移测试，检查外键、唯一 hash、允许重复 DOI、多目录关系和账号库重复迁移幂等。
- [x] 在边界测试中确认 research 的非 storage 代码不能 import 数据库库或 `@workbench/data`。
- [x] 更新 workspace lockfile、TypeScript paths 和必要 ESLint 配置。

**验证：**

```bash
npx vitest run modules/research/src/contract.test.ts modules/research/src/storage/migrations.test.ts packages/core/src/eslint.boundaries.test.ts
```

### Task 2：实现 Repository 和目标规模基准

**提交：** `feat(research): add library repository and scale benchmark`

- [x] Repository 接口按领域操作组织，不向 service 暴露 SQL 行或通用 CRUD。
- [x] 实现 Work/Edition/Contributor/Identifier、Asset/Location/Attachment、Collection/Entry、SourceRecord/Assertion、ImportSession/Item 的原子写入与查询。
- [x] 使用稳定 ID（UUID）并让所有时间由可注入 clock 生成，测试不依赖真实时间。
- [x] hash 唯一竞争由数据库约束兜底；重复标识符只返回候选，不抛唯一冲突。
- [x] 列表使用 keyset 分页；批量加载避免逐行 N+1。
- [x] 生成 10,000 Work、20,000 Edition/Asset/Location/Attachment、20,000 CollectionEntry、1,000 Tag 和 30,000 WorkTag 的临时磁盘基准。
- [x] 记录数据库大小、峰值 RSS、普通查询 p95、缺失/重复/对账 p95、200 条事务、1,000 次 hash 查询和 `integrity_check`。
- [x] 默认规模测试不创建等量 PDF，临时目录退出时清理；超阈值时测试明确失败并打印实测值。

**验证：**

```bash
npx vitest run modules/research/src/storage/sqlite-repository.test.ts
RUN_RESEARCH_SCALE=1 npx vitest run modules/research/src/storage/scale.test.ts
```

### Task 3：实现托管与链接文件生命周期

**提交：** `feat(research): implement safe content storage lifecycle`

- [x] 定义窄 `FileSystem` 边界，生产适配器使用 Node `fs`，测试适配器可注入取消、锁定、权限、空间不足和跨设备错误。
- [x] 实现分块 SHA-256、进度、AbortSignal 和大小检查，不把整份 PDF 读入内存。
- [x] 托管导入在 managed root 内创建 staging 文件，完成关闭与校验后无覆盖发布；并发导入只留一个正式对象。
- [x] 链接导入保存原路径、realpath、大小、mtime 和可选 dev/ino；不复制、不改写源文件。
- [x] 路径选择器支持 macOS `osascript`、Windows PowerShell 和 Linux zenity/kdialog 的命令适配，取消统一返回空列表；选择后仍由服务端重新校验 PDF 路径。
- [x] 上传入口只接受 managed 模式，流式写入当前账号 staging；linked 模式拒绝网页上传产生的临时路径。
- [x] 实现缺失审计、同 hash 重新定位、不同 hash replacement candidate、附件回收和无引用托管对象永久清理前二次确认。
- [x] 实现启动/手动 reconciliation：处理 staging 未提交、对象已就位但数据库未提交、数据库显示可用但文件缺失或变化。
- [x] 所有错误返回稳定 code、阶段、可重试性和安全清理结果。
- [x] 生成样本矩阵覆盖正常、Unicode、符号链接、重复、并发、缺失、只读、取消、非 PDF 内容和三处中断点。
- [x] 更新 `scripts/research-windows-file-semantics.mjs` 以覆盖实际 content-store 行为；在兼容性记录中保留 Windows 待测状态和运行指令。

**验证：**

```bash
npx vitest run modules/research/src/files
node scripts/research-windows-file-semantics.mjs
```

第二条命令当前只在 macOS 记录路径语义基线；Windows NTFS 结果待用户之后运行同一测试模块。

### Task 4：实现隔离的 PDF 基础识别

**提交：** `feat(research): extract local pdf metadata safely`

- [x] `pdf-worker.mjs` 只加载 `pdfjs-dist/legacy`，读取嵌入元数据和第一页文本，不渲染页面、不建全文索引。
- [x] `pdf-extractor.ts` 以独立子进程运行 worker，设置超时、输出上限和强制终止；解析崩溃不得带倒本地 server。
- [x] 从嵌入字段、首页文本和文件名提取标题、作者、年份、DOI、arXiv ID 候选，并保留来源及观察时间。
- [x] 标识符规范化单独测试：DOI URL/prefix、arXiv 新旧格式、大小写、尾随标点和无效输入。
- [x] 生成最小 PDF fixtures：内嵌元数据、首页 DOI、首页 arXiv、扫描型无文本、损坏/截断、混乱文件名和不完整字段。
- [x] 解析失败只产生明确警告和人工确认入口，不回滚已经安全完成的 hash/存储阶段。
- [x] 256 MiB 大文件测试运行时生成并由 `RUN_RESEARCH_LARGE_FILE=1` 启用，验证流式 hash、取消和临时文件清理。

**验证：**

```bash
npx vitest run modules/research/src/ingest
RUN_RESEARCH_LARGE_FILE=1 npx vitest run modules/research/src/files/large-file.test.ts
```

### Task 5：实现外部元数据协调与字段保护

**提交：** `feat(research): add provenance-aware metadata lookup`

- [x] 定义统一 `MetadataProvider` 和可注入 `HttpClient`，生产代码使用 Node fetch，单元测试使用固定响应。
- [x] arXiv Atom 用 `fast-xml-parser` 解析并关闭实体处理。
- [x] DOI 流程先查 Crossref agency，再向 Crossref 或 DataCite 精确接口查询；OpenAlex DOI 精确结果只作补充候选。
- [x] 无可靠 ID 时，OpenAlex 标题/作者/年份和 Crossref bibliographic 只返回候选，不自动认定作品。
- [x] 实现每提供方限速、并发 1、8 秒超时、最多 2 次网络/429/5xx 重试并遵守 `Retry-After`。
- [x] 缓存 exact success；not-found 24 小时；transient failure 5 分钟。普通 4xx 不重试。
- [x] 持久化原始响应、解析版本、请求关键字和获取时间；不保存密钥，不发送 PDF。
- [x] 字段决策顺序为人工确认 > 精确外部 > 其他外部 > PDF embedded > 首页 > 文件名；同级冲突保留全部候选。
- [x] 用户确认写入新的人工 assertion 并选择为 current；刷新外部结果不能覆盖人工字段。
- [x] 第一次启用外部查询时通过 UI/API 返回将访问的服务及会发送的字段，用户可保持离线导入。
- [x] 固定响应覆盖成功、无结果、超时、429、500、无效 XML/JSON、重复刷新和人工字段保护。
- [x] 提供 opt-in 测试验证四个真实服务，只使用公开标识符样本并打印服务、状态和时间，不进入默认 `npm run check`。

**验证：**

```bash
npx vitest run modules/research/src/metadata modules/research/src/ingest/metadata.test.ts
RUN_RESEARCH_LIVE_METADATA=1 npx vitest run modules/research/src/metadata/live.test.ts
```

### Task 6：完成 A1 导入服务、API 和组合根

**提交：** `feat(research): complete import and recovery API`

- [x] 导入分为 `prepare → inspect → resolve duplicate → confirm → commit`，未确认前不创建正式 Work。
- [x] prepare 创建 ImportSession/Item；managed/link 进入相应文件阶段；inspect 组合本地与外部候选。
- [x] confirm 接受用户逐字段选择、作品归属、版本决策和目录列表，在一个数据库事务中建立或复用身份关系。
- [x] 同 hash 且已有明确归属时复用 Asset/Edition/Attachment；不同 hash 同 DOI 必须返回候选选择。
- [x] 提供最小文献库 API：列表/详情、目录创建与多目录归属、位置检查、重新定位、移除目录引用、移除附件、Work 回收/恢复/永久删除、对账。
- [x] 永久删除返回影响预览并要求确认 token；执行前重算引用，条件变化时拒绝。
- [x] 导入 prepare/confirm 使用 request ID；PUT 状态设置保持幂等，永久删除使用一次性影响确认 token。
- [x] 在 server 组合根注入动态 Repository、accountId、managedRoot 和 file picker，注册 research 迁移与路由。
- [x] 账号切换测试确认数据库与托管根一起切换，不跨账号复用 Asset 或引用计数。
- [x] 路由与 service 测试覆盖 A1-01 至 A1-11 的 API 可观察结果。

**验证：**

```bash
npx vitest run modules/research/src/server packages/server/src/app.test.ts packages/server/src/cross-module-contract.test.ts
```

### Task 7：接入 A1 最小 UI

**提交：** `feat(research): add trusted library import UI`

- [x] 在开始 UI 工作前读取并遵循仓库当前 frontend skill；保持现有 AppShell、主题、间距和组件语言。
- [x] 注册 `/research` 页面和导航项“文献库”。
- [x] 导入弹窗支持系统选文件、手工路径和 managed 上传；在确认前选择托管/链接模式。
- [x] 展示 hash/大小、PDF 本地识别、外部候选、字段来源和冲突；每个字段可人工修正或选择来源。
- [x] 重复候选明确提供现有版本、新版本、新作品、暂留和放弃，不放置自动合并捷径。
- [x] 文献库最小视图展示标题、作者/年份、目录、附件模式和 available/missing/changed/recycled 状态。
- [x] 两套布局共享同一数据与操作控制层，可在“紧凑”和“留白”之间切换并记住选择。
- [x] 目录侧栏支持创建目录、加入多个目录和只移除当前目录引用。
- [x] 缺失位置提供检查与重新定位；不同 hash 显示替换候选，不把按钮写成“恢复成功”。
- [x] 删除 UI 把移除目录引用、移除附件、Work 回收、永久删除分成四个动作，并展示实际影响。
- [x] API/UI 状态覆盖离线元数据、解析失败、并发复用和部分恢复；底层文件与 PDF 任务支持取消。
- [x] API client 使用 Vitest；`.tsx` 保持在当前测试收集规则之外，由 TypeScript、Vite build 和手动操作验收。
- [ ] 启动本地 server/web，实际操作一次 managed 导入、一次 linked 导入、双目录、缺失/重定位和回收/恢复。

**验证：**

```bash
npx vitest run modules/research/src/ui
npm run check
```

### Task 8：A1 验收、记录和边界提交

**提交：** `test(research): verify A1 trusted import milestone`

- [x] 将 A1-01 至 A1-11 映射到自动测试名称，生成一张通过/失败/手动待测矩阵。
- [x] 默认套件临时空间不超过 250 MiB；opt-in 256 MiB 测试单独运行并清理。200 文件专项属于 A2 批量导入，在 Task 9 执行。
- [x] 重跑目标规模基准，记录实际表结构的指标，不沿用技术验证原型数字。
- [x] 执行 `PRAGMA integrity_check`，检查 managed staging、对象目录和数据库引用没有孤儿。
- [x] 记录当前文件语义测试模块的 macOS 环境与结果，保留 Windows 未测及 PowerShell 指令。
- [x] 执行 `git fetch origin --prune`，检查 `origin/main` 和远端 feature 状态；不 push。
- [x] 在本文件勾选 A1 完成项，并依据实际文件和接口校准下面 A2 的逐文件步骤；只修正实施细节，不改变已确认的 A2 范围。
- [x] 运行 `npm run check`，确认工作区仅含预期修改后提交 A1 验收记录。

### A1 验收记录（2026-08-23）

自动验收使用仓库生成样本和独立临时库，不读取 `data/local`。A1 领域、文件、元数据、API 与 UI 构建已经通过；当前会话没有可连接的浏览器，因此两套布局的真实点击与视觉检查保留为手动待测，不能记录成已通过。

| 场景  | 状态     | 自动证据                                                                                                                                   |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A1-01 | 自动通过 | `content-store.test.ts`“流式 hash 后按 SHA-256 路径原子发布”；`service.test.ts`“托管导入建立完整领域关系、来源记录和多目录归属”            |
| A1-02 | 自动通过 | `content-store.test.ts`“重复与并发导入只保留一份内容”；`service.test.ts`“同 hash 再导入会给出精确候选，并可幂等挂回现有 Edition”           |
| A1-03 | 自动通过 | `content-store.test.ts`“保存用户路径与 realpath，不复制源文件”及符号链接用例；Windows 真机文件语义仍待测                                   |
| A1-04 | 自动通过 | `service.test.ts`“不同 hash 但 DOI 相同只返回作品候选，不自动合并”                                                                         |
| A1-05 | 自动通过 | `ingest/metadata.test.ts` 多来源保留；`sqlite-repository.test.ts` 人工 current 选择；`service.test.ts` 离线识别后只补查外部元数据          |
| A1-06 | 自动通过 | `metadata/client.test.ts` 网络错误、429、5xx、超时与普通 4xx；`metadata/coordinator.test.ts` 缓存、无结果与离线诊断                        |
| A1-07 | 自动通过 | `service.test.ts` 托管闭环中的双目录加入、单目录移除、附件与托管对象保留                                                                   |
| A1-08 | 自动通过 | `content-store.test.ts` 与 `service.test.ts` 的 missing、同 hash 恢复和不同 hash replacement candidate                                     |
| A1-09 | 自动通过 | `service.test.ts` 的目录移除、附件回收、Work 回收/恢复、链接/托管永久删除；`content-store.test.ts` 隔离、恢复和最终清理                    |
| A1-10 | 自动通过 | `files/reconcile.test.ts` 三个中断点；`service.test.ts` 孤立对象登记；上传重试和 staging 清理                                              |
| A1-11 | 自动通过 | `pdf-extractor.test.ts` 扫描型/损坏/超时；`content-store.test.ts` 只读/取消/非 PDF；`large-file.test.ts` 256 MiB 专项；损坏 PDF 文件名回退 |

手动 UI 待测范围固定为：紧凑/留白布局切换与持久化、浏览器 managed 上传、本机 managed/link 导入、双目录、missing/同 hash 与不同 hash 重新定位、附件移除、Work 回收/恢复/永久删除。生产构建命令已经通过：

```bash
npx vite build --config packages/web/vite.config.ts
```

正式表结构规模基准通过：

| 指标                     | 结果       | 阈值      |
| ------------------------ | ---------- | --------- |
| 生成 10k/20k 数据        | 651.09 ms  | 仅作记录  |
| 数据库大小               | 30.87 MiB  | ≤100 MiB  |
| 进程 RSS                 | 188.81 MiB | ≤250 MiB  |
| 列表查询 p95             | 2.35 ms    | ≤100 ms   |
| 维护查询 p95             | 5.29 ms    | ≤250 ms   |
| 1,000 次 hash 查询       | 2.30 ms    | ≤100 ms   |
| 200 条元数据写入事务     | 1.13 ms    | ≤1,000 ms |
| `PRAGMA integrity_check` | 189.60 ms  | ≤2,000 ms |

默认套件使用独立 `TMPDIR` 重跑时通过 126 个测试文件、跳过 3 个；1254 个测试通过、3 个跳过。采样到的临时空间峰值为 6.12 MiB，结束后剩余 1.48 MiB 编译缓存和其他模块测试夹具，整个测试根随后移入废纸篓。256 MiB 专项使用稀疏源文件并在 16 MiB 前后取消，staging 和测试根由测试清理。

文件语义模块本轮环境为 macOS 15.7.7 / Darwin 24.6.0、arm64、APFS、Node.js 25.1.0。`content-store.test.ts` 17 项通过，兼容脚本 `--smoke` 7 项通过、0 项失败。Windows 和 Linux 未实测；Windows 保持以下命令：

```powershell
node .\scripts\research-windows-file-semantics.mjs
node .\scripts\research-windows-file-semantics.mjs --root "D:\research-validation"
node .\scripts\research-windows-file-semantics.mjs --root "\\server\share\research-validation"
```

边界 fetch 后 `origin/main` 没有本分支尚未包含的新提交；本地分支未 push。

## A2：完整文献库治理与迁移出口

### A1 边界后的实施校准

- A1 已经建立 21 张切片 A 基础表，A2 继续使用现有 migration 账本；只有 FTS5、搜索触发器和确有新增语义时才增加后续迁移。
- 浏览器 managed 上传已经采用单文件 `application/pdf` 流；A2 批量上传逐文件复用该入口，本机路径批量导入复用 `multiple: true` 文件选择器。
- 现有 `ResearchService`、`ResearchRepository` 和 `/api/research/v1` 继续作为服务边界；A2 的 `library/**` 与 `interop/**` 提供领域算法，不另起第二套数据访问层。
- 紧凑版与留白版共用 `ResearchLibraryPage` 控制层和所有 mutation。A2 新增导入箱、治理、检索与导出时，两套布局保持功能一致，只调整信息编排，直到用户比对后保留一套。
- A1 当前列表只按标题和年份筛选；作者、摘要、标识符、标签与结构化过滤统一由 Task 12 的 FTS5/过滤查询完成。

### Task 9：完成导入箱、批量导入和无附件记录

**提交：** `feat(research): add inbox and batch ingestion`

- [x] 扩展 ImportSession 支持最多 200 个条目、逐条进度、取消、失败重试和批次恢复。
- [x] 批量路径选择复用本地 server 文件选择器多选能力；managed 上传保留逐文件流式入口。
- [x] 导入箱保存草稿、候选重复、元数据待确认和失败状态；未确认草稿不出现在正式文献库。
- [x] 支持创建无附件 Work、手工元数据记录和 `unknown` 类型；后续可追加 Edition 与附件。
- [x] 支持 PDF、supplement、dataset、code、web-snapshot、other 等通用附件角色，不假设每个附件都可阅读。
- [x] 200 个生成小文件覆盖整批确认、部分失败、取消、重启恢复和重复候选分组。
- [x] UI 提供批次级筛选、逐项修正和明确的“提交已确认条目”，不因一条失败回滚整批已确认项；紧凑版与留白版共用同一控制层。

**验证：**

```bash
npx vitest run modules/research/src/ingest modules/research/src/server/batch-routes.test.ts
RUN_RESEARCH_BATCH=1 npx vitest run modules/research/src/ingest/batch-acceptance.test.ts
```

**验收记录（2026-08-23，macOS）：** 默认 research 模块 16 个测试文件通过、4 个 opt-in 文件跳过，共 115 项通过；200 文件专项 1 项通过，耗时 34.31 秒。专项包含 20 组相同内容、1 条先失败后由新 service 实例重试、200 条整批确认，以及取消批次的重启后状态检查。生产 Vite 构建通过。Windows 的批量选择、取消占用文件和路径语义仍按平台测试说明待测。

### Task 10：完成层级目录和作品关系

**提交：** `feat(research): add library organization workflows`

- [ ] 目录以 parentId 保存任意层级，支持同父级唯一命名、排序、移动和批量归档。
- [ ] 删除目录前选择把子目录/条目移到父级、移到未分类或取消；任何选择都不删除 Work/Attachment/Asset。
- [ ] 系统视图覆盖全部、未分类、回收站、缺失文件、待确认元数据和重复候选。
- [ ] 支持 Work 间 manual related/extends/revises/cites 等关系，双向展示但保留有向语义。
- [ ] Work 回收采用软删除并保留关系；恢复时重显可用关系，缺失附件单独报告。
- [ ] 批量加入目录、移出目录、回收和恢复使用同一影响预览与结果摘要。
- [ ] API 与 UI 测试覆盖多层目录、多目录归属、删除目录不删文件和部分恢复。

**验证：**

```bash
npx vitest run modules/research/src/library/collections.test.ts modules/research/src/library/relations.test.ts modules/research/src/server/library-routes.test.ts
```

### Task 11：完成标签治理和可撤销合并

**提交：** `feat(research): add reversible tag and work governance`

- [ ] 标签支持规范名、别名、颜色、说明、批量分配和按使用量排序。
- [ ] 近似标签只提示；规范化只用于候选检索，不自动合并。
- [ ] 标签合并保留旧名为 alias，记录转移关系和完整快照；撤销恢复原标签与作品关系。
- [ ] 标签删除进入可撤销回收状态；永久清理前显示使用数与别名影响。
- [ ] Work 合并必须由用户选择 survivor、版本归属和冲突字段；保留旧 ID 重定向、外部映射和 MergeRecord。
- [ ] Work 合并撤销恢复原记录、版本、目录、标签、关系和来源；永久清理前不得丢失撤销材料。
- [ ] 合并操作使用事务和乐观版本；并发变化时停止并要求重新预览。
- [ ] UI 分别提供标签候选与作品重复审查，不把相似度显示成确定性结论。

**验证：**

```bash
npx vitest run modules/research/src/library/tags.test.ts modules/research/src/library/duplicates.test.ts modules/research/src/server/governance-routes.test.ts
```

### Task 12：完成结构化检索、模糊搜索和保存查询

**提交：** `feat(research): add structured library search`

- [ ] 新迁移建立 FTS5 搜索表和同步触发器；重建命令可以从规范表恢复索引。
- [ ] 搜索覆盖标题、作者、摘要、出版信息和标识符；结构化过滤覆盖目录、标签、类型、年份、附件角色、存储模式和文件状态。
- [ ] 维护过滤覆盖缺失字段、缺失/变化文件、重复候选、元数据失败和未完成导入。
- [ ] 模糊搜索返回稳定 score 与命中字段；低分结果不进入自动操作。
- [ ] 保存查询使用版本化 JSON AST，作为 smart collection 执行；未知版本明确拒绝，不解释为普通文本。
- [ ] keyset 分页与稳定排序在并发新增记录时不重不漏。
- [ ] 10k/20k 正式表结构上验证普通查询 p95 ≤100ms、维护查询 p95 ≤250ms、DB ≤100MiB、RSS ≤250MiB、integrity ≤2s。
- [ ] UI 提供单一搜索入口、可展开过滤器、保存查询和系统维护视图。

**验证：**

```bash
npx vitest run modules/research/src/library/search.test.ts modules/research/src/storage/search-index.test.ts
RUN_RESEARCH_SCALE=1 npx vitest run modules/research/src/storage/scale.test.ts
```

### Task 13：完成规范导出和迁移包

**提交：** `feat(research): add portable library export`

- [ ] 定义带 `schemaVersion` 的 canonical JSON，覆盖 Work、Edition、Contributor、Identifier、Collection、Tag/Alias、WorkRelation、SourceRecord、MetadataAssertion、Asset、Location 和 Attachment。
- [ ] 原始来源响应按 provider/record 独立保存；无法映射字段不静默丢失。
- [ ] manifest 为每个附件记录 hash、大小、MIME、角色、原位置模式、导出相对路径和 missing 状态。
- [ ] 用户可选仅 JSON、附托管文件、附可访问链接文件；缺失和复制失败进入报告，不伪装成完整包。
- [ ] 导出文件先写临时目录，JSON 和所选文件全部校验后原子发布最终目录/归档；取消清理临时产物。
- [ ] 导出不修改原数据库关系或链接源文件。
- [ ] 提供同版本 round-trip 验证器：在新临时库导入 canonical JSON，比较稳定 ID、关系、来源和 hash 清单。
- [ ] 当前 A2 只实现规范 JSON/manifest 迁移包；BibTeX、RIS、CSL JSON 具体格式适配仍留给切片 D。
- [ ] UI 展示包含内容、预计大小、缺失项、目标路径、进度和最终校验报告。

**验证：**

```bash
npx vitest run modules/research/src/interop modules/research/src/server/export-routes.test.ts
```

### Task 14：完成 A2 管理 UI 和切片 A 端到端验收

**提交：** `feat(research): complete trusted library management UI`

- [ ] 将导入箱、文献库、维护视图、回收站组织为同一路由下的清晰工作区，不引入 PDF 阅读器界面。
- [ ] Work 详情展示版本、附件、位置、来源、目录、标签、关系和外部映射；各编辑动作保留字段级来源。
- [ ] 批量工具栏只在有选择时出现，执行前显示影响范围，完成后给出成功/失败逐项摘要。
- [ ] 回收站支持 Work/Attachment/Tag 恢复和永久清理，默认不自动过期。
- [ ] 重复审查、标签合并和导出均支持取消，不把长任务锁死在模态框。
- [ ] 键盘、窄屏、长标题、无作者、多版本、缺失附件和大量标签保持可操作。
- [ ] 完整用户操作验证覆盖：批量导入 → 确认元数据 → 多目录/标签 → 搜索/保存查询 → 缺失重定位 → 合并/撤销 → 回收/恢复 → 迁移导出。
- [ ] 明确检查 A2 没有夹带 PDF 阅读器、OCR、AI、批注、证据链或具体引用格式适配器。

**验证：**

```bash
npx vitest run modules/research
npm run check
```

### Task 15：完整切片 A 审计与最终本地提交

**提交：** `test(research): complete slice A acceptance`

- [ ] 对照设计 §17.1 的 15 个切片 A 场景逐项记录自动测试、手动测试或平台待测证据。
- [ ] 默认测试、200 文件专项、10k/20k 规模、opt-in 256 MiB 文件分别运行，记录空间与清理结果。
- [ ] 在当前开发平台重跑所有发生变更的平台相关测试模块；另一平台保持准确的已测/待测记录和命令。
- [ ] 启动真实本地应用完成一次从导入到迁移包的操作验收，确认数据库和 managed root 均位于测试账号/临时根。
- [ ] 执行 `npm run check`、migration 重跑、`integrity_check` 和孤儿文件审计。
- [ ] 执行 `git fetch origin --prune`，检查远端差异并报告；不 push、不改写已有提交。
- [ ] 检查 `git status`、提交序列和每个分段提交的范围，确认没有用户无关改动、测试产物或真实论文文件进入 Git。
- [ ] 更新本文件复选框和设计文档中的实际验证状态、测试指令及切片 A 完成记录。

## 完成定义

完整切片 A 只有同时满足以下条件才算完成：

- A1-01 至 A1-11 全部有可重复证据，平台相关未测项明确限定到对应测试模块。
- 设计 §17.1 的 15 个切片 A 场景全部通过或有准确、非阻塞的外部平台待测说明。
- 本地应用中可以完成导入、确认、管理、检索、恢复和迁移导出，不需要 PDF 阅读器、OCR 或 AI。
- 10k Work / 20k Asset 基准与默认 250 MiB 临时空间边界达标。
- `npm run check`、数据库完整性检查和文件孤儿审计通过。
- Git 历史由分段绿色提交组成，工作区干净；只存在本地提交，没有 push。
