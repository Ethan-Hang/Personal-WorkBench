import { FeishuClient } from '../../feishu/client.js';
import { loadFeishuCredentials } from '../../feishu/credentials.js';

export async function syncTasksCommand(): Promise<void> {
  const creds = loadFeishuCredentials();

  if (!creds) {
    console.error('❌ 未找到飞书凭据，请先执行 `pwb feishu auth`。');
    process.exit(1);
  }

  console.log('🔄 正在从飞书拉取待办事项 (Tasks v2)...');
  const client = new FeishuClient(creds);

  try {
    const tasks = await client.listTasks(50);
    console.log(`\n📥 成功拉取到 ${tasks.length} 条飞书待办:`);

    for (const t of tasks) {
      const statusIcon = t.isCompleted ? '✅' : '⏳';
      const dueInfo = t.dueAt ? ` (截止: ${t.dueAt})` : '';
      console.log(`  ${statusIcon} [${t.id.slice(0, 8)}] ${t.summary}${dueInfo}`);
    }

    console.log('\n💡 提示：飞书待办已就绪，可在工作台今日视图或 ⌘K 全局搜索中随时检索。');
  } catch (err) {
    console.error(`❌ 拉取失败: ${(err as Error).message}`);
    process.exit(1);
  }
}
