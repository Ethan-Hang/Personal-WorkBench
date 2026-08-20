import fs from 'node:fs';
import path from 'node:path';
import type { FeishuCredentials } from './client.js';

const DEFAULT_DATA_DIR =
  process.env.WORKBENCH_DATA_DIR || path.resolve(process.cwd(), 'data/local');
const CREDENTIALS_FILE = path.join(DEFAULT_DATA_DIR, 'credentials.json');

interface StoredCredentials {
  feishu?: FeishuCredentials;
  [key: string]: unknown;
}

export function loadFeishuCredentials(): FeishuCredentials | undefined {
  // 1. 优先读取环境变量
  if (process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET) {
    return {
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET,
      webhookUrl: process.env.FEISHU_WEBHOOK_URL,
    };
  }

  // 2. 从本地 credentials.json 读取
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    return undefined;
  }

  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as StoredCredentials;
    return parsed.feishu;
  } catch {
    return undefined;
  }
}

export function saveFeishuCredentials(creds: FeishuCredentials): void {
  fs.mkdirSync(DEFAULT_DATA_DIR, { recursive: true });

  let data: StoredCredentials = {};
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
      data = JSON.parse(raw) as StoredCredentials;
    } catch {
      data = {};
    }
  }

  data.feishu = creds;
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
