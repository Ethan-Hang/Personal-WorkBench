import { FeishuClient } from '../../feishu/client.js';
import { loadFeishuCredentials } from '../../feishu/credentials.js';

export async function statusCommand(): Promise<void> {
  const creds = loadFeishuCredentials();

  if (!creds) {
    console.log(
      '⚠️ 尚未配置飞书凭据。请运行 `pwb feishu auth --app-id <id> --app-secret <secret>` 进行配置。',
    );
    return;
  }

  console.log('📋 飞书配置状态:');
  console.log(`  • App ID: ${creds.appId}`);
  console.log(`  • App Secret: ${creds.appSecret.slice(0, 4)}********`);
  if (creds.webhookUrl) {
    console.log(`  • Webhook: ${creds.webhookUrl.slice(0, 25)}...`);
  }

  console.log('\n🔄 正在测试连接...');
  const client = new FeishuClient(creds);

  try {
    const token = await client.getTenantAccessToken();
    console.log('✅ 飞书开放平台连接正常');
    console.log(`🔑 凭证有效期内 (Token: ${token.slice(0, 6)}...)`);
  } catch (err) {
    console.error(`❌ 连接失败: ${(err as Error).message}`);
  }
}
