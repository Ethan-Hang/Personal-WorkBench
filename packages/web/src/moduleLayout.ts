/**
 * 侧边栏「专业模块」的排布：顺序与开关。
 *
 * 存的是一串模块 id（设置键 `workbench.moduleOrder`），**注册表才是真相**：
 * 顺序只是一份偏好提示。因此这里的两条规则是承重的——
 * 顺序里对不上注册表的 id 直接忽略（模块被删掉了），注册表里没被顺序提到的追加在末尾
 * （刚装的新模块）。少了任何一条，加一个模块或删一个模块都会让侧边栏少东西，且不报错。
 */

export interface OrderableModule {
  id: string;
}

/**
 * 「核心工作」那一组的成员，其余注册模块一律归「专业模块」——因此**加模块不需要改这里**。
 * todo 留在集合里是刻意的：它现在没注册 UI，将来若挂回来也该落在核心组。
 */
export const CORE_MODULE_IDS: ReadonlySet<string> = new Set(['workbench', 'todo']);

/** 按存好的 id 顺序重排；未提及的按注册表原序追加在后面。 */
export function applyModuleOrder<T extends OrderableModule>(
  modules: readonly T[],
  order: readonly string[],
): T[] {
  const remaining = new Map(modules.map((m) => [m.id, m]));
  const ordered: T[] = [];
  for (const id of order) {
    const found = remaining.get(id);
    if (found) {
      ordered.push(found);
      remaining.delete(id);
    }
  }
  for (const m of modules) {
    if (remaining.has(m.id)) ordered.push(m);
  }
  return ordered;
}

/**
 * 把 `index` 处的元素上移或下移一位，返回新数组。越界时原样返回——
 * 首项上移与末项下移是按钮 disabled 的正常状态，不是错误。
 */
export function moveInList<T>(list: readonly T[], index: number, direction: 'up' | 'down'): T[] {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
    return [...list];
  }
  const next = [...list];
  const moved = next[index] as T;
  next[index] = next[target] as T;
  next[target] = moved;
  return next;
}

/**
 * 这个模块是不是被关掉了。
 *
 * **核心模块永远返回 false**，哪怕设置里真的存着它的 id——这一条是承重的：
 * 关掉工作台会让今日与周历一起消失，首页 `/` 的重定向也没了目标，
 * 而设置是能被手工改库或从别的设备同步过来的。把保护放在这个纯函数里，
 * 侧边栏、路由与设置页三处才不可能各判各的。
 */
export function isModuleDisabled(id: string, disabled: readonly string[]): boolean {
  if (CORE_MODULE_IDS.has(id)) return false;
  return disabled.includes(id);
}

/** 只留下没被关掉的模块。 */
export function enabledModules<T extends OrderableModule>(
  modules: readonly T[],
  disabled: readonly string[],
): T[] {
  return modules.filter((m) => !isModuleDisabled(m.id, disabled));
}

/** 加入或移除一个 id，返回新数组。核心模块不可关，请求关它时原样返回。 */
export function toggleDisabled(
  disabled: readonly string[],
  id: string,
  nextDisabled: boolean,
): string[] {
  if (nextDisabled && CORE_MODULE_IDS.has(id)) return [...disabled];
  const without = disabled.filter((d) => d !== id);
  return nextDisabled ? [...without, id] : without;
}
