import { controlClass, IconBriefcase } from '@workbench/ui';
import { SEASON_KINDS, type SeasonKind, type SeasonView } from '../../contract.js';

export const SEASON_KIND_LABEL: Record<SeasonKind, string> = {
  'campus-autumn': '校招秋招',
  'campus-spring': '校招春招',
  intern: '实习',
  social: '社招',
};

/** 供管理弹窗的类型下拉复用，顺序与 contract 的 SEASON_KINDS 一致 */
export const SEASON_KIND_OPTIONS = SEASON_KINDS.map((kind) => ({
  id: kind,
  label: SEASON_KIND_LABEL[kind],
}));

interface SeasonSwitcherProps {
  seasons: SeasonView[];
  currentId: string | null;
  onChange: (seasonId: string) => void;
  onManage: () => void;
  disabled?: boolean;
}

const MANAGE_VALUE = '__manage__';

/**
 * 当前招聘季切换器。
 *
 * 已归档的季不出现在常规列表里，除非它正被选中——归档只影响默认列举，
 * 不该把人踢出他正在看的那一季（与 `pickInitialSeason` 是同一条规则）。
 *
 * 末项「管理招聘季…」是个动作而不是一个季，选中它不改变当前季。
 */
export function SeasonSwitcher({
  seasons,
  currentId,
  onChange,
  onManage,
  disabled = false,
}: SeasonSwitcherProps) {
  const visible = seasons.filter((season) => season.archivedAt === null || season.id === currentId);
  const archivedCount = seasons.length - visible.length;

  return (
    <label className="flex items-center gap-1.5" title="当前招聘季">
      <IconBriefcase size={14} className="shrink-0 text-muted" />
      <span className="sr-only">当前招聘季</span>
      <select
        value={currentId ?? ''}
        disabled={disabled || seasons.length === 0}
        onChange={(e) => {
          if (e.target.value === MANAGE_VALUE) {
            onManage();
            return;
          }
          onChange(e.target.value);
        }}
        className={`${controlClass} py-1 text-[12px] font-semibold`}
      >
        {visible.map((season) => (
          <option key={season.id} value={season.id}>
            {season.name}
            {season.archivedAt === null ? '' : '（已归档）'} · {season.applicationCount}
          </option>
        ))}
        <option value={MANAGE_VALUE}>
          管理招聘季…{archivedCount > 0 ? `（另有 ${archivedCount} 个已归档）` : ''}
        </option>
      </select>
    </label>
  );
}
