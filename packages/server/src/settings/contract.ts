import type { AppSettings, SettingKey } from '@workbench/core';

/**
 * 设置的前后端接缝。
 *
 * 与模块的 contract.ts 有两处刻意的不同：
 *
 * 1. **不放 Zod schema**。core 的 SETTINGS_CODECS 已经是「什么算合法设置」的唯一真相，
 *    服务端校验入参与客户端校验响应都调它；再写一份 Zod 就是两份口径，早晚各改一半。
 * 2. **路径本身住在 core**。packages/web 不能依赖 packages/server（会把 Fastify 拉进
 *    浏览器产物），所以路径必须落在两边都能 import 的地方。这里只是转出来，
 *    让服务端的 import 位置与模块保持同形。
 */
export { SETTINGS_API } from '@workbench/core';

export interface SettingsResponse {
  settings: AppSettings;
  /**
   * 库里**真实存在**的键。没有它，客户端无法区分「库里存的恰好是默认值」与
   * 「库里根本没有这一项」，一次性迁移旧 localStorage 时就只能盲写覆盖。
   */
  storedKeys: SettingKey[];
}

export interface SettingsPatchBody {
  settings: Partial<AppSettings>;
}
