/**
 * 快捷键的平台判定。
 *
 * 这段判定原先在便签模块里被复制了三份（NoteEditor 的全局与 textarea 两个 handler、
 * NotesPage 的页面级 handler），三份都是同一行正则加同一个三元。
 *
 * 分开写的实际风险不是「不好看」：Windows 上的 Meta 是 Win 键，
 * 把它一并当成修饰键会误触系统快捷键；三份里只要有一份写成
 * `e.metaKey || e.ctrlKey`，就会在某一个入口上出现这个问题，
 * 而它在开发者自己的机器上通常复现不了。
 */

/** 当前是否运行在 Mac 上。SSR / 测试环境下 navigator 可能不存在。 */
export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/**
 * 修饰键是否按下：Mac 认 Cmd，其余平台认 Ctrl。**不是两者取或。**
 *
 * `mac` 可显式传入，便于测试两条分支而不必伪造 navigator。
 */
export function isModifierPressed(
  event: { metaKey: boolean; ctrlKey: boolean },
  mac: boolean = isMacPlatform(),
): boolean {
  return mac ? event.metaKey : event.ctrlKey;
}
