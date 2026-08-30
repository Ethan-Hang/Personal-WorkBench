import { NavLink } from 'react-router';

const sections = [
  { to: '/research', label: '文献库', end: true },
  { to: '/research/knowledge', label: '研究知识', end: false },
] as const;

export function ResearchSectionNav() {
  return (
    <nav
      aria-label="研究工作区"
      className="flex h-11 shrink-0 items-end gap-5 border-b border-line bg-surface px-4 sm:px-6"
    >
      {sections.map((section) => (
        <NavLink
          key={section.to}
          to={section.to}
          end={section.end}
          className={({ isActive }) =>
            `flex h-full items-center border-b-2 text-xs font-semibold transition-colors ${
              isActive
                ? 'border-accent text-ink'
                : 'border-transparent text-muted hover:text-secondary'
            }`
          }
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
