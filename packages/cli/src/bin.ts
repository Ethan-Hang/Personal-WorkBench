#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { authCommand } from './commands/feishu/auth.js';
import { statusCommand } from './commands/feishu/status.js';
import { syncTasksCommand } from './commands/feishu/syncTasks.js';

function printHelp(): void {
  console.log(`
个人工作台 CLI 工具 (Personal WorkBench CLI)

使用格式:
  pwb <command> [options]

可用指令:
  feishu auth          配置飞书自建应用鉴权凭据
                       --app-id <id>       飞书 App ID
                       --app-secret <sec>  飞书 App Secret
                       --webhook <url>     (可选) 飞书群机器人 Webhook URL

  feishu status        查看飞书配置与连接状态
  feishu sync-tasks    拉取飞书待办列表

  help                 查看帮助信息

示例:
  pwb feishu auth --app-id cli_xxx --app-secret secret_xxx
  pwb feishu status
  pwb feishu sync-tasks
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const primary = args[0];
  const secondary = args[1];

  if (primary === 'feishu') {
    if (secondary === 'auth') {
      const { values } = parseArgs({
        args: args.slice(2),
        options: {
          'app-id': { type: 'string' },
          'app-secret': { type: 'string' },
          webhook: { type: 'string' },
          'user-token': { type: 'string' },
        },
        allowPositionals: true,
      });

      await authCommand({
        appId: values['app-id'],
        appSecret: values['app-secret'],
        webhookUrl: values.webhook,
        userToken: values['user-token'],
      });
      return;
    }

    if (secondary === 'status') {
      await statusCommand();
      return;
    }

    if (secondary === 'sync-tasks' || secondary === 'sync') {
      await syncTasksCommand();
      return;
    }

    console.error(`未知飞书子命令: ${secondary ?? ''}`);
    printHelp();
    process.exit(1);
  }

  console.error(`未知命令: ${primary}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error('运行异常:', err);
  process.exit(1);
});
