import type { FastifyInstance } from 'fastify';
import {
  SETTING_KEYS,
  parseSettingsPatch,
  resolveSettings,
  type SettingsRepository,
} from '@workbench/core';
import { SETTINGS_API, type SettingsResponse } from './contract.js';

/** 交给 app.ts 的统一错误出口落成 400，同时照常带上请求编号。 */
function badRequest(message: string): Error {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 400;
  return err;
}

function toResponse(raw: Record<string, unknown>): SettingsResponse {
  return {
    settings: resolveSettings(raw),
    storedKeys: SETTING_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(raw, key)),
  };
}

/**
 * 设置路由。**不经模块注册表**——设置不属于任何模块，也没有 core Item，
 * 且外壳启动即需要。判据见 ADR-0018；这条通道不是「懒得写模块」的后门。
 *
 * 校验放在 route 而非 service：这里根本没有 service 层，
 * 因此也不需要 todo 那套 DomainError / toHttp 的桥。
 */
export function registerSettingsRoutes(app: FastifyInstance, repo: SettingsRepository): void {
  app.get(SETTINGS_API.root(), async () => toResponse(await repo.getAll()));

  app.patch(SETTINGS_API.root(), async (request) => {
    const body = request.body as { settings?: unknown } | undefined;
    const result = parseSettingsPatch(body?.settings);
    if (!result.ok) throw badRequest(result.error);
    await repo.setMany(result.patch);
    return toResponse(await repo.getAll());
  });
}
