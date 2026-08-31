# Research Workbench Slice B Implementation Plan

**Goal:** 连续完成 B1“阅读器核心”、B2“批注与检索”和 B3“OCR 与输出”，交付一个可长期打开大型 PDF、保存阅读状态、隔离批注上下文、搜索正文、按需 OCR 并导出带批注副本的本地阅读器。

**Architecture:** `modules/research` 继续拥有 Research 领域与界面。切片 B 在模块内新增独立的 reader、annotation、text-index、ocr 和 annotated-export 边界；SQLite 实现仍只位于 `storage/**`。浏览器通过受控的 Asset 内容路由和 HTTP Range 读取 PDF，PDF.js 负责解析、Canvas 和文本层；服务端负责授权、持久状态、派生任务和文件输出。页面表面、文本层、全文索引与 OCR 都是有上限、可取消、可重建的派生资源，原始 PDF 保持不可变。

**Tech Stack:** TypeScript strict、Node.js 22+、Fastify 5、SQLite/better-sqlite3、Drizzle ORM、Zod 4、React 19、TanStack Query 5、React Router 7、Tailwind CSS 4、Vitest 4、`pdfjs-dist@6.2.108`、`tesseract.js@7.0.0`。

**Spec:** `docs/superpowers/specs/2026-08-21-research-workbench-design.md`

## 执行方式

- 本文件是完整切片 B 的唯一实施计划。B0 已完成；从 B1 连续实施到 B3，不另建阶段计划。
- 每个提交必须是可运行、可验证的绿色检查点。全程只做本地提交，不 push。
- 每个实施批次开始前和本地提交后检查周额度。剩余 33% 时只收尾当前检查点，不开启新任务；剩余 30% 时停止并保留未完成目标。
- 开工前、B1 完成后和切片 B 最终验收前执行 `git fetch origin --prune`，只报告真实远端差异，不自动合并或改写已有提交。
- 先完成契约、迁移、Repository、受控文件路由和服务，再立即接入同一能力的最小 UI；不长期堆积只有后端可用的功能。
- `ResearchService` 保留文献库治理职责。阅读器使用独立 `ResearchReaderService` 和 `ReaderRepository`，避免把长任务、Range 与批注状态混进切片 A 服务。
- Repository 暴露领域操作，不暴露 SQL 行或通用 CRUD。数据库、FTS5 和 Drizzle 只能出现在 `modules/research/src/storage/**`。
- 测试只使用临时数据库、临时目录和生成语料。私有 PDF 的文件名、路径、正文和结果不进入 Git。
- 平台兼容状态按测试模块记录。某模块在哪个平台修改，就在该平台运行并记录；另一平台在该模块声明双平台兼容前补测，反向开发时同理。
- 派生缓存不在每次启动时全量清空。页面表面按休眠和 LRU 回收；正文索引与 OCR 按 Asset hash、解析器/引擎和语言包版本失效；任务临时文件在完成时清理，异常残留由启动对账清理。
- UI 实现前加载并遵循 `frontend-skill`。自动视觉验收对 1440、1024、768、390 四个宽度分别使用全新页面状态，截图产物放临时目录并在检查结束后清理。

## 稳定边界与状态语义

### Asset 内容访问

- 浏览器只通过 `/api/research/v1/assets/:id/content` 访问内容，不能提交或读取任意本地路径。
- 路由先按 Asset 和可用 Location 授权，再解析托管对象或链接路径；回收、缺失、变化、非 PDF 和不可读状态返回稳定错误码。
- 支持单个字节区间、`HEAD`、`Accept-Ranges`、`Content-Range`、`ETag` 和取消传播；非法或多区间请求明确拒绝。
- 从磁盘到响应始终流式传输。非线性化 PDF 允许 PDF.js 逐步读取更多区间，不把整份文件预读到内存。
- ETag 由 Asset 内容 hash 形成；Location 变化不能改变同一 Asset 的内容身份。

### 阅读会话与资源生命周期

```text
closed
  -> opening
  -> active
  -> background
  -> sleeping
  -> reopening
  -> active

opening | active | background | reopening
  -> error
  -> closed
```

- 标签页、加密 PDF 密码和当前 loading task 只属于浏览器会话；密码不进入 API 请求日志、数据库或配置。
- 阅读位置、缩放、旋转和布局按当前账号数据库中的 Asset 保存。上下文选择也随该 Asset 保存，但不改变批注归属。
- 活动文档只保留可视页附近的 Canvas 与文本层；离开缓存窗口时取消 render task 并移除 DOM。
- 同时最多保留 4 个 live PDF loading task；更多后台标签按最近最少使用顺序休眠。后台 30 秒无活动进入休眠，测试通过可注入时钟缩短等待。
- 单文档最多保留 8 个页面表面，全局最多 16 个；活动页和正在选择文本的页面不被驱逐。
- 休眠和关闭必须销毁 loading task、worker、render task、Canvas、文本层监听器和未完成 Range 流。重新打开从持久阅读状态恢复。

### 上下文与批注

- 通用层由 `contextId: null` 表示，对外契约使用显式 `layer: { kind: 'general' }`，不创建伪造的共享上下文记录。
- 命名上下文由用户手工创建，可选择绑定目录；每个目录至多绑定一个默认上下文。目录移动或删除不移动、复制或删除批注。
- 批注绑定 Asset，可选保留 Edition。锚点至少包含页码、PDF 坐标或四边形、文本引用、周边文本指纹和创建时的 Asset/Edition 信息。
- 文本高亮、下划线、删除线、区域框、便笺和书签使用稳定 ID。更新增加 revision 并保存轻量快照；删除写 tombstone，恢复产生新 revision。
- 上下文切换只改变当前写入层和可见层。界面始终显示当前写入层，创建批注时把该层随请求提交，避免异步切换写错层。

### 正文索引、OCR 与输出

- PDF 文本按页惰性抽取。首个可见页完成后再开始后台索引，先索引可视页与搜索需要页，再在空闲时补齐其余页。
- FTS5 保存每页文本及定位信息。任务逐页 checkpoint，可暂停、取消、恢复和完整重建；Asset hash 或解析器版本变化时失效。
- 无可靠文本层的文档只显示 OCR 建议。OCR 必须由用户确认，以独立子进程、单 worker、逐页 checkpoint 运行。
- OCR 缓存键包含 Asset hash、引擎版本、语言列表与语言包版本；取消终止子进程，重新启动后从最后成功页继续。
- 带批注导出始终写新文件。导出器通过窄接口生成 PDF；能可靠表达的批注写为标准 PDF annotation，其他类型扁平化，并生成逐项报告。
- 导出前后核对原始 Asset hash；取消或失败时删除临时输出，不改变原文件、Asset、Location 或 Attachment。

## 数据模型

| 表                               | 主要职责                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `research_asset_reader_state`    | Asset 阅读页、滚动位置、缩放、旋转、布局、最后上下文和乐观版本                 |
| `research_reading_contexts`      | 用户手工创建的命名上下文；通用层不占行                                         |
| `research_collection_contexts`   | Collection 与默认命名上下文的一对一绑定                                        |
| `research_annotations`           | 稳定批注 ID、Asset/Edition、上下文、类型、锚点、正文、样式、revision/tombstone |
| `research_annotation_revisions`  | 批注每次变更前的轻量快照和变更原因                                             |
| `research_page_text`             | 每页 PDF/OCR 文本、定位数据、内容 hash 与生成版本                              |
| `research_text_index_jobs`       | 正文抽取状态、总页数、next page、checkpoint、错误、取消和版本                  |
| `research_ocr_jobs`              | OCR 语言、引擎/语言包版本、状态、next page、checkpoint、错误和取消             |
| `research_annotated_export_jobs` | 输出选项、目标、进度、报告、状态和临时路径                                     |
| `research_page_text_fts`         | 页级正文 FTS5；可由 `research_page_text` 完整重建                              |

所有持久任务的运行态包含 `queued/running/paused/completed/cancelled/failed/interrupted` 中适用的子集。服务启动时把遗留 `running` 标成 `interrupted`，清理孤立临时文件；恢复只从已提交 checkpoint 继续。

## 计划文件清单

### 领域、存储与服务端

- Modify: `modules/research/src/contract.ts`
- Modify: `modules/research/src/storage/schema.ts`
- Modify: `modules/research/src/storage/sqlite-repository.ts`
- Modify: `modules/research/src/testing/harness.ts`
- Create: `modules/research/migrations/0004_research_reader.sql`
- Create: `modules/research/src/reader/repository.ts`
- Create: `modules/research/src/reader/service.ts`
- Create: `modules/research/src/reader/content-source.ts`
- Create: `modules/research/src/reader/range-response.ts`
- Create: `modules/research/src/reader/text-index.ts`
- Create: `modules/research/src/annotation/service.ts`
- Create: `modules/research/src/ocr/engine.ts`
- Create: `modules/research/src/ocr/tesseract-engine.ts`
- Create: `modules/research/src/ocr/tesseract-worker.mjs`
- Create: `modules/research/src/interop/annotated-export.ts`
- Create: `modules/research/src/server/reader-routes.ts`
- Create: `modules/research/src/server/output-picker.ts`
- Modify: `modules/research/src/server/index.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `modules/research/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`

### 阅读器 UI

- Modify: `modules/research/src/ui/index.tsx`
- Modify: `modules/research/src/ui/api.ts`
- Modify: `modules/research/src/ui/components/WorkDetailPanel.tsx`
- Create: `modules/research/src/ui/reader/ResearchReaderPage.tsx`
- Create: `modules/research/src/ui/reader/ReaderWorkspace.tsx`
- Create: `modules/research/src/ui/reader/ReaderTabs.tsx`
- Create: `modules/research/src/ui/reader/ReaderToolbar.tsx`
- Create: `modules/research/src/ui/reader/PdfViewport.tsx`
- Create: `modules/research/src/ui/reader/PdfPage.tsx`
- Create: `modules/research/src/ui/reader/ReaderSidePanel.tsx`
- Create: `modules/research/src/ui/reader/PasswordPrompt.tsx`
- Create: `modules/research/src/ui/reader/AnnotationToolbar.tsx`
- Create: `modules/research/src/ui/reader/AnnotationLayer.tsx`
- Create: `modules/research/src/ui/reader/SearchPanel.tsx`
- Create: `modules/research/src/ui/reader/OcrDialog.tsx`
- Create: `modules/research/src/ui/reader/AnnotatedExportDialog.tsx`
- Create: `modules/research/src/ui/reader/session.ts`
- Create: `modules/research/src/ui/reader/virtualizer.ts`
- Create: `modules/research/src/ui/reader/page-cache.ts`

### 验证入口

- Keep: `scripts/research-reader-b0.mjs`
- Keep: `scripts/research-reader-b0-browser.html`
- Keep: `scripts/research-reader-b0-ocr-worker.mjs`
- Create: `scripts/research-reader-visual-qa.mjs`
- Create: `scripts/research-reader-compat.mjs`
- Create: `modules/research/src/acceptance/slice-b-workflow.test.ts`

文件名可以随实现中的职责边界小幅调整；不能改变受控 Asset 内容访问、独立 ReaderService、通用层语义、原始 PDF 不可变和可重建派生数据这些边界。

## B0：技术验证准入

### Task 0：完成阅读器技术验证与性能预算

**提交：** 已由 `1579506`、`5662500` 和 `57a9e5f` 等检查点完成。

- [x] 生成并管理普通、超长、扫描、图片、损坏、Range 与加密 PDF 语料；私有语料仅本机匿名使用。
- [x] 验证 PDF.js Node 解析、Canvas、文本层、加密密码分支、Range 局部读取和取消传播。
- [x] 验证页级 FTS5 的暂停、续建、查询和重建。
- [x] 验证 Tesseract.js 中英文、真实扫描页、取消、恢复和独立子进程回收。
- [x] 使用三轮全新 Edge profile 验证 4 文档、6 Canvas、6 文本层、空闲和销毁后的资源状态。
- [x] 把 macOS 实测、候选阈值、Windows 指令、缓存失效和临时产物规则写回设计文档。

**已确认的 macOS 实施预算：** 首屏不超过 750 ms；远端跳页不超过 500 ms；4 文档 renderer heap 增量不超过 64 MiB；空闲或销毁窗口额外增长不超过 8 MiB；Range 中断 2 秒内归零；1000 页纯 FTS 写入不超过 250 ms；普通查询不超过 100 ms；OCR 冷启动和普通单页各不超过 3 秒，worker 不超过 384 MiB，取消不超过 250 ms。Windows 补测后按两端较慢结果定稿双平台预算。

## B1：阅读器核心

### Task 1：建立 Reader 契约、迁移与 Repository

**提交：** `feat(research): add reader state domain`

- [ ] 在 `contract.ts` 增加 Asset 内容 URL、reader manifest、阅读状态、布局、缩放、旋转、加载状态和稳定错误 schema。
- [ ] 迁移先建立 reader state、context、annotation、page text 和三类持久任务表；B1 只开放 reader state 操作，其余表由后续阶段启用。
- [ ] 使用 Asset 外键和明确的 cascade/restrict；阅读状态一 Asset 一行，revision 支持乐观更新。
- [ ] 定义窄 `ReaderRepository`，由 `SqliteResearchRepository` 实现；账号切换继续通过动态 `getSqlite()` 隔离。
- [ ] Repository 测试覆盖默认状态、并发 revision、Asset 回收/恢复、删除影响、上下文空值和迁移幂等。
- [ ] 边界测试确认 reader/annotation/ocr/interop 不能 import SQLite、Drizzle 或 `@workbench/data`。

**验证：**

```bash
npx vitest run modules/research/src/reader/repository.test.ts modules/research/src/storage/reader-migrations.test.ts modules/research/src/storage/reader-repository.test.ts packages/core/src/eslint.boundaries.test.ts
```

### Task 2：实现受控 PDF Range 路由和 ReaderService

**提交：** `feat(research): stream pdf assets with controlled range access`

- [ ] `content-source.ts` 只通过 Repository 返回的 Asset/Location 解析可读 PDF，不接受客户端路径。
- [ ] 托管位置与链接位置使用同一授权和状态检查；主位置缺失时按可用位置回退并保留明确诊断。
- [ ] `range-response.ts` 支持 `HEAD`、完整 GET、单 Range、416、ETag、条件请求、反压和 AbortSignal。
- [ ] `ResearchReaderService` 返回不含绝对路径的 manifest，读取/保存阅读状态，并把密码留在浏览器 loading task。
- [ ] 将 reader routes 独立注册到现有 Research server module；路由日志不记录密码或本地路径。
- [ ] 路由测试覆盖 Asset ID 授权、回收/缺失/变化、非法范围、流取消、共享 hash 和账号切换。
- [ ] 使用 B0 大型线性化 PDF 复测首/中/末页 Range，总读取量和取消收敛满足预算。

**验证：**

```bash
npx vitest run modules/research/src/reader modules/research/src/server/reader-routes.test.ts
npm run research:b0 -- --browser --pdf "/path/to/large.pdf"
```

第二条命令中的路径必须替换为本机真实大型 PDF。

### Task 3：接入 PDF.js 页面渲染和阅读器工作区

**提交：** `feat(research): render pdf reader workspace`

- [ ] 新增 `/research/read/:assetId` 路由，并从 Work 详情的可用 PDF 附件进入阅读器。
- [ ] 直接使用 PDF.js browser build 和独立 worker，完成 Canvas、文本层、页码跳转、缩放、旋转、单页/连续布局、目录与基本键盘操作。
- [ ] 加密文档分别处理缺少密码、密码错误、正确密码和取消；密码只存在当前标签页内存。
- [ ] 显示下载进度、非线性化文件持续加载、损坏文件、缺失位置和重新定位入口。
- [ ] 阅读位置使用节流保存，关闭、切换标签和卸载前执行最终保存；旧 revision 冲突时以较新的用户动作重新提交。
- [ ] 保留浏览器原生文本选择和复制；文本层不被装饰性元素遮挡。
- [ ] UI 不改变全局 WorkBench 外壳和其他模块样式。

**验证：**

```bash
npx vitest run modules/research/src/ui/reader modules/research/src/ui/api.test.ts
npm run typecheck
```

### Task 4：完成虚拟化、标签页、休眠和资源回收

**提交：** `feat(research): bound reader sessions and page resources`

- [ ] `virtualizer.ts` 根据页尺寸和 viewport 计算可见页及预取窗口，不依赖所有页面 DOM 已挂载。
- [ ] `page-cache.ts` 实施每文档 8 页、全局 16 页表面上限；驱逐时取消 render task、清理 Canvas 和文本层。
- [ ] 标签页支持打开、切换、关闭和重开；最多 4 个 live loading task，后台 30 秒后休眠，超限时 LRU 休眠。
- [ ] 休眠保存状态并销毁 PDF.js 资源；重开只恢复当前附近页面，不重放全篇渲染。
- [ ] Range、render、文本抽取和状态保存分别持有 AbortSignal；关闭标签不会留下在途任务或未处理 rejection。
- [ ] 使用可注入时钟和假 PDF adapter 测试精确资源上限，再用真实 Edge 重复打开/休眠/关闭至少 20 轮。
- [ ] 浏览器 E2E 记录 DOM/task/active stream、renderer heap 与浏览器级内存；验收持续增长趋势，不要求 heap 立即回到启动值。

**验证：**

```bash
npx vitest run modules/research/src/ui/reader/session.test.ts modules/research/src/ui/reader/virtualizer.test.ts modules/research/src/ui/reader/page-cache.test.ts
npm run research:b0 -- --browser --pdf "/path/to/large.pdf"
```

### Task 5：完成 B1 视觉与操作验收

**提交：** `test(research): verify reader core milestone`

- [ ] `research-reader-visual-qa.mjs` 为 1440、1024、768、390 分别创建全新浏览器状态并截图；窄屏侧栏/属性区转为抽屉。
- [ ] 自动验收普通、超长、非线性化、加密、损坏、缺失和恢复后的 PDF 状态。
- [ ] 真实浏览器手动验收键盘、选择复制、缩放、旋转、页码跳转、标签切换、休眠重开和阅读位置恢复。
- [ ] 运行 macOS 对应模块并记录设备、Node、浏览器、语料类别、冷/热条件、时间、内存和清理结果。
- [ ] 维护 Windows 11 x64 兼容脚本和同模块命令，保留准确待测状态，不用 macOS 结果代替。
- [ ] 更新本计划 B1 复选框和验收记录；执行 `git fetch origin --prune`，确认本地提交范围与工作区状态。

**验证：**

```bash
node scripts/research-reader-visual-qa.mjs
node scripts/research-reader-compat.mjs --phase b1 --browser --pdf "/path/to/large.pdf"
npm run check
```

## B2：批注与检索

### Task 6：实现阅读上下文、批注版本与 tombstone

**提交：** `feat(research): add contextual annotation domain`

- [ ] 完成命名上下文 CRUD、目录默认绑定和通用层显式契约；系统不自动创建命名上下文。
- [ ] 完成批注创建、更新、删除、恢复、列表和 revision 查询；每次变更使用乐观版本并保存变更前快照。
- [ ] 锚点 schema 覆盖页码、PDF 坐标/quad、文本引用、前后文指纹、Asset hash 和可选 Edition。
- [ ] Asset hash 或 Edition 不匹配时返回 `needs-review`，不静默按旧坐标显示成已确认。
- [ ] 上下文删除前预览批注数量；用户显式选择移到通用层或连同 tombstone 保留在已归档上下文，不永久丢失。
- [ ] 测试同一 Asset 的通用层与两个命名上下文独立、叠加显示、目录重组、并发修订、删除恢复和版本失配。

**验证：**

```bash
npx vitest run modules/research/src/annotation modules/research/src/storage/annotation-repository.test.ts modules/research/src/server/annotation-routes.test.ts
```

### Task 7：完成文本与区域批注界面

**提交：** `feat(research): add pdf annotation workspace`

- [ ] 从 PDF.js 文本层选择生成稳定 quad、引用文本和周边指纹；区域框直接保存 PDF 坐标。
- [ ] 支持高亮、下划线、删除线、区域框、便笺和书签；颜色和正文更新进入同一 revision 语义。
- [ ] 顶部持续显示当前写入层；侧栏可切换可见层、创建命名上下文、绑定目录、搜索和定位批注。
- [ ] 批注列表点击回到准确页和区域；缩放、旋转和布局变化后仍按 PDF 坐标重绘。
- [ ] 删除后提供撤销；恢复、编辑或上下文切换不复制原批注。
- [ ] 键盘可完成选择工具、批注创建、侧栏定位、图层切换和关闭弹层；焦点不被 Canvas 吞掉。
- [ ] 单元测试覆盖坐标转换和锚点生成；真实浏览器验收文本选择、区域拖拽、缩放重绘和图层切换。

**验证：**

```bash
npx vitest run modules/research/src/ui/reader/annotation modules/research/src/ui/reader/anchor.test.ts
npm run typecheck
```

### Task 8：实现可恢复的页级全文索引与搜索

**提交：** `feat(research): index and search pdf page text`

- [ ] `text-index.ts` 把 PDF.js 文本抽取放入可取消任务，不阻塞首个可见页；优先当前页和用户搜索需要页。
- [ ] 逐页提交 `research_page_text` 和 checkpoint，FTS5 与规范页表保持同步；重新启动从最后成功页继续。
- [ ] 支持开始、暂停、取消、恢复和重建；Asset hash 或解析器版本变化时清除旧派生页并重建。
- [ ] 搜索返回 Asset、页码、来源、片段和定位信息；当前文档内结果可跳转，全库结果可打开对应标签页。
- [ ] PDF 文本层不足时标记 `ocr-recommended`，不自动启动 OCR，也不把空索引标成完成。
- [ ] 后台调度在用户滚动、渲染或 OCR 活跃时让步；长文档索引不能占满事件循环。
- [ ] 使用 1000 页生成语料验证暂停、进程重启续建、版本失效、完整重建、中文查询和性能预算。

**验证：**

```bash
npx vitest run modules/research/src/reader/text-index.test.ts modules/research/src/storage/page-text-index.test.ts modules/research/src/server/text-index-routes.test.ts
npm run research:b0
```

### Task 9：完成 B2 端到端与跨宽度验收

**提交：** `test(research): verify annotation and search milestone`

- [ ] 自动流程覆盖同一 PDF 的通用层、两个命名上下文、独立批注、叠加显示、目录默认层和 tombstone 恢复。
- [ ] 自动流程覆盖索引暂停、应用重启续建、搜索定位、Asset 版本失配和重建。
- [ ] 四个目标宽度各用全新状态检查阅读区、批注工具、当前写入层、侧栏/抽屉、长正文和空状态。
- [ ] 真实浏览器手动验收批注选择、坐标重绘、键盘、标签页和后台资源回收。
- [ ] 更新 B2 记录并清理截图、临时 PDF、临时数据库和正文缓存；不清理用户真实缓存。

**验证：**

```bash
npx vitest run modules/research/src/acceptance/slice-b-workflow.test.ts
node scripts/research-reader-visual-qa.mjs --phase b2
npm run check
```

## B3：OCR 与输出

### Task 10：实现隔离、可恢复的 OCR 任务

**提交：** `feat(research): add resumable local pdf ocr`

- [ ] 定义可替换 `OcrEngine`，生产适配器使用 Tesseract.js 独立子进程，默认单 worker。
- [ ] 把 `tesseract.js@7.0.0` 放入实际运行依赖，验证 workspace 安装、打包入口和 Windows 子进程能够直接解析依赖。
- [ ] 在确定随应用分发前记录英语和简体中文语言包的来源、固定版本、许可证、hash 与缓存位置；运行时不临时下载未固定版本。
- [ ] 用户选择语言并确认后才创建任务；每页识别成功后原子写 page text 和 checkpoint，再进入 FTS。
- [ ] 取消终止整个子进程并在 250 ms 预算内收敛；失败/重启保留最后成功页，可重试或从头重建。
- [ ] OCR 缓存按 Asset hash、引擎、语言和语言包版本命中；版本变化后旧结果保留可审计状态但不进入当前索引。
- [ ] UI 显示为什么建议 OCR、预计页数、语言、进度、暂停/取消、错误、恢复和资源提示。
- [ ] 测试生成中英文、扫描型、混合文本/图片、取消、崩溃、重启、版本失效与并发拒绝。

**验证：**

```bash
npx vitest run modules/research/src/ocr modules/research/src/storage/ocr-jobs.test.ts modules/research/src/server/ocr-routes.test.ts
npm run research:b0 -- --ocr --pdf "/path/to/scanned.pdf"
```

### Task 11：实现带批注副本导出与报告

**提交：** `feat(research): export annotated pdf copies`

- [ ] 先以固定 PDF fixture 验证 PDF 写库的标准 annotation、Unicode、旋转页和增量对象能力，通过后锁定依赖版本；失败则只对可靠类型采用扁平化，不伪装为可编辑批注。
- [ ] 导出预览列出范围、可见上下文、批注总数、标准写入数、扁平化数、跳过数和目标大小。
- [ ] 输出选择器只返回用户确认的新路径；目标存在时再次确认，临时文件与最终文件必须位于同一卷以便原子发布。
- [ ] 能可靠表达的文本标记、便笺和区域批注写入标准 PDF annotation；其余类型在页面上扁平化。
- [ ] 报告逐项记录批注 ID、revision、上下文、处理方式和警告，不包含密码或用户未选择的正文。
- [ ] 导出完成后核对输入 Asset hash 未变、输出可由 PDF.js 打开、页数一致；取消/失败删除临时输出。
- [ ] 导出任务可查询、取消和重试；输出不自动导回文献库，用户需要时走普通附件导入。
- [ ] UI 提供预览、目标选择、进度、取消、结果和打开输出位置。

**验证：**

```bash
npx vitest run modules/research/src/interop/annotated-export.test.ts modules/research/src/server/annotated-export-routes.test.ts
```

### Task 12：完成切片 B 最终验收

**提交：** `test(research): complete slice B acceptance`

- [ ] 完整流程覆盖：从文献附件打开 → 阅读状态恢复 → 标签页休眠/重开 → 两个上下文批注 → 正文搜索 → 扫描页确认 OCR → 搜索 OCR 文本 → 导出带批注副本。
- [ ] 验证大型 PDF 打开时不同时启动全文渲染、完整索引和 OCR；用户操作始终优先。
- [ ] 同一浏览器进程重复打开、休眠、关闭至少 20 轮，Range、Canvas、文本层、loading task 和子进程全部收敛，内存无持续增长趋势。
- [ ] 运行默认、1000 页索引、真实大型 PDF、真实扫描页和四宽度视觉验收；记录语料类别、性能、空间和清理结果。
- [ ] Windows 11 x64 在 PDF.js、Range、OCR、子进程和资源回收模块补测后，按两端较慢结果定稿兼容预算；未跑的模块保持待测，不能声明双平台完成。
- [ ] 执行 migration 重跑、`integrity_check`、派生缓存对账、临时任务清理和原始 Asset hash 审计。
- [ ] 对照设计确认切片 B 没有加入证据卡片、观点、跨论文矩阵、AI 总结或原文件回写。
- [ ] 更新设计文档和本计划的真实完成状态、命令、平台记录与最终数字。
- [ ] 执行 `git fetch origin --prune`，检查工作区、提交序列、远端差异和未跟踪产物；只保留本地提交。

**macOS 验证：**

```bash
npm run check
npm run research:b0
node scripts/research-reader-compat.mjs --phase all --browser --ocr --pdf "/path/to/large.pdf" --scanned-pdf "/path/to/scanned.pdf"
node scripts/research-reader-visual-qa.mjs --phase all
```

**Windows 11 x64 同模块验证：**

```powershell
npm run setup
npm run check
npm run research:b0
node .\scripts\research-reader-compat.mjs --phase all --browser --ocr --pdf "C:\path\to\large.pdf" --scanned-pdf "C:\path\to\scanned.pdf"
node .\scripts\research-reader-visual-qa.mjs --phase all
```

命令中的 PDF 路径都是占位符，运行前必须替换为本机真实文件。脚本输出必须匿名化路径，临时 profile、语料、截图和缓存检查完成后清理。

## 完成定义

完整切片 B 只有同时满足以下条件才算完成：

- B1、B2、B3 的所有检查点都有可重复证据，平台相关状态准确记录到测试模块。
- 普通、超长、非线性化、加密、损坏、缺失、扫描和混合型 PDF 都有明确行为。
- 同一 Asset 可以在通用层和至少两个命名上下文中独立批注、叠加显示、删除恢复并准确定位。
- 阅读状态、页级全文索引、OCR checkpoint 和批注 revision 在进程重启后保持正确；派生数据可以重建。
- 原始 PDF hash 始终不变，带批注输出是新文件且附带处理报告。
- 标签休眠、关闭、取消和任务失败后，Canvas、文本层、loading task、Range 流、OCR 子进程和临时文件按预算收敛。
- 1440、1024、768、390 四个宽度使用独立状态完成视觉检查；真实浏览器键盘、文本选择、批注和标签切换完成手动验收。
- macOS arm64 与 Windows 11 x64 的平台相关模块都完成实测后，才能声明切片 B 的 PDF 运行链路双平台兼容。
- `npm run check`、数据库完整性、派生缓存对账和切片 B 端到端流程通过。
- Git 历史由分段绿色提交组成，工作区干净，没有真实论文、私有路径、截图或临时缓存进入 Git；没有 push。
