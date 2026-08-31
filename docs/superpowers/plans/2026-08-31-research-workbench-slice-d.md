# Research Workbench Slice D Implementation Plan

**Goal:** 连续完成 D1“格式导入与字段审查”、D2“格式导出、citation key 与 CSL 引用”和 D3“扩展接口与最终验收”，让现有文献库能够可靠进入和离开 BibTeX、RIS、CSL JSON 生态，并在文献库与写作板中生成可追溯引用。

**Architecture:** `modules/research` 继续拥有全部 Research 领域数据。切片 D 在模块内新增独立 `interop/records`、`interop/citation` 和 `interop/adapter` 边界；解析器只生成原始记录、格式影子与字段建议，现有 `Work / Edition`、字段来源、重复候选和附件生命周期仍由 Research 领域服务裁决。格式任务、CSL 处理和文件输出不进入 core，也不向浏览器暴露本地路径。SQLite 实现继续只位于 `storage/**`。

**Tech Stack:** TypeScript strict、Node.js 22+、Fastify 5、SQLite/better-sqlite3、Drizzle ORM、Zod 4、React 19、TanStack Query 5、Vitest 4；候选版本为 Citation.js 0.8.2 的 core/BibTeX/RIS/CSL 插件、`@retorquere/bibtex-parser@10.0.1` 和 citeproc-js `2.4.63`。正式写入 `package-lock.json` 前先完成 citeproc-js 双许可证义务核对。

**Spec:** `docs/superpowers/specs/2026-08-21-research-workbench-design.md` §8.3、§8.5、§13.2、§16“切片 D”、§17.10–§17.11。

**Status:** 已确认，实施中。D0 与 D1 已在 macOS arm64 完成，当前进入 D2；Windows 11 x64 的 D0/D1 对应模块保持 `not-run`。

## 执行方式

- 本文件是完整切片 D 的唯一实施计划。计划确认后按 D1 → D2 → D3 连续推进，不再创建阶段计划文件。
- 采用后端主导的垂直闭环：每个阶段先完成契约、迁移、Repository、Service 和路由，随即接入该阶段的最小 UI，不长期保留只有后端可用的功能。
- 形成少量可运行的本地提交，建议以 D1、D2、D3/最终验收为主要检查点；相邻小 Task 合并，不为每个文件单独提交。全程不 push。若实现期间为回滚建立临时提交，阶段结束时整合为清晰的里程碑提交。
- 开工前、D1 完成后、D2 完成后和最终验收前执行 `git fetch origin --prune`。发现远端领先或远端提交改变 Research 相关文件时先报告，不自动 merge、rebase、force-push 或改写用户提交。
- 开工前和每个本地提交后检查周额度。剩余低于 33% 时只完成当前检查点、验证和继续状态；到 30% 时停止，不开启下一阶段。额度读取失败时明确记录，不用 token 数估算。
- 实施前先核对 citeproc-js `CPAL-1.0 OR AGPL-1.0` 与项目分发方式。若不能接受相应义务，停止依赖落锁和 D2 CSL 实现，保留已完成的适配器方案并请用户选择；不静默换用未成熟引擎。
- D0 的候选安装继续隔离在系统临时目录。计划确认后才把选定依赖写入 `modules/research/package.json` 和根 `package-lock.json`；不得把 D0 的临时 `node_modules`、style 下载目录或报告路径提交到 Git。
- 解析、映射、CSL 和 10,000 条规模测试使用生成语料。真实个人文献文件、标题、作者、路径和引用输出不进入提交。
- 兼容性按测试模块记录。纯映射与领域测试不要求重复完整双平台流程；解析 worker、编码、原子文件替换、系统文件选择器和真实浏览器流程在对应模块声明双平台兼容前补齐另一平台结果。
- UI Task 开始前加载并遵循 `frontend-skill`。D 的界面接入现有导入箱、文献库批量操作和 C 写作板，不新建 WorkBench 顶层模块，也不借 D 重构无关全局界面。

## D0 选型结论

| 部件                 | 采用方式                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| BibTeX/BibLaTeX 解析 | `@retorquere/bibtex-parser` 保存逐条原文、未知字段、附件字段和局部错误；任务放 worker，可取消并报告进度      |
| RIS 解析             | 模块自有窄扫描器确定 `TY/ER` 记录边界并保存 tag 影子；Citation.js 负责已知字段规范映射                       |
| CSL JSON 解析        | 原生 JSON 解析 + Zod 逐项验证并保留原对象；Citation.js 只生成规范 CSL 投影                                   |
| 三格式映射与输出     | Citation.js core 与 BibTeX/RIS 插件；所有清理和格式损失通过 WorkBench 诊断层显式呈现                         |
| CSL 引擎             | citeproc-js 放在 `CitationProcessor` 适配器后；Citation.js CSL 插件用于集成，直接引擎快照用于防止包装层漂移  |
| styles/locales       | 从 CSL 官方仓库固定 commit 引入 APA、IEEE、Chicago author-date 与所需 locale，保存来源、hash、版本和权利信息 |
| 后续替换             | 解析器与 CSL 引擎都由窄接口隔离；citeproc-rs 当前不采用，成熟后可在不改变 `Work / Edition` 的情况下比较替换  |

D0 的正式结果与阈值以 spec §17.11 为准。专用 BibTeX 解析 50 MiB 用时约 22.7 秒，因此大文件流程不能放在 HTTP 请求或浏览器主线程里同步完成。

## 稳定领域语义

### 记录身份与格式影子

- 一个导入文件建立一个 `InteropSource`；一个可确定边界的条目建立一个 `InteropRecord`。source 保存格式、文件显示名、内容 hash、字节数、编码和解析器版本；record 保存序号、来源局部 key、原始内容、原始摘要、解析影子、映射诊断和处理状态。
- 来源路径只用于本次文件读取，不进入稳定身份或 canonical 数据。来源文件内容相同且格式相同可以识别为同一来源候选，但仍由用户选择复用本次审查还是重新解析。
- BibTeX key、RIS `ID` 和 CSL `id` 只在该 source 的 namespace 内唯一。没有 key 的条目仍有稳定 record ID；相同 key 不同内容形成冲突，不覆盖旧 record。
- 解析影子只保存源格式可表达的结构，不取代原始记录。未知字段、未知 tag、宏、literal name、日期原值和附件候选均可追溯。

### 导入任务与提交

- `InteropImportJob` 状态为 `draft / parsing / awaiting-review / committing / completed / cancelled / failed / interrupted`。每个 record 状态为 `valid / invalid / needs-review / accepted / skipped / committed / failed`。
- 解析逐条 checkpoint。进程重启把遗留 `parsing/committing` 标为 `interrupted`；解析可从最后完整 record 继续，提交则重新读取用户决定并以幂等 request ID 检查，不在不明状态下猜测继续。
- 预览冻结 record revision、候选 Work/Edition revision 和附件候选。正式提交前重新检查；任何变化都返回冲突预览。
- 一次提交在 SQLite 事务内创建或复用 `Work / Edition`、来源记录、字段 assertion、identifier、标签关系和 interop 映射。托管附件沿用 A 的 staged 文件事务；数据库或文件任一步失败都回滚并由对账清理临时产物。
- 人工确认值默认保持。导入建议只作为字段 assertion；用户逐字段采用后才成为 selected，明确勾选时才成为 user-confirmed。空外部值从不解释为删除。

### 附件边界

- 附件候选分类为 `local-absolute / local-relative / remote-url / missing / unsupported`，保存原始值、显示名、可选 MIME 和来源字段。
- 解析阶段不 stat、读取、hash、下载或规范化候选路径。用户选择附件后通过现有受控文件选择与 A 的导入服务取得真实路径；记录中的相对路径只能用于帮助用户定位，不能绕过选择器。
- 每个本地候选由用户选择 `ignore / managed / linked`。远程 URL 首版只保留 URL identifier 或未映射字段，不自动下载。
- 三格式导出默认不输出 WorkBench 托管根绝对路径，不复制附件。完整附件迁移继续使用 canonical/portable bundle。

### 导出快照与 citation key

- 导出范围为 `selection / collection / filter / all-active`。预览冻结 Work/Edition ID 和 revision；回收站默认排除。
- 默认每个 Work 选择 preferred Edition；无 preferred 时按稳定规则选择最完整、最近更新且未冲突的 Edition，并在预览中说明。`all-editions` 显式输出每个 Edition 独立记录。
- 未修改的同格式来源记录可以原文重放。已修改记录从当前领域值生成已知字段，再合并不冲突的格式影子；旧值不能覆盖新值。
- citation key 优先采用未冲突的 BibTeX 来源 key或已保存偏好，否则按 `author + year + title` 生成。碰撞在规范化后按稳定 Work/Edition 排序添加字母后缀；预览允许编辑并即时验证。
- `CitationKeyPreference` 只保存用户偏好和 revision，不要求全库唯一。最终唯一性在导出快照内检查；key 不写入 Work/Edition 主键。

### CSL 输出与写作板

- `CitationProcessor` 接收规范 CSL item、style ID、locale、输出表示和 citation item 顺序；不读取 Repository、SQLite 或 UI 状态。
- 固定 style/locale 资产由 manifest 记录上游 commit、文件 hash 和版本。升级资产是显式变更，必须更新 APA/IEEE/Chicago 快照。
- HTML 只允许 CSL 引擎预期的安全标签与属性；Markdown 由受控转换器生成。纯文本、Markdown、HTML 的人类内容一致，表示差异不改变引用顺序和 item ID。
- 写作板新增 citation block 或在现有引用块上保存 citation intent；块保留 Work/Edition ID、locator、prefix/suffix 和 suppress-author 等首版支持选项。参考文献表按当前文档引用集合生成，不把渲染字符串作为唯一真源。

### 扩展契约与 canonical

- `InteropAdapter` 版本从 `1` 开始，能力按 records、collections、tags、attachment-manifest、annotations、cursor 分开声明。
- 首版只实现 record import/export。调用未实现能力返回稳定 `INTEROP_CAPABILITY_UNSUPPORTED`，包含 adapter ID、版本和能力名。
- canonical 升级到 v3，包含 interop sources、records、record-to-entity 映射和 citation key 偏好。import/export job、预览、进度、派生 CSL 输出和缓存不进入 canonical。
- canonical v1/v2 继续按空 interop 集合升级到 v3；恢复不改写输入文件。v3 恢复仍只允许空 Research 目标，失败回滚全部 D 数据。

## 数据模型

| 表                                  | 主要职责                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `research_interop_sources`          | 格式、显示文件名、内容 hash、字节数、编码、解析器及版本、创建时间                             |
| `research_interop_import_jobs`      | source、状态、总数、已处理数、checkpoint、错误、取消与幂等 request ID                         |
| `research_interop_records`          | 序号、来源局部 key、原始记录、摘要、格式影子、映射诊断、决定、状态、revision 与提交结果       |
| `research_interop_record_entities`  | record 与最终 Work/Edition 的显式关系及动作类型；同一 record 可保留历史但只有一个当前提交结果 |
| `research_interop_export_jobs`      | 选择范围、格式、Edition 策略、冻结 revision、目标、状态、损失摘要和安全输出结果               |
| `research_citation_key_preferences` | Work、可选 Edition、用户 key 偏好、来源、revision 和更新时间；不建立全库 key 唯一约束         |

现有 `research_source_records` 与 `research_metadata_assertions` 继续保存进入领域的外部原文和字段来源。`research_interop_records` 保存格式级审查与往返所需内容；两者通过 source record ID 连接，不复制成两个互不关联的真源。

## API 契约

### D1 导入

- `POST /api/research/v1/interop/imports/pick-source`
- `POST /api/research/v1/interop/imports`
- `GET /api/research/v1/interop/imports/:id`
- `POST /api/research/v1/interop/imports/:id/parse`
- `POST /api/research/v1/interop/imports/:id/cancel`
- `PUT /api/research/v1/interop/imports/:id/records/:recordId/decision`
- `POST /api/research/v1/interop/imports/:id/commit`

文件选择路由只返回受控选择结果。解析和提交为任务状态 API；大文件请求不保持一个长 HTTP 响应。分页响应必须返回 total、cursor/offset、record revision 和诊断计数。

### D2 导出与引用

- `POST /api/research/v1/interop/exports/preview`
- `POST /api/research/v1/interop/exports/pick-target`
- `POST /api/research/v1/interop/exports`
- `GET /api/research/v1/interop/exports/:id`
- `POST /api/research/v1/interop/exports/:id/cancel`
- `POST /api/research/v1/citations/render`
- `PUT /api/research/v1/citation-keys/:workId`

preview 返回冻结实体、生成 key、格式损失和覆盖状态；commit 请求必须带 preview token。citation render 接受稳定 ID 与上下文选项，服务端加载授权后的领域数据，客户端不能提交任意 CSL JSON 代替库内对象。

### D3 扩展契约

- `GET /api/research/v1/interop/adapters`
- `GET /api/research/v1/interop/adapters/:id/capabilities`

首版适配器可为 `bibtex / ris / csl-json`，共享版本化 record 契约；能力响应明确区分 supported、unsupported 和版本不兼容。

## 计划文件清单

### 依赖、资产与契约

- Modify: `package-lock.json`
- Modify: `modules/research/package.json`
- Modify: `modules/research/src/contract.ts`
- Modify: `modules/research/src/contract.test.ts`
- Create: `modules/research/src/interop/csl/assets/manifest.json`
- Create: `modules/research/src/interop/csl/assets/apa.csl`
- Create: `modules/research/src/interop/csl/assets/ieee.csl`
- Create: `modules/research/src/interop/csl/assets/chicago-author-date.csl`
- Create: `modules/research/src/interop/csl/assets/locales-en-US.xml`

### D1 领域、存储与服务端

- Create: `modules/research/migrations/0010_research_interop.sql`
- Modify: `modules/research/src/storage/schema.ts`
- Create: `modules/research/src/interop/records/types.ts`
- Create: `modules/research/src/interop/records/bibtex-parser.ts`
- Create: `modules/research/src/interop/records/ris-parser.ts`
- Create: `modules/research/src/interop/records/csl-json-parser.ts`
- Create: `modules/research/src/interop/records/mapper.ts`
- Create: `modules/research/src/interop/records/worker.mjs`
- Create: `modules/research/src/interop/records/repository.ts`
- Create: `modules/research/src/interop/records/service.ts`
- Create: `modules/research/src/storage/sqlite-interop-repository.ts`
- Create: `modules/research/src/server/interop-routes.ts`
- Modify: `modules/research/src/server/index.ts`
- Modify: `modules/research/src/testing/harness.ts`

### D2 输出与 UI

- Create: `modules/research/src/interop/records/exporter.ts`
- Create: `modules/research/src/interop/records/citation-key.ts`
- Create: `modules/research/src/interop/safe-text-output.ts`
- Modify: `modules/research/src/interop/knowledge-export.ts`
- Create: `modules/research/src/interop/csl/processor.ts`
- Create: `modules/research/src/interop/csl/output.ts`
- Modify: `modules/research/src/ui/api.ts`
- Create: `modules/research/src/ui/components/InteropImportDialog.tsx`
- Create: `modules/research/src/ui/components/InteropReviewTable.tsx`
- Create: `modules/research/src/ui/components/InteropExportDialog.tsx`
- Create: `modules/research/src/ui/components/CitationDialog.tsx`
- Modify: `modules/research/src/ui/components/ImportDialog.tsx`
- Modify: `modules/research/src/ui/ResearchLibraryPage.tsx`
- Modify: `modules/research/src/ui/knowledge/WritingBoard.tsx`

### D3 扩展、迁移与验收

- Create: `modules/research/src/interop/adapter.ts`
- Modify: `modules/research/src/interop/canonical.ts`
- Modify: `modules/research/src/storage/canonical-import.ts`
- Modify: `modules/research/src/storage/canonical-roundtrip.ts`
- Modify: `modules/research/src/storage/sqlite-repository.ts`
- Create: `modules/research/src/acceptance/slice-d-workflow.test.ts`
- Create: `modules/research/src/storage/interop-scale.test.ts`
- Create: `scripts/research-interop-compat.mjs`
- Create: `scripts/research-interop-visual-qa.mjs`
- Modify: `docs/superpowers/specs/2026-08-21-research-workbench-design.md`
- Modify: `docs/superpowers/plans/2026-08-31-research-workbench-slice-d.md`

测试文件按被测对象就近创建，例如 `bibtex-parser.test.ts`、`mapper.test.ts`、`citation-key.test.ts`、`processor.test.ts`、`interop-routes.test.ts` 和 UI API/交互测试；上面的清单不要求把所有测试塞进单个大文件。

## D1：格式导入与字段审查

### Task 1：确认依赖义务并建立三格式契约

1. 记录 Citation.js、retorquere parser、citeproc-js、CSL style 和 locale 的版本、许可证、上游来源与 hash。
2. 完成 citeproc-js 分发义务核对；通过后才修改模块依赖和 lock 文件。
3. 在 `contract.ts` 定义 format、source、record、field suggestion、diagnostic、attachment candidate、decision、job status 和分页响应 schema。
4. 定义稳定错误码：格式不支持、编码不支持、边界损坏、记录无效、任务状态冲突、revision 冲突、附件未确认和能力不支持。
5. 契约测试覆盖未知字段、partial invalid、最大字段长度、分页、显式 `unsupported` 和前后端 schema 往返。

验证：

```bash
npx vitest run modules/research/src/contract.test.ts
npm run typecheck
npm run lint -- --quiet
```

### Task 2：新增 D 持久模型和独立 Repository

1. 创建 0010 迁移和 Drizzle schema，加入 source、import job、record、record entity、export job 和 citation key preference 表及必要索引。
2. source content hash + format 建普通索引而非强制唯一；record 对 source + ordinal 唯一，source-local key 冲突允许保留并由诊断层处理。
3. `SqliteInteropRepository` 使用动态 `getSqlite()`；账号切换后指向当前数据库，不继承 `SqliteResearchRepository`。
4. Repository 提供领域操作：创建/恢复任务、批量写 checkpoint、分页读取、保存决定、冻结预览、事务提交和中断对账；不暴露 SQL row 或通用 CRUD。
5. 迁移测试覆盖重跑、外键、索引、账号隔离、10,000 record 分页和 `integrity_check`。

### Task 3：实现记录级解析 worker 与格式影子

1. worker 只接受受控源文件和任务 ID，限制 50 MiB 默认目标、记录数、单记录大小和返回批次；取消时终止并保存最后完整 checkpoint。
2. BibTeX 解析保存 retorquere 的 entry input、fields、mode、comments/string/preamble 诊断和错误；Citation.js 只处理有效条目的规范投影。
3. RIS 扫描器按行保留换行、tag 顺序、重复 tag、`TY/ER` 边界和行号；单条交给 Citation.js，未知 tag 留在影子。
4. CSL JSON 要求 UTF-8 顶层数组或单 item，原生 JSON 解析后逐 item 走 Zod；结构错误定位到 JSON path，整个 JSON 语法错误为文件级失败。
5. 三种 parser 返回统一 `ParsedInteropRecord`，同时保留 format-specific shadow；不在 parser 内访问数据库、附件路径或外部网络。
6. 测试覆盖 CRLF/LF、BOM、Unicode、BibLaTeX 常见字段和宏、RIS 重复 tag、CSL `custom`、未知字段、partial invalid 和取消恢复。

### Task 4：实现 Work/Edition 映射、重复与字段冲突预览

1. mapper 按 spec §8.5 生成 Work 字段、可选 Edition、contributors、identifiers、标签建议、附件候选和逐字段诊断。
2. 姓名保留 structured/literal/organization 与顺序；日期保留可确定部分和原值；类型未知时落 `unknown` 并报告源值。
3. 调用现有 identifier normalization 和 duplicate candidate 逻辑，不复制第二套 DOI/标题相似度规则。
4. service 合并当前 selected assertion、人工确认状态、候选 Work/Edition revision 和来源建议，返回三列字段审查模型。
5. 再次导入按 source-local key、raw hash、identifier 与 metadata 候选分开显示，不自动更新。
6. 测试覆盖 spec D-01–D-07，并验证空值不删除、批量采用不越过人工确认和 revision 冲突。

### Task 5：完成确认提交、路由和导入箱 UI

1. 建立任务 API、受控文件选择、分页记录审查、逐条/批量决定、取消、恢复和 commit 路由。
2. commit 在一个领域事务中创建或复用 Work/Edition、source record、assertion、identifier、标签关系和 record entity；附件选择调用 A 的既有 staged import 能力。
3. `InteropImportDialog` 先选择格式文件，再显示摘要、有效/错误/冲突/附件计数；记录表支持虚拟或分页展示，不一次渲染 10,000 行。
4. 字段审查明确显示当前值、来源值、最终选择和人工确认开关。无效记录原文按需展开，长字段不会把主要操作推离视口。
5. 导入完成报告区分 created、new-edition、matched、suggestions-only、skipped、failed 和 attachment result。
6. 完成 D1 自动验收与四宽度真实浏览器流程；阶段验证通过后形成一个 D1 本地里程碑提交。

D1 定向验证至少包含：

```bash
npx vitest run modules/research/src/interop/records modules/research/src/storage/interop-scale.test.ts modules/research/src/server/interop-routes.test.ts
npm run typecheck
npm run lint -- --quiet
git diff --check
```

D1 实施记录（2026-08-31，macOS arm64）：

- 三格式 parser、worker、mapper、Repository、正式 Fastify 路由与 SQLite 事务提交已经贯通；来源 key 能区分相同内容和变化内容，标识符候选复用现有 Research 重复规则。
- 导入箱和文献库都能进入格式导入审查；50 条分页、当前/来源/最终值、原文诊断、重复动作、附件逐项确认和完成报告已经接通。
- 10,000 条记录写入、末页读取、重复 key、账号切换、取消/中断 checkpoint、人工 assertion 保护和 revision 冲突自动测试通过。
- 1440、1024、768、390 四个宽度已完成真实浏览器结构与无横向页面溢出检查；Windows 系统选择器、解析 worker 和真实浏览器保持 `not-run`。
- 全仓库回归：196 个测试文件通过、4 个按既有条件跳过；1,577 项测试通过、4 项跳过。`typecheck`、ESLint、Prettier、Vite production build 与 `git diff --check` 通过；build 仅保留既有 chunk-size warning。

## D2：格式导出、citation key 与 CSL 引用

### Task 6：实现导出投影、同格式保真和损失报告

1. 为 selection/collection/filter/all-active 建立冻结预览；默认 preferred Edition，可显式 all-editions。
2. 投影器从当前 Work/Edition 生成规范 record，并与来源格式影子合并。无修改同格式记录走原文重放；有修改时只覆盖已知字段。
3. 三种 writer 输出 UTF-8。BibTeX 支持常用 BibLaTeX 字段，RIS 保留重复与未知 tag，CSL JSON 保留 `custom` 和可安全合并的非标准键。
4. 逐条损失报告包含 complete/normalized/degraded/unmapped/attachment-omitted/no-edition；跨格式测试覆盖 3 × 3 矩阵。
5. 实现 citation key 生成、来源 key 优先、稳定碰撞后缀、用户偏好与预览内唯一性检查。
6. 测试覆盖 D-08–D-11，包括已修改字段与未知字段同时存在、回收站排除、preview revision 失效和 key 稳定性。

### Task 7：复用并统一安全文本输出

1. 从现有 `knowledge-export.ts` 提取窄的 `safe-text-output.ts`，保留同目录临时文件、独占创建、内容校验、目标备份、原子替换、失败恢复和清理语义。
2. D 的 writer 在临时文件完成 UTF-8、记录数、格式可重新解析和摘要校验后才发布。取消信号必须在生成、写入、验证和发布前分别检查。
3. Windows 已有目标文件替换、只读目标、文件占用、长路径和 Unicode 路径由兼容脚本单独测试；macOS 结果不替代 Windows。
4. 现有 C 导出回归必须保持通过，不能因抽取共用工具改变其文件语义。

### Task 8：实现固定 CSL 资产、引用和参考文献表

1. 把官方 APA、IEEE、Chicago author-date 和 en-US locale 固定到 manifest；启动时验证 manifest 与文件 hash。
2. `CitationProcessor` 包装 citeproc-js，支持 bibliography/citation、text/html 和 citation item 顺序。直接引擎与 Citation.js 包装层对固定 fixture 保持一致。
3. HTML 做白名单净化；Markdown 转换仅支持 CSL 输出所需结构。三种表示的条目数量、顺序、链接和文字内容一致。
4. 固定快照覆盖单条、多条、同作者同年、缺作者、机构作者、中文 literal name、DOI/URL、locator、prefix/suffix 和数字样式顺序。
5. 样式与 locale 更新必须显式改 manifest 和 snapshot，不通过联网在运行时自动更新。

### Task 9：接入文献库、导出对话框与写作板

1. 文献库批量操作加入“导出记录”“复制引用”“生成参考文献表”，选择范围与列表状态一致。
2. `InteropExportDialog` 展示格式、范围、Edition 策略、key 编辑、警告、损失和覆盖目标；10,000 条只展示分页摘要与问题项。
3. `CitationDialog` 支持 style、locale、citation/bibliography 和 text/Markdown/HTML；复制成功只在 Clipboard API 真正完成后显示。
4. 写作板新增稳定 citation intent，插入引用块并按当前文档引用集合生成草稿参考文献表；来源回跳与 C 的 revision 语义保持。
5. 完成 D2 的领域、路由、UI、真实浏览器和安全文件输出验收后形成一个 D2 本地里程碑提交。

D2 定向验证至少包含：

```bash
npx vitest run modules/research/src/interop modules/research/src/server/interop-routes.test.ts modules/research/src/ui/api.test.ts modules/research/src/knowledge/service.test.ts
npm run typecheck
npm run lint -- --quiet
git diff --check
```

## D3：扩展接口和最终验收

### Task 10：完成版本化 InteropAdapter 契约

1. 定义 adapter descriptor、capability、version negotiation、record batch、diagnostic 和 cursor schema。
2. BibTeX/RIS/CSL JSON adapter 只声明 records import/export supported；其他能力明确 unsupported。
3. 服务端 registry 返回稳定顺序和版本，不让插件对象或解析库类型穿过 API。
4. 测试支持版本、未知 adapter、未知能力、不兼容版本、部分失败批次和空结果语义。

### Task 11：升级 canonical v3 与恢复

1. canonical v3 加入 interop 真源集合与 citation key preference；v1/v2 normalize 为 v3 空集合。
2. export fingerprint、record count、conflict preview、destination emptiness、事务导入和 rollback 覆盖新表。
3. source 文件路径、导入/导出 job、preview token、CSL 输出和缓存不进入 canonical。
4. 更新 portable bundle roundtrip，验证未知字段、record mapping、人工字段 assertion 和 key 偏好无损恢复。
5. 保持 v1/v2 fixture 和 A/B/C canonical 回归通过。

### Task 12：完成规模、跨平台脚本、浏览器与最终验收

1. 把 D0 的 10,000 条 / 50 MiB 解析基准转为正式实现规模测试；记录 parse、mapping、SQLite checkpoint、preview、export、CSL、取消和清理。
2. `research-interop-compat.mjs` 按模块运行 parser/encoding、atomic-output 和 CSL snapshots，输出当前平台 passed 与另一平台 not-run；不推定双平台。
3. `research-interop-visual-qa.mjs` 使用全新浏览器 profile 在 1440/1024/768/390 完成导入审查、错误展开、冲突选择、导出预览、key 编辑、引用复制和写作板插入；截图放临时目录并在成功后清理。
4. `slice-d-workflow.test.ts` 以正式 Fastify + SQLite 完成 D-01–D-18，审计 source/record/assertion/entity/canonical 与文件临时产物。
5. 运行 A/B/C 关键回归和全仓库 `npm run check`。若仍只出现已知 favicon 固定超时，需要用定向通过与完整日志证明是同一外部负载问题；新的 D 失败不能归入已知问题。
6. 更新 spec 与本计划的真实平台状态、性能数字、测试数量和剩余待测项；整合临时提交，形成 D3/最终验收本地提交后停止。

macOS 当前开发机最终命令预期为：

```bash
npm run research:d0
node scripts/research-interop-compat.mjs --phase all --target-scale
node scripts/research-interop-visual-qa.mjs
npx vitest run modules/research/src/acceptance/slice-d-workflow.test.ts
npm run check
git diff --check
```

Windows 11 x64 在对应模块需要声明兼容时运行：

```powershell
npm run research:d0
node scripts/research-interop-compat.mjs --phase all --target-scale
node scripts/research-interop-visual-qa.mjs
npx vitest run modules/research/src/acceptance/slice-d-workflow.test.ts
```

Windows 未实际运行前，计划和 spec 必须保持 `not-run`。若 Windows 先发生解析、文件输出或 UI 改动，先记录 Windows 实测，再把受影响的 macOS 模块列为待反向补测。

## 最终验收矩阵

| 模块                  | 自动证据                                                       | 平台证据                                       |
| --------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| 三格式解析与映射      | 3 × 3 roundtrip、partial invalid、未知字段、字段冲突、重复候选 | 当前实现平台正式规模；另一平台 parser 模块补测 |
| 附件候选与 A 生命周期 | 不访问候选、显式选择、managed/linked、失败回滚                 | 文件选择器和路径模块分别记录                   |
| 三格式输出            | 同格式影子合并、跨格式损失、冻结 preview、重新解析             | atomic-output 模块双平台补测                   |
| citation key 与 CSL   | key 稳定性、三样式、三表示、直接引擎一致性                     | CSL 纯运行模块按实际平台记录                   |
| 文献库与写作板        | API、稳定 ID、revision、引用集合和来源回跳                     | 四宽度真实浏览器                               |
| adapter 与 canonical  | 能力协商、unsupported、v1/v2→v3、v3 roundtrip/rollback         | 领域模块不重复整条跨平台流程                   |
| 目标规模              | 10,000 条、50 MiB、进度、取消、资源与临时目录清理              | 两平台各自记录，不互相推定                     |

## 完成定义

- spec §17.10 的 D-01–D-18 全部有自动测试或明确真实浏览器/平台证据。
- BibTeX、RIS、CSL JSON 导入导出都经过正式 Work/Edition 与来源模型，不存在绕开人工字段保护的旁路。
- 未知字段、部分错误、格式损失、附件省略和来源局部 key 均可见、可追溯，没有静默丢弃或自动覆盖。
- citation key 稳定可编辑，APA/IEEE/Chicago author-date 的引用与参考文献表支持纯文本、Markdown、净化 HTML。
- 文献库和写作板保留稳定 Work/Edition ID，引用输出可刷新并可回到来源。
- `InteropAdapter` 只实现 records，并对未实现能力明确返回 unsupported；没有夹带 Zotero 迁移、同步或附件云备份。
- canonical v3 无损覆盖 D 真源，v1/v2 仍可恢复；任务缓存和派生输出可重建。
- 目标规模通过，取消和失败不留下半条领域记录、半个目标文件或临时候选依赖。
- 当前平台结果真实记录；未运行平台保持 `not-run`。全仓库检查通过，或仅保留有独立证据的既有非 D 环境问题。
- Git 历史最终整合为少量绿色本地里程碑提交，没有 push；计划和 spec 更新为真实完成状态。
