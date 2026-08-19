import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** 依赖倒置：core 是最内层，不得依赖任何外层实现 */
const CORE_FORBIDDEN = [
  '@workbench/data',
  '@workbench/data/*',
  '@workbench/server',
  '@workbench/server/*',
  '@workbench/web',
  '@workbench/web/*',
  '@workbench/module-*',
];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '**/dist/**',
      'packages/data/migrations/**',
      'prototype-workbench/**',
      // 嵌套的 git worktree 是独立检出，有自己的 lint 运行，父仓库不该伸进去。
      '.worktrees/**',
      // Python 虚拟环境（uv / venv 建的）。它靠自带的 .venv/.gitignore 对 git 隐身，
      // 但 git 之外没人认这个：ESLint 9 的 flat config 与 Prettier 都不读 .gitignore，
      // 于是 site-packages 里的 vendored .js 会同时喂给 lint 和 format:check。
      // 每个只看 glob 的工具都要各自排除一次 —— .prettierignore 里也有对应的一行。
      '.venv/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 铁律 1：core 不得依赖外层（spec §4.2 铁律 2 + §9 DIP）
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: CORE_FORBIDDEN,
              message:
                '违反 spec §4.2 铁律 2：core 永不感知外层。core 只定义接口，实现由 data 提供（DIP）。',
            },
          ],
        },
      ],
    },
  },

  // 铁律 2 + 3：模块间零依赖；模块不得直连 data（spec §4.2）
  {
    files: ['modules/**/*.ts', 'modules/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@workbench/module-*'],
              message: '违反 spec §4.2 铁律 1：模块之间零依赖。需要共享的东西应上提到 core。',
            },
            {
              group: ['@workbench/data', '@workbench/data/*'],
              message: '违反 spec §4.3：模块不得直连数据层，只能经由 ModuleContext。',
            },
            {
              group: ['better-sqlite3', 'drizzle-orm', 'drizzle-orm/*'],
              message: '数据库依赖只能出现在模块 storage 目录（ADR-0008）。',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/*/src/storage/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@workbench/module-*'],
              message: '违反 spec §4.2 铁律 1：模块之间零依赖。需要共享的东西应上提到 core。',
            },
            {
              group: ['@workbench/data', '@workbench/data/*'],
              message: '模块不得直连数据层；storage 适配器由组合根注入连接（ADR-0008）。',
            },
          ],
        },
      ],
    },
  },

  // packages/ui 是共享基座与上下文：依赖 @workbench/core 与 react，
  // 不碰数据、服务或任何业务模块。
  // 它之所以独立成包而不放进 packages/web，是为了避免包级循环依赖——
  // web 要 import 模块的 UI，模块的 UI 又要用共享原语。
  {
    files: ['packages/ui/**/*.ts', 'packages/ui/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@workbench/data',
                '@workbench/data/*',
                '@workbench/server',
                '@workbench/server/*',
                '@workbench/web',
                '@workbench/web/*',
                '@workbench/module-*',
              ],
              message:
                '违反 packages/ui 的边界：ui 只能依赖 react 与 @workbench/core。数据、服务与模块不得渗入。',
            },
          ],
        },
      ],
    },
  },

  // 模块 UI 只能经 contract.ts 的常量拿路径（spec §7 前后端的接缝）。
  //
  // 这条规则补的是 no-restricted-imports 的盲区：它只能拦 import，拦不住裸字符串。
  // 2026-08 工作台今日页搬迁时，workbench 的 UI 手抄了 12 条 /api/todo/... 路径，
  // 铁律 1 就此被字符串绕过——lint 全绿，而手抄的响应形状漏了一个 kind 字段，
  // 六个写操作在生产里必抛。
  // 见 docs/superpowers/specs/2026-08-18-item-actions-registry-design.md。
  //
  // 作用域限定在 ui/ 是刻意的：contract.ts 里定义路径字面量正是它的职责，
  // 规则因此不需要知道「当前文件属于哪个模块」。
  {
    files: ['modules/*/src/ui/**/*.ts', 'modules/*/src/ui/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^\\/api\\//]',
          message:
            '模块 UI 不得硬编码 API 路径。路径必须来自本模块 contract.ts 导出的常量——' +
            '服务端注册与前端调用共用同一份，才不会各改一半。跨模块调用请见 ADR-0005。',
        },
        {
          selector: 'TemplateElement[value.raw=/^\\/api\\//]',
          message:
            '模块 UI 不得硬编码 API 路径。路径必须来自本模块 contract.ts 导出的常量——' +
            '服务端注册与前端调用共用同一份，才不会各改一半。跨模块调用请见 ADR-0005。',
        },
      ],
    },
  },

  // 测试文件放宽。
  // no-restricted-imports 必须在此关掉：测试要造真实的 :memory: 库，
  // 必然 import @workbench/data（spec §12.2 不 mock 数据库）。
  // no-restricted-syntax 同理：传输层测试要断言 fetch 收到的 URL 字面量，
  // 那是这类测试唯一有意义的断言对象（见 modules/todo/src/ui/api.test.ts）。
  // 本块置于最后，flat config 后者覆盖前者。
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/testing/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
