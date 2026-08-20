export interface FeishuCredentials {
  appId: string;
  appSecret: string;
  userToken?: string;
  webhookUrl?: string;
}

export interface FeishuTaskItem {
  id: string;
  summary: string;
  description?: string;
  dueAt?: string;
  completedAt?: string;
  isCompleted: boolean;
}

export interface FeishuCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  isAllDay: boolean;
}

export interface FeishuBitableRecord {
  recordId: string;
  fields: Record<string, unknown>;
}

export class FeishuClient {
  private cachedToken?: { token: string; expiresAt: number };

  constructor(private readonly credentials: FeishuCredentials) {}

  /**
   * 获取或复用有效的租户访问凭证 (tenant_access_token)
   */
  async getTenantAccessToken(): Promise<string> {
    if (this.credentials.userToken) {
      return this.credentials.userToken;
    }

    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.token;
    }

    const res = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          app_id: this.credentials.appId,
          app_secret: this.credentials.appSecret,
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`飞书鉴权请求失败 HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      code: number;
      msg: string;
      tenant_access_token?: string;
      expire?: number;
    };

    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(`飞书鉴权错误 (${data.code}): ${data.msg}`);
    }

    this.cachedToken = {
      token: data.tenant_access_token,
      expiresAt: now + (data.expire ?? 7200) * 1000,
    };

    return this.cachedToken.token;
  }

  /**
   * 拉取飞书待办列表 (Tasks v2)
   */
  async listTasks(pageSize = 50): Promise<FeishuTaskItem[]> {
    const token = await this.getTenantAccessToken();
    const url = new URL('https://open.feishu.cn/open-apis/task/v2/tasks');
    url.searchParams.set('page_size', String(pageSize));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`拉取飞书待办失败 HTTP ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as {
      code: number;
      msg: string;
      data?: {
        items?: Array<{
          guid?: string;
          summary?: string;
          description?: string;
          due?: { timestamp?: string };
          completed_at?: string;
        }>;
      };
    };

    if (body.code !== 0) {
      throw new Error(`拉取飞书待办错误 (${body.code}): ${body.msg}`);
    }

    return (body.data?.items ?? []).map((t) => ({
      id: t.guid ?? '',
      summary: t.summary ?? '未命名待办',
      description: t.description,
      dueAt: t.due?.timestamp ? new Date(Number(t.due.timestamp)).toISOString() : undefined,
      completedAt: t.completed_at ? new Date(Number(t.completed_at)).toISOString() : undefined,
      isCompleted: !!t.completed_at && t.completed_at !== '0',
    }));
  }

  /**
   * 拉取飞书主日历日程 (Calendar v4)
   */
  async listCalendarEvents(calendarId = 'primary'): Promise<FeishuCalendarEvent[]> {
    const token = await this.getTenantAccessToken();
    const url = `https://open.feishu.cn/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`拉取飞书日程失败 HTTP ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as {
      code: number;
      msg: string;
      data?: {
        items?: Array<{
          event_id?: string;
          summary?: string;
          description?: string;
          start_time?: { timestamp?: string; date?: string };
          end_time?: { timestamp?: string; date?: string };
        }>;
      };
    };

    if (body.code !== 0) {
      throw new Error(`拉取飞书日程错误 (${body.code}): ${body.msg}`);
    }

    return (body.data?.items ?? []).map((e) => {
      const isAllDay = !!e.start_time?.date;
      return {
        id: e.event_id ?? '',
        summary: e.summary ?? '未命名日程',
        description: e.description,
        startTime: isAllDay
          ? e.start_time?.date
          : e.start_time?.timestamp
            ? new Date(Number(e.start_time.timestamp) * 1000).toISOString()
            : undefined,
        endTime: isAllDay
          ? e.end_time?.date
          : e.end_time?.timestamp
            ? new Date(Number(e.end_time.timestamp) * 1000).toISOString()
            : undefined,
        isAllDay,
      };
    });
  }

  /**
   * 拉取飞书多维表格数据 (Bitable v1)
   */
  async listBitableRecords(appToken: string, tableId: string): Promise<FeishuBitableRecord[]> {
    const token = await this.getTenantAccessToken();
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`拉取飞书多维表格失败 HTTP ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as {
      code: number;
      msg: string;
      data?: {
        items?: Array<{
          record_id?: string;
          fields?: Record<string, unknown>;
        }>;
      };
    };

    if (body.code !== 0) {
      throw new Error(`拉取飞书多维表格错误 (${body.code}): ${body.msg}`);
    }

    return (body.data?.items ?? []).map((r) => ({
      recordId: r.record_id ?? '',
      fields: r.fields ?? {},
    }));
  }

  /**
   * 推送机器人通知消息
   */
  async sendWebhook(content: string): Promise<void> {
    if (!this.credentials.webhookUrl) {
      throw new Error('未配置飞书群 Webhook 机器人链接');
    }

    const res = await fetch(this.credentials.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        msg_type: 'text',
        content: { text: content },
      }),
    });

    if (!res.ok) {
      throw new Error(`发送飞书通知失败 HTTP ${res.status}: ${await res.text()}`);
    }
  }
}
