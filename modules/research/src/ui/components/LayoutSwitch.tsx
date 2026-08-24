export type ResearchLayout = 'compact' | 'template';

export function LayoutSwitch({
  value,
  onChange,
}: {
  value: ResearchLayout;
  onChange: (layout: ResearchLayout) => void;
}) {
  return (
    <div
      className="inline-flex rounded-control border border-line bg-surface-2/65 p-0.5"
      aria-label="文献库布局"
    >
      {(
        [
          ['compact', '紧凑'],
          ['template', '留白'],
        ] as const
      ).map(([layout, label]) => (
        <button
          key={layout}
          type="button"
          aria-pressed={value === layout}
          onClick={() => onChange(layout)}
          className={`rounded-[6px] px-2.5 py-1 text-[11px] font-semibold transition ${
            value === layout ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-secondary'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
