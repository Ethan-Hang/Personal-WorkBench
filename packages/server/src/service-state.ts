import type { FastifyInstance } from 'fastify';

/**
 * 全服务状态。
 *
 * 换库文件的那一刻，读和写一样会碎，所以这里是**全服务暂停**而不是只挡写——
 * 两套机制只会多出一个边界。切换账号（TASK-036）与恢复（TASK-031/032）
 * 共用这一个状态与这一道闸，不各造一套。
 */
export type ServiceStateName =
  'idle' | 'switching' | 'preflight' | 'awaiting-confirm' | 'restoring' | 'rolling-back' | 'failed';

export interface ServiceStateSnapshot {
  state: ServiceStateName;
  /** 人话的当前步骤，直接显示给用户。 */
  step?: string;
}

/** 忙碌期间仍然可达的前缀。前端靠 /api/health 观察什么时候恢复正常。 */
const ALLOWED_PREFIXES = ['/api/health', '/api/restore'];

export class ServiceState {
  private snapshot: ServiceStateSnapshot = { state: 'idle' };

  current(): ServiceStateSnapshot {
    return { ...this.snapshot };
  }

  isBusy(): boolean {
    return this.snapshot.state !== 'idle';
  }

  enter(state: Exclude<ServiceStateName, 'idle'>, step?: string): void {
    if (this.isBusy()) {
      throw new Error(`服务正忙（${this.snapshot.state}），无法进入 ${state}`);
    }
    this.snapshot = step === undefined ? { state } : { state, step };
  }

  /** 忙碌态内部推进步骤，不改状态名。 */
  advance(step: string): void {
    this.snapshot = { ...this.snapshot, step };
  }

  reset(): void {
    this.snapshot = { state: 'idle' };
  }
}

function isAllowed(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * 全局 preHandler。状态非 idle 且不在白名单 → 503 + `{ state, step }`。
 *
 * 前端 React Query 的全局 onError 认这个 503 就切全屏遮罩，多标签页因此自动同步，
 * 不需要额外的广播机制。
 */
export function registerServiceStateGate(app: FastifyInstance, state: ServiceState): void {
  app.addHook('preHandler', async (request, reply) => {
    if (!state.isBusy() || isAllowed(request.url)) return;
    const snapshot = state.current();
    await reply.code(503).send({
      error: snapshot.step ?? '服务正忙，请稍候',
      ...snapshot,
      requestId: request.id,
    });
  });
}
