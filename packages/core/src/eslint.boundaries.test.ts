import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

/**
 * 模块边界的三条铁律是本项目的核心保证（spec §4.2 / §4.3，见 docs/adr/0005）。
 * 铁律 1、2 由 eslint.config.js 的 no-restricted-imports 规则强制；
 * 这份测试直接调用 ESLint 的 Node API 对真实配置跑内联 fixture，
 * 防止将来有人重排 eslint.config.js 时，测试文件豁免块（关闭
 * no-restricted-imports）悄悄吞掉生产代码的边界检查。
 *
 * 之所以放在 packages/core 下：vitest.config.ts 的 include 只收
 * packages/**\/*.test.ts 与 modules/**\/*.test.ts，仓库根目录下的文件不会被
 * 收集，故未放在仓库根。
 */

const eslint = new ESLint();

async function messagesFor(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.message);
}

describe('模块边界规则（架构守卫的回归测试）', () => {
  it('core 不得 import 外层实现', async () => {
    const messages = await messagesFor(
      'packages/core/src/__boundary_probe__.ts',
      "import '@workbench/data';\n",
    );
    expect(messages.join('\n')).toContain('违反 spec §4.2 铁律 2');
  });

  it('模块不得直连数据层', async () => {
    const messages = await messagesFor(
      'modules/probe/src/__boundary_probe__.ts',
      "import '@workbench/data';\n",
    );
    expect(messages.join('\n')).toContain('违反 spec §4.3');
  });

  it('模块之间零依赖', async () => {
    const messages = await messagesFor(
      'modules/probe/src/__boundary_probe__.ts',
      "import '@workbench/module-other';\n",
    );
    expect(messages.join('\n')).toContain('违反 spec §4.2 铁律 1');
  });

  it('packages/ui 允许依赖 core，但不得依赖数据或服务层', async () => {
    const coreMessages = await messagesFor(
      'packages/ui/src/__boundary_probe__.tsx',
      "import '@workbench/core';\n",
    );
    expect(coreMessages.join('\n')).not.toContain('违反 packages/ui 的边界');

    const dataMessages = await messagesFor(
      'packages/ui/src/__boundary_probe__.tsx',
      "import '@workbench/data';\n",
    );
    expect(dataMessages.join('\n')).toContain('违反 packages/ui 的边界');
  });

  it('模块 UI 不得出现裸的 /api/ 字符串字面量', async () => {
    const messages = await messagesFor(
      'modules/probe/src/ui/api.ts',
      "export const p = '/api/other/things';\n",
    );
    expect(messages.join('\n')).toContain('模块 UI 不得硬编码 API 路径');
  });

  it('模板字面量同样被拦——bug 就是从模板字面量那侧漏进来的', async () => {
    const messages = await messagesFor(
      'modules/probe/src/ui/api.ts',
      'export const p = (id: string) => `/api/other/things/${id}`;\n',
    );
    expect(messages.join('\n')).toContain('模块 UI 不得硬编码 API 路径');
  });

  it('contract.ts 里定义路径字面量是合法的——规则只管 ui/', async () => {
    const messages = await messagesFor(
      'modules/probe/src/contract.ts',
      "export const API = { today: '/api/probe/today' };\n",
    );
    expect(messages.join('\n')).not.toContain('模块 UI 不得硬编码 API 路径');
  });

  it('测试文件豁免：断言 fetch 收到的 URL 是正当用法', async () => {
    const messages = await messagesFor(
      'modules/probe/src/ui/api.test.ts',
      "const url = '/api/other/things';\n",
    );
    expect(messages.join('\n')).not.toContain('模块 UI 不得硬编码 API 路径');
  });

  it('测试文件豁免不会波及生产文件', async () => {
    const exempt = await messagesFor(
      'modules/probe/src/probe.test.ts',
      "import '@workbench/data';\n",
    );
    expect(exempt.join('\n')).not.toContain('违反 spec');
  });

  it('模块业务代码不得 import SQLite 或 Drizzle', async () => {
    const messages = await messagesFor(
      'modules/probe/src/server/service.ts',
      "import 'drizzle-orm';\nimport 'better-sqlite3';\n",
    );
    expect(messages.join('\n')).toContain('数据库依赖只能出现在模块 storage 目录');
  });

  it('模块 storage 可用 Drizzle，但仍不得 import @workbench/data', async () => {
    const drizzle = await messagesFor(
      'modules/probe/src/storage/schema.ts',
      "import 'drizzle-orm/sqlite-core';\n",
    );
    expect(drizzle.join('\n')).not.toContain('数据库依赖只能出现在模块 storage 目录');

    const data = await messagesFor(
      'modules/probe/src/storage/schema.ts',
      "import '@workbench/data';\n",
    );
    expect(data.join('\n')).toContain('模块不得直连数据层');
  });
});
