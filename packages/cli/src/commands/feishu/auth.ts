import { FeishuClient, type FeishuCredentials } from '../../feishu/client.js';
import { saveFeishuCredentials } from '../../feishu/credentials.js';

export async function authCommand(options: {
  appId?: string;
  appSecret?: string;
  webhookUrl?: string;
  userToken?: string;
}): Promise<void> {
  if (!options.appId || !options.appSecret) {
    console.error('❌ 缺少必需参数：--app-id 和 --app-secret');
    console.log('\n使用示例：');
    console.log('  pwb feishu auth --app-id cli_a1b2c3d4 --app-secret secret_xxx');
    process.exit(1);
  }

  const credentials: FeishuCredentials = {
    appId: options.appId,
    appSecret: options.appSecret,
    webhookUrl: options.webhookUrl,
    userToken: options.userToken,
  };

  console.log('🔄 正在验证飞书开放平台凭据...');
  const client = new FeishuClient(credentials);

  try {
    const token = await client.getTenantAccessToken();
    saveFeishuCredentials(credentials);
    console.log('✅ 飞书凭据验证成功并已安全保存！');
    console.log(`🔑 获得 Tenant Access Token: ${token.slice(0, 8)}...${token.slice(-4)}`);
  } catch (err) {
    console.error(`❌ 鉴权失败: ${(err as Error).message}`);
    process.exit(1);
  }
}
