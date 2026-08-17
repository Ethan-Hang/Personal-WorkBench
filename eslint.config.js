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
          ],
        },
      ],
    },
  },

  // packages/ui 是纯展示层：只依赖 react，不碰领域、数据、服务或任何模块。
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
                '@workbench/core',
                '@workbench/core/*',
                '@workbench/data',
                '@workbench/data/*',
                '@workbench/server',
                '@workbench/server/*',
                '@workbench/web',
                '@workbench/web/*',
                '@workbench/module-*',
              ],
              message:
                '违反 packages/ui 的边界：它是纯展示原语，只能依赖 react。领域概念不得渗入。',
            },
          ],
        },
      ],
    },
  },

  // 测试文件放宽。
  // no-restricted-imports 必须在此关掉：测试要造真实的 :memory: 库，
  // 必然 import @workbench/data（spec §12.2 不 mock 数据库）。
  // 本块置于最后，flat config 后者覆盖前者。
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/testing/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-imports': 'off',
    },
  },
);
