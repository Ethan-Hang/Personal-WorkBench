# Research Workbench Slice C Implementation Plan

**Goal:** 连续完成 C1“来源与证据”、C2“观点与对照”和 C3“写作与交付”，把 PDF 批注整理为可复用证据、可核查观点、跨论文矩阵和带来源链接的写作材料。

**Architecture:** `modules/research` 继续拥有全部 Research 领域数据。切片 C 新增独立 `knowledge/**` 领域与 `SqliteKnowledgeRepository`，通过同一账号 SQLite 连接读取 B 的批注和 A 的作品身份；现有 `ResearchService` 只在上下文归档、作品合并、永久删除和规范导出等跨生命周期操作上接入知识引用。浏览器中的单篇阅读器负责提炼证据和来源回跳，`/research/knowledge` 负责跨论文整理。SQLite 与 FTS5 仍只出现在 `storage/**`，core 和其他业务模块不感知笔记、证据、观点或矩阵。

**Tech Stack:** TypeScript strict、Node.js 22+、Fastify 5、SQLite/better-sqlite3、Drizzle ORM、Zod 4、React 19、TanStack Query 5、React Router 7、Tailwind CSS 4、Vitest 4。切片 C 不新增运行依赖。

**Spec:** `docs/superpowers/specs/2026-08-21-research-workbench-design.md` §11.2、§16“切片 C”、§17.8–§17.9。

**Status:** 已确认，实施中。C1 和 C2 已完成，下一步进入 C3 写作与交付。

## 执行方式

- 本文件是完整切片 C 的唯一实施计划，按 C1 → C2 → C3 连续实施，不再为阶段拆分计划文件。
- 每个 Task 形成一个可运行、可验证的本地提交；不 push。提交前只暂存当前 Task 的文件，不混入用户已有改动。
- 每个提交后检查周额度。剩余低于 33% 时只完成当前检查点和必要文档，不开启新 Task；到 30% 时停止推进并保留可继续状态。运行环境无法读取额度百分比时明确记录，不用 token 数量推算周额度。
- 开工前、C1 完成后、C2 完成后和最终验收前执行 `git fetch origin --prune`。发现远端领先时先报告，不自动合并、变基或推送。
- 每个阶段采用后端主导的垂直闭环：先稳定契约、迁移、Repository、Service 和路由，随即接入该能力的最小 UI，不长期积压只有后端可用的功能。
- C 的 CRUD、来源状态和矩阵操作放入独立 `ResearchKnowledgeService`。不要把这些方法继续加入现有 `ResearchService`；跨 A/B/C 的删除、合并、归档和规范迁移才由现有服务协调。
- `SqliteKnowledgeRepository` 使用动态 `getSqlite()`，账号切换后自动指向当前账号数据库。它不继承或包装 `SqliteResearchRepository`，两者只共享数据库连接和稳定 ID。
- Repository 暴露领域操作，不暴露 SQL 行或通用 CRUD。`knowledge/**`、`server/**` 和 `ui/**` 不得 import Drizzle、SQLite 或 `@workbench/data`。
- UI Task 开始前加载并遵循 `frontend-skill`。Research 内部导航、知识页和阅读器入口形成一套完整信息结构，不改 WorkBench 全局外壳及其他模块。
- 自动测试使用固定 ID、临时 SQLite、B 的生成 PDF 和 OCR 代理。私有论文、正文、文件名、绝对路径、浏览器 profile 和截图不进入 Git。
- 兼容性按测试模块记录。纯契约、领域与 SQLite 测试不重复整条双平台流程；文件输出、系统选择器和真实浏览器来源回跳在声明相应模块双平台兼容前分别补测。

## 稳定领域语义

### 上下文归属

- 通用层继续用 `contextId: null` 表示；命名上下文使用现有 `research_reading_contexts`，不创建 `ResearchProject` 或通用层伪记录。
- 笔记、证据、观点、矩阵和写作板各自只属于一个当前上下文。证据快照另存创建来源上下文，并可由其他上下文的观点、矩阵和写作板引用。
- 创建或更新命名上下文中的 C 对象时，Repository 必须确认上下文为 `active`。归档上下文中的对象只读、可检索、可导出；恢复上下文后重新可编辑。
- 上下文迁移必须在一个 SQLite 事务内移动批注与全部 C 对象的当前归属。证据的创建来源快照保持不变。

### 来源快照和来源状态

- 每张证据必须引用一条批注。直接从文本或区域创建证据时，批注与证据在同一 Repository 事务内创建。
- 快照保存 `Work / Edition / Asset / Annotation / ReadingContext` ID、页码、页面尺寸、rect/quad、原文和上下文指纹、来源类型、批注 revision、Asset hash 与提取时间。
- 当前来源链接与创建快照分开存储。证据正文更新不改快照；显式重新绑定才更新当前链接并产生 revision，旧快照保留在 revision 历史中。
- 来源状态由当前数据与快照比较得到，不接受客户端自行声明：

```text
current
annotation-revised
annotation-deleted
asset-mismatch
source-unavailable
```

- 状态采用最严重结果：Asset hash 不一致优先于批注 revision 差异；文件没有可用位置时为 `source-unavailable`；批注 tombstone 为 `annotation-deleted`。
- OCR 证据保存 `sourceKind: ocr`。OCR 索引重建不改快照；当前 OCR 版本或文本变化时进入需要复核状态。

### revision、tombstone 和关系

- 笔记和证据状态为 `active / deleted`；观点状态为 `draft / active / archived / deleted`；矩阵与写作板状态为 `active / archived / deleted`。
- 每个可编辑实体从 revision 1 开始。更新、删除、恢复、归档、重新绑定和结构调整都要求 `expectedRevision`；冲突返回当前对象。
- `research_knowledge_revisions` 保存变更前快照、实体类型、revision、原因和时间。快照不保存无法重建的派生候选列表。
- 笔记资源链接、观点证据关系、矩阵证据和写作引用拥有稳定 ID 与 tombstone。解除关系只删除关系，不删除两端对象。
- 恢复对象时不强行恢复不可用关系。两端可用时关系恢复显示；另一端仍删除、归档或缺失时显示明确状态。

### 观点和矩阵

- 观点可以没有证据，但保持 `draft` 或显示“尚无证据”。观点证据关系只允许 `supports / refutes / qualifies`，关系类型属于连接而非证据本身。
- 矩阵列稳定关联 `Work`。行是关联 `Claim` 的观点行，或带标题与问题的比较维度行。
- 单元格保存人工综合说明和用户显式选中的证据链接。候选证据由 Repository 按行、列和现有关系动态计算，不写入真源。
- 单元格保存最后复核时依赖的观点 revision、证据 revision 和来源状态摘要。依赖变化后返回 `needs-review`，用户确认后才更新复核基线。
- 行、列和单元格使用稳定 ID 和排序值。移除行列写 tombstone，不把矩阵实现成可任意计算的电子表格。

### 写作、检索和输出

- 写作板由标题、排序章节和排序块组成。块类型为普通文本、笔记引用、证据引用、观点引用或矩阵引用；引用块使用显式外键，不把资源复制成普通文本。
- 笔记、证据、观点和写作正文进入统一 `research_knowledge_search` 内容表与 FTS5。搜索结果保留实体 ID、上下文、可选 Work、状态和来源可用性。
- Markdown/CSV 写入目标同目录临时文件，完成编码、行列数和内容摘要检查后原子发布。已有目标先预览并要求覆盖确认；失败恢复旧目标并清理临时文件。
- Markdown 来源标记使用作品标题、页码和稳定 ID/内部链接。正式 CSL 引用、DOCX 和 LaTeX 不进入 C。

### 上游删除、合并和规范迁移

- 有效证据、矩阵列和写作引用进入作品/附件永久删除影响预览。仍存在有效知识引用时，Repository 拒绝最终删除；用户先解除、删除或重新绑定相关对象。
- 作品回收不改变知识数据。作品合并在现有 merge 事务中更新证据当前 `workId` 与矩阵列，并在来源快照中保留原 ID；撤销合并按 merge snapshot 恢复当前关系。
- 规范迁移升级为 schema v2，覆盖 A 的作品与文件索引、B 的上下文/阅读状态/批注及 revision、C 的全部真源数据。页文本、OCR 缓存、导出任务和 FTS 是派生数据，不进入规范 JSON。
- v1 文件继续可读，缺失的 B/C 集合按空集合升级；不改写原文件。v2 导入先完整验证，再导入没有 Research 数据的新账号或空数据库；非空目标只返回冲突预览，不猜测合并语义。
- 带附件包先在 staging 校验 manifest、hash 和大小，再提交数据库与托管文件。缺失附件作为不可用 Location 报告，不能阻止知识数据恢复。

## 数据模型

### C1 表

| 表                              | 主要职责                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `research_notes`                | 上下文内的标题、正文、状态、revision 和 tombstone                                                 |
| `research_evidence`             | 当前上下文与来源外键、不可静默覆盖且含创建来源上下文的快照、标题、摘要、研究说明、状态和 revision |
| `research_note_links`           | 笔记到 Work、Annotation、Evidence 或 Claim 的显式资源链接                                         |
| `research_knowledge_revisions`  | C 对象和关系的变更前快照、原因与时间                                                              |
| `research_knowledge_search`     | 可重建的统一搜索内容与结构化筛选字段                                                              |
| `research_knowledge_search_fts` | 笔记、证据、观点和写作正文 FTS5                                                                   |

### C2 表

| 表                              | 主要职责                                                  |
| ------------------------------- | --------------------------------------------------------- |
| `research_claims`               | 上下文观点、说明、状态和 revision                         |
| `research_claim_evidence`       | 支持、反驳或限定关系、关系说明、revision 和 tombstone     |
| `research_matrices`             | 上下文矩阵标题、说明、状态和结构 revision                 |
| `research_matrix_columns`       | 有序 Work 列和 tombstone                                  |
| `research_matrix_rows`          | 有序观点行或比较维度行和 tombstone                        |
| `research_matrix_cells`         | 行列唯一单元格、人工综合、复核基线、revision 和 tombstone |
| `research_matrix_cell_evidence` | 单元格显式证据关系和 tombstone                            |

### C3 表

| 表                           | 主要职责                                          |
| ---------------------------- | ------------------------------------------------- |
| `research_writing_documents` | 上下文写作板标题、状态和 revision                 |
| `research_writing_sections`  | 有序章节、标题、revision 和 tombstone             |
| `research_writing_blocks`    | 有序文本块或显式资源引用块、revision 和 tombstone |

外键默认 `RESTRICT`，只对真正从属且没有独立身份的行使用 `CASCADE`。所有 polymorphic 关系都用互斥的显式外键列和 `CHECK` 保证恰好一个目标，不使用只有 `target_type + target_id`、无法由 SQLite 校验的松散关系。

## API 契约

`contract.ts` 增加以下版本化入口，所有请求和响应继续由 Zod 严格解析：

- `/api/research/v1/knowledge/summary`、`/knowledge/search`
- `/notes`、`/notes/:id`、`/notes/:id/restore`、`/notes/:id/revisions`
- `/evidence`、`/evidence/:id`、`/evidence/:id/rebind`、`/evidence/:id/restore`、`/evidence/:id/revisions`
- `/claims`、`/claims/:id`、`/claims/:id/restore`、`/claims/:id/evidence`
- `/claim-evidence/:id`、`/claim-evidence/:id/restore`
- `/matrices`、`/matrices/:id`、`/matrices/:id/structure`、`/matrices/:id/candidates`
- `/matrix-cells/:id`、`/matrix-cells/:id/evidence`、`/matrix-cells/:id/review`
- `/writing-documents`、`/writing-documents/:id`、`/writing-documents/:id/structure`
- `/knowledge/exports/preview`、`/knowledge/exports/pick-target`、`/knowledge/exports`
- `/canonical-imports/preview`、`/canonical-imports`

列表接口统一使用游标或稳定分页、上下文过滤、状态过滤和明确上限。详情响应返回当前 revision、引用状态和可用操作；绝对磁盘路径只在用户确认的本地输出预览中出现，不进入来源链接、日志或浏览器持久状态。

## 计划文件清单

### 领域、存储与服务端

- Modify: `modules/research/src/contract.ts`
- Modify: `modules/research/src/contract.test.ts`
- Modify: `modules/research/src/storage/schema.ts`
- Modify: `modules/research/src/storage/sqlite-repository.ts`
- Modify: `modules/research/src/storage/canonical-roundtrip.ts`
- Modify: `modules/research/src/testing/harness.ts`
- Create: `modules/research/migrations/0006_research_knowledge_sources.sql`
- Create: `modules/research/migrations/0007_research_claims_and_matrices.sql`
- Create: `modules/research/migrations/0008_research_writing.sql`
- Create: `modules/research/src/knowledge/repository.ts`
- Create: `modules/research/src/knowledge/service.ts`
- Create: `modules/research/src/knowledge/source-state.ts`
- Create: `modules/research/src/knowledge/errors.ts`
- Create: `modules/research/src/storage/sqlite-knowledge-repository.ts`
- Create: `modules/research/src/interop/knowledge-export.ts`
- Create: `modules/research/src/interop/canonical-import.ts`
- Modify: `modules/research/src/interop/canonical.ts`
- Modify: `modules/research/src/interop/portable-export.ts`
- Create: `modules/research/src/server/knowledge-routes.ts`
- Create: `modules/research/src/server/knowledge-export-routes.ts`
- Create: `modules/research/src/server/canonical-import-routes.ts`
- Modify: `modules/research/src/server/file-picker.ts`
- Modify: `modules/research/src/server/service.ts`
- Modify: `modules/research/src/server/repository.ts`
- Modify: `modules/research/src/server/index.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `modules/research/package.json`

`package-lock.json` 预计不变；切片 C 不新增依赖。只有实现证明现有依赖无法满足已确认能力时，先停下说明，不在普通 Task 中顺手改依赖。

### UI

- Modify: `modules/research/src/ui/index.tsx`
- Modify: `modules/research/src/ui/api.ts`
- Modify: `modules/research/src/ui/api.test.ts`
- Modify: `modules/research/src/ui/ResearchLibraryPage.tsx`
- Modify: `modules/research/src/ui/reader/ResearchReaderPage.tsx`
- Modify: `modules/research/src/ui/reader/ReaderWorkspace.tsx`
- Modify: `modules/research/src/ui/reader/ReaderSidePanel.tsx`
- Modify: `modules/research/src/ui/reader/PdfViewport.tsx`
- Create: `modules/research/src/ui/components/ResearchSectionNav.tsx`
- Create: `modules/research/src/ui/knowledge/ResearchKnowledgePage.tsx`
- Create: `modules/research/src/ui/knowledge/KnowledgeWorkspace.tsx`
- Create: `modules/research/src/ui/knowledge/KnowledgeSidebar.tsx`
- Create: `modules/research/src/ui/knowledge/NoteEditor.tsx`
- Create: `modules/research/src/ui/knowledge/EvidenceInbox.tsx`
- Create: `modules/research/src/ui/knowledge/EvidenceComposer.tsx`
- Create: `modules/research/src/ui/knowledge/SourceStatus.tsx`
- Create: `modules/research/src/ui/knowledge/ClaimBoard.tsx`
- Create: `modules/research/src/ui/knowledge/ComparisonMatrixEditor.tsx`
- Create: `modules/research/src/ui/knowledge/WritingBoard.tsx`
- Create: `modules/research/src/ui/knowledge/KnowledgeSearch.tsx`
- Create: `modules/research/src/ui/knowledge/KnowledgeExportDialog.tsx`

组件文件可根据实现后的真实职责小幅合并；不能把矩阵和写作板塞进单篇阅读器侧栏，也不能把 C 变成新的顶层业务模块。

### 验证入口

- Create: `modules/research/src/storage/knowledge-migrations.test.ts`
- Create: `modules/research/src/storage/knowledge-repository.test.ts`
- Create: `modules/research/src/storage/knowledge-scale.test.ts`
- Create: `modules/research/src/knowledge/service.test.ts`
- Create: `modules/research/src/knowledge/source-state.test.ts`
- Create: `modules/research/src/server/knowledge-routes.test.ts`
- Create: `modules/research/src/server/knowledge-export-routes.test.ts`
- Create: `modules/research/src/server/canonical-import-routes.test.ts`
- Create: `modules/research/src/interop/knowledge-export.test.ts`
- Modify: `modules/research/src/interop/canonical.test.ts`
- Modify: `modules/research/src/interop/portable-export.test.ts`
- Create: `modules/research/src/acceptance/slice-c-workflow.test.ts`
- Create: `scripts/research-knowledge-visual-qa.mjs`
- Create: `scripts/research-knowledge-compat.mjs`

## C1：来源与证据

### Task 1：建立 C 契约、C1 迁移和独立 Knowledge Repository

**提交：** `feat(research): add knowledge source domain`

- [x] 在 `contract.ts` 增加知识 API、上下文引用、笔记、证据、来源快照、来源状态、revision、关系和分页 schema。
- [x] `0006` 建立 C1 表、显式外键、唯一约束、状态 `CHECK`、revision 约束、搜索内容表和 FTS5 同步触发器。
- [x] `schema.ts` 与实际迁移保持一致；迁移重跑幂等，现有 A/B 数据不需回填伪造证据。
- [x] 定义窄 `KnowledgeRepository`，把事务级“创建批注并创建证据”作为一个领域操作。
- [x] 实现独立 `SqliteKnowledgeRepository(getSqlite, clock)`，测试账号连接切换、通用层 `NULL`、上下文归档拒绝和 revision 冲突。
- [x] 更新 boundary 测试，确认 `knowledge/**` 不依赖 SQLite/Drizzle/data，存储实现不泄露到服务或 UI。

**验证：**

```bash
npx vitest run modules/research/src/contract.test.ts modules/research/src/storage/knowledge-migrations.test.ts modules/research/src/storage/knowledge-repository.test.ts packages/core/src/eslint.boundaries.test.ts
npm run typecheck
```

### Task 2：实现研究笔记、证据和来源回跳 API

**提交：** `feat(research): create traceable evidence`

- [x] `ResearchKnowledgeService` 实现笔记创建/更新/删除/恢复、资源链接和证据列表/详情。
- [x] 支持从现有批注提炼证据；验证 Annotation、Asset、Edition、Work 和上下文的当前关系后生成服务器端来源快照。
- [x] 支持文本、区域、图表、书签和 OCR 来源；文本保留 exact/prefix/suffix/fingerprint，非文本来源要求证据说明。
- [x] 直接提炼在一个事务中创建正常批注与证据；失败注入测试确认不存在孤立批注或半条证据。
- [x] `knowledge-routes.ts` 注册笔记和证据 API，统一稳定错误码、Zod 校验和 revision 冲突响应。
- [x] 来源回跳响应只返回 Asset、页码、anchor、上下文和当前状态，不返回磁盘路径；阅读器深链接使用稳定查询参数。

**验证：**

```bash
npx vitest run modules/research/src/knowledge/service.test.ts modules/research/src/server/knowledge-routes.test.ts
```

### Task 3：完成来源变化、重新绑定和跨生命周期保护

**提交：** `feat(research): preserve evidence provenance`

- [x] `source-state.ts` 计算五种来源状态和严重度，覆盖批注 revision、tombstone、Asset hash、位置可用性和 OCR 版本。
- [x] 证据重新绑定先返回旧快照、新来源和差异预览；确认时要求证据与目标批注 revision，写 revision 后更新当前来源。
- [x] 扩展上下文归档预览。含 C 数据时 `keep-archived` 冻结整套知识；迁移策略在同一事务移动批注与当前知识归属。
- [x] 扩展作品、附件和 Asset 永久删除预览，把有效证据列入影响并由 Repository 二次检查阻止竞态删除。
- [x] 作品合并与撤销在原事务中更新/恢复证据当前 Work，来源快照保持原 ID。
- [x] 测试 Work 回收、恢复、合并、撤销、附件移除、上下文归档/迁移和并发状态变化。

**验证：**

```bash
npx vitest run modules/research/src/knowledge/source-state.test.ts modules/research/src/annotation/service.test.ts modules/research/src/library/management.test.ts modules/research/src/library/duplicates.test.ts modules/research/src/server/service.test.ts
```

### Task 4：接入阅读器证据提炼和知识页 C1 界面

**提交：** `feat(research): open evidence workspace`

- [x] 加入 Research 内部“文献库 / 研究知识”导航和懒加载 `/research/knowledge` 路由，不增加 WorkBench 顶层模块。
- [x] 阅读器从已有批注创建证据，也可把当前文本选择或区域直接交给 Evidence Composer；提交期间锁定来源上下文和 anchor。
- [x] 阅读器显示创建结果和来源状态；从知识页回跳时打开正确 Asset、页码、上下文和批注，缩放/旋转后仍按 PDF 坐标定位。
- [x] 知识页首版完成上下文切换、笔记列表/编辑、证据箱、来源状态、删除恢复和来源预览。
- [x] 通用证据在命名上下文中复用时只创建关系；UI 显示来源上下文，不复制证据卡片。
- [x] 390 像素使用抽屉和单列编辑；键盘焦点不被 PDF 文本层或浮层截断。

**验证：**

```bash
npx vitest run modules/research/src/ui/api.test.ts modules/research/src/ui/reader modules/research/src/knowledge
npm run typecheck
npm run dev
```

最后一条用于真实浏览器操作，不作为后台常驻进程留在检查点之后。

### Task 5：完成 C1 来源闭环验收

**提交：** `test(research): verify evidence milestone`

- [x] 自动覆盖设计 C-01、C-02、C-03、C-06、C-07 的服务、SQLite 和 API 证据。
- [x] 使用生成 PDF 文本层、区域锚点和 OCR 代理完成真实浏览器创建与回跳；不需要私有 PDF 才能验收。
- [x] 四种宽度分别使用全新状态截图，覆盖空证据、长文本、来源修订、来源删除、Asset 不匹配和来源不可用。
- [x] 运行迁移重跑、`foreign_key_check`、`integrity_check`、FTS 对账和临时产物检查。
- [x] 更新本计划的真实命令、平台、浏览器和验收结果；执行 `git fetch origin --prune`。

**验证：**

```bash
node scripts/research-knowledge-compat.mjs --phase c1 --browser
npm run check
```

**阶段记录（2026-08-30，macOS）：** `research-knowledge-compat.mjs --phase c1 --browser`
在 Apple M3、24 GiB、APFS、Node.js 25.1.0 和 Microsoft Edge 152.0.4191.53 下通过。
C1 模块集 35 项测试通过；浏览器用生成 PDF 实际创建文字、区域和 OCR 三类证据，完成笔记关系与来源回跳，
并用全新 profile 生成 1440、1024、768、390 四宽度和 390 空状态截图。整仓 1531 项测试通过、
4 项按原条件跳过。迁移重跑、外键、SQLite 完整性、FTS 对账和临时数据清理通过；私有 PDF 不参与验收。
Windows 11 x64 的 C1 领域与 UI 模块保持 `not-run`，运行同一命令后再更新平台结论。

## C2：观点与对照

### Task 6：实现观点和支持/反驳/限定关系

**提交：** `feat(research): connect claims and evidence`

- [x] `0007` 建立观点、观点证据、矩阵、行、列、单元格和单元格证据表，所有状态、目标类型和排序值有约束。
- [x] `0007` 同步扩展笔记资源链接的 Claim 目标约束，迁移保留 C1 已有 Work、Annotation 和 Evidence 链接。
- [x] Repository 和 Service 实现观点 CRUD、草稿/使用中/归档、revision、tombstone 与三类证据关系。
- [x] 一张证据可服务多个观点和上下文；建立关系时不修改证据来源上下文或内容。
- [x] 无证据观点可以保存但始终返回 `evidenceCount: 0`；转为使用中不伪造“已支持”状态。
- [x] API 覆盖关系创建、改类型、改说明、解除与恢复；并发更新返回当前关系。
- [x] 搜索内容表开始接收观点正文和说明，删除/恢复后 FTS 同步。

**验证：**

```bash
npx vitest run modules/research/src/storage/knowledge-migrations.test.ts modules/research/src/storage/knowledge-repository.test.ts modules/research/src/knowledge/service.test.ts modules/research/src/server/knowledge-routes.test.ts
```

macOS arm64 定向验证通过：4 个文件、20 项测试通过；`typecheck`、`eslint --quiet` 和 `git diff --check` 通过。Windows 11 x64 保持 `not-run`，按 C2 模块脚本统一补测。

### Task 7：实现混合跨论文矩阵和复核状态

**提交：** `feat(research): compare evidence across papers`

- [x] 实现矩阵创建、标题说明、归档恢复、Work 列、观点/比较维度行、排序和结构 revision。
- [x] 行列组合保持唯一单元格；单元格人工综合与证据选择分别保存，候选证据动态计算。
- [x] 观点行候选来自该观点关系和当前 Work；比较维度行候选来自用户在该单元格已选证据及同 Work 可用证据。
- [x] 保存复核基线并计算 `current / needs-review`；证据、观点 revision 或来源状态变化都会使相关单元格过期。
- [x] Work 合并合并重复列并保留顺序与单元格内容；无法无损合并的两个非空单元格进入影响预览，不静默覆盖。
- [x] 结构更新和单元格更新分别使用 revision，避免编辑一个单元格锁住整个最大矩阵。

**验证：**

```bash
npx vitest run modules/research/src/storage/knowledge-repository.test.ts modules/research/src/knowledge/service.test.ts modules/research/src/server/knowledge-routes.test.ts
```

macOS arm64 定向验证通过：矩阵三组 19 项测试通过；连同作品合并、治理路由和 A 验收回归共 6 个文件、25 项测试通过。`typecheck`、`eslint --quiet` 和 `git diff --check` 通过。Windows 11 x64 保持 `not-run`。

### Task 8：完成观点板、矩阵编辑器和 C2 验收

**提交：** `test(research): verify comparison milestone`

- [x] 观点板支持草稿、说明、三类证据关系、来源展开、解除和恢复；不同关系使用文字和图标，不只靠颜色。
- [x] 矩阵编辑器支持选 Work、添加两类行、固定表头/首列、编辑综合、选择候选证据、复核和来源回跳。
- [x] 200 列不一次挂载全部单元格；横纵窗口化保持键盘导航、表头对齐和当前编辑单元格稳定。
- [x] 390 像素切换为“选择行 → 逐论文单元格”流程，不强行压缩完整二维表。
- [x] 自动覆盖设计 C-04、C-05；来源变化后矩阵 `needs-review` 与 C1 状态一致。
- [x] 四宽度真实浏览器完成多作品、多关系、长标题、空单元格、过期复核和来源回跳；执行 `git fetch origin --prune`。

**验证：**

```bash
node scripts/research-knowledge-compat.mjs --phase c2 --browser
npm run check
```

**阶段记录（2026-08-30，macOS arm64）：** C2 模块脚本的 7 个文件、40 项测试通过；Microsoft Edge 152 在 1440、1024、768 和 390 像素的全新 profile 中完成观点板、矩阵、长标题、空单元格、`needs-review` 和来源回跳检查，无水平页面溢出。全仓库 `npm run check` 通过：186 个测试文件通过、4 个跳过，1537 项测试通过、4 项跳过。兼容脚本已为 DevTools 和本地 HTTP 设置超时，浏览器异常时会回收本轮进程。Windows 11 x64 的 C2 领域与 UI 模块均保持 `not-run`，命令与 macOS 相同：

```powershell
npm run setup
node .\scripts\research-knowledge-compat.mjs --phase c2 --browser
```

## C3：写作与交付

### Task 9：实现轻量写作板

**提交：** `feat(research): compose sourced writing`

- [ ] `0008` 建立写作板、章节和块，显式约束文本块或恰好一个资源引用。
- [ ] Service 实现文档标题、归档恢复、章节增删排序、文本块编辑和四类资源引用块。
- [ ] 文档结构和单块内容分别使用 revision；移动块保留稳定 ID，不复制来源对象。
- [ ] 引用对象删除、归档或来源不可用时，写作板显示状态和保留的可读标签，不把引用变成普通文本。
- [ ] Writing Board 支持章节、大纲、正文、资源插入、拖动/键盘排序、来源预览和回跳；不引入富文本编辑器依赖。
- [ ] 自动覆盖从笔记、证据、观点和矩阵加入写作板，以及关系解除和恢复。

**验证：**

```bash
npx vitest run modules/research/src/storage/knowledge-migrations.test.ts modules/research/src/storage/knowledge-repository.test.ts modules/research/src/knowledge/service.test.ts modules/research/src/server/knowledge-routes.test.ts modules/research/src/ui/api.test.ts
```

### Task 10：完成 C 统一检索和规模基准

**提交：** `feat(research): search research knowledge`

- [ ] 完成笔记、证据、观点和写作正文的 FTS 写入、删除/恢复同步、来源状态过滤和重建。
- [ ] 搜索 API 支持 query、上下文、Work、对象类型、状态、来源状态、稳定分页和明确最大结果数。
- [ ] 搜索结果返回命中字段与摘要；来源对象可回阅读器，其他对象回知识页对应面板。
- [ ] 自动覆盖设计 C-08：笔记、证据、观点和写作正文的全文命中、结构化过滤与稳定回跳一致。
- [ ] 规模脚本生成 10,000 Work、50,000 批注、20,000 证据、5,000 观点、100 矩阵和一个 200 × 50 矩阵。
- [ ] 在临时磁盘 SQLite 测量建库、普通列表、FTS、矩阵窗口、单元格保存、revision 和 `integrity_check`；记录观察值后为最终验收设置阈值。
- [ ] 测试结束清理临时目录，记录数据库大小和峰值 RSS，不复制真实 PDF。

**验证：**

```bash
npx vitest run modules/research/src/storage/knowledge-scale.test.ts modules/research/src/storage/knowledge-repository.test.ts modules/research/src/server/knowledge-routes.test.ts
```

### Task 11：实现 Markdown/CSV 输出和 canonical v2 迁移

**提交：** `feat(research): export knowledge with sources`

- [ ] `knowledge-export.ts` 以确定性顺序生成矩阵 Markdown/CSV 和写作板 Markdown，引用包含作品标题、页码、稳定 ID 和内部链接。
- [ ] 输出预览显示格式、对象数量、来源异常、目标路径和覆盖影响；系统选择器支持 `.md`、`.csv` 和 `.json`。
- [ ] 同目录临时写入、摘要检查、原子发布、覆盖备份恢复、请求取消和异常清理有独立测试；绝不覆盖 PDF Asset。
- [ ] canonical schema 升级 v2，包含 B/C 真源与 revisions；v1 解析兼容，FTS/OCR/导出任务等派生数据排除。
- [ ] `canonical-import.ts` 先预览 schema、数量、ID 冲突、附件可用性和预计复制量；只向空 Research 数据库提交。
- [ ] 导入包在 staging 校验可用附件 hash，再用事务写入依赖有序的数据；失败不留下半个知识图或半提交托管文件。
- [ ] 缺失附件恢复为明确不可用位置，证据快照与知识关系仍完整；导入后运行外键、规范 round-trip 和 FTS 重建。
- [ ] UI 提供导出预览、目标选择、覆盖确认、结果和导入预览；正式引用样式不进入本 Task。
- [ ] 自动覆盖设计 C-09、C-13：Markdown/CSV 保持结构与来源，canonical v2 在空 Research 数据库无损恢复 C 真源与历史。

**验证：**

```bash
npx vitest run modules/research/src/interop/knowledge-export.test.ts modules/research/src/interop/canonical.test.ts modules/research/src/interop/portable-export.test.ts modules/research/src/server/knowledge-export-routes.test.ts modules/research/src/server/canonical-import-routes.test.ts
```

### Task 12：完成切片 C 最终验收

**提交：** `test(research): complete slice C acceptance`

- [ ] `slice-c-workflow.test.ts` 在一个正式 Fastify + SQLite 流程中贯通：文本选择 → 批注/证据 → 三类观点关系 → 跨论文矩阵 → 写作板 → Markdown/CSV → 来源回跳。
- [ ] 对照设计 C-01 至 C-14 逐项记录自动测试、真实浏览器或平台待测证据；窄检查不能代替完整场景。
- [ ] 专项回归设计 C-10、C-11、C-12、C-14：并发与删除恢复、上下文归档迁移、作品生命周期和四宽度操作均保留直接证据。
- [ ] 运行目标规模、迁移重跑、外键、`integrity_check`、FTS 重建、canonical v1/v2 round-trip、导入失败恢复和临时文件审计。
- [ ] 四宽度使用全新浏览器状态完成文献库/知识页/阅读器切换、证据提炼、矩阵、写作、搜索、导出和回跳。
- [ ] 平台记录按模块收口：当前开发平台记录实际结果；Windows 文件输出与真实浏览器模块保留准确脚本，未运行就保持 `not-run`。
- [ ] 对照范围确认没有加入完整项目管理、观点树、任意电子表格、富文本处理器、AI 生成、CSL、DOCX 或 LaTeX。
- [ ] 更新设计文档和本计划的完成状态、实测阈值、命令和平台记录。
- [ ] 执行 `git fetch origin --prune`，检查工作区、提交序列、远端差异和未跟踪产物；只保留本地提交。

**当前开发平台验证：**

```bash
npm run check
node scripts/research-knowledge-compat.mjs --phase all --browser
```

**Windows 11 x64 同模块补测：**

```powershell
npm run setup
npm run check
node .\scripts\research-knowledge-compat.mjs --phase all --browser
```

兼容脚本按 C1、C2、C3 记录模块、操作系统、架构、文件系统、Node.js、浏览器和日期；只把实际运行的平台标为通过。截图、临时数据库、生成 PDF、输出文件和浏览器 profile 在结果汇总后清理。

## 完成定义

完整切片 C 只有同时满足以下条件才算完成：

- C1、C2、C3 的每个检查点都有可重复证据，设计 C-01 至 C-14 均有与范围相称的验收结果。
- 文本、区域、图表、书签和 OCR 来源能够形成证据；来源快照、变化状态、显式重新绑定和原文回跳成立。
- 同一证据可被多个上下文复用，不复制来源；观点支持、反驳和限定关系可以独立编辑、删除和恢复。
- 矩阵同时支持观点行和比较维度行，单元格人工综合、证据链接、候选归集和 `needs-review` 成立。
- 写作板可以混合正文和四类引用块，Markdown/CSV 输出保留人类可读来源和稳定回跳标记。
- revision 冲突、tombstone、上下文归档迁移、作品回收/合并/永久删除和附件清理不会破坏知识链。
- 规范 schema v2 可导出并导入空 Research 数据库；v1 仍可读；缺失附件不造成知识数据丢失。
- 目标规模在临时磁盘 SQLite 中完成，查询与资源阈值来自正式实现实测，临时数据在结束后清理。
- 1440、1024、768 和 390 四个宽度分别用全新状态完成视觉与操作检查；真实来源回跳不能只由 DOM 模拟证明。
- 平台相关模块准确记录 macOS、Windows 的已测或待测状态，没有从另一平台或语法检查推定通过。
- `npm run check`、数据库完整性、FTS 对账、规范 round-trip、文件输出恢复和切片 C 端到端流程通过。
- Git 历史由分段绿色本地提交组成，工作区干净，没有私有论文、路径、截图、profile、临时数据库或导出文件进入 Git；没有 push。
