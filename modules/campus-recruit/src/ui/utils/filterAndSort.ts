import type {
  ApplicationPriority,
  ApplicationStatusCode,
  ApplicationView,
} from '../../contract.js';

export type StatusFilterOption =
  'all' | 'active' | 'pending' | 'applied' | 'interviewing' | 'offer' | 'failed';

export type SortByOption =
  'updated-desc' | 'created-desc' | 'priority-desc' | 'deadline-asc' | 'interview-asc';

export interface FilterAndSortOptions {
  query: string;
  statusFilter: StatusFilterOption;
  priorityFilter: ApplicationPriority | 'all';
  sortBy: SortByOption;
}

const PRIORITY_WEIGHT: Record<ApplicationPriority, number> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
};

/**
 * 提取该投递最临近/最新的面试排期时间（用于按面试时间排序）
 */
export function getEarliestUpcomingInterviewTime(application: ApplicationView): string | null {
  const scheduledRounds = application.rounds
    .filter((r) => r.scheduledAt !== null && r.outcome === 'pending')
    .map((r) => r.scheduledAt!)
    .sort();

  if (scheduledRounds.length > 0) {
    return scheduledRounds[0] ?? null;
  }

  // 如果没有 pending 的排期，找最近发生的一轮
  const allScheduled = application.rounds
    .filter((r) => r.scheduledAt !== null)
    .map((r) => r.scheduledAt!)
    .sort()
    .reverse();

  return allScheduled[0] ?? null;
}

/**
 * 判断某条投递是否符合状态过滤条件
 */
export function matchesStatusFilter(
  statusCode: ApplicationStatusCode,
  filter: StatusFilterOption,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') {
    return statusCode !== 'failed' && statusCode !== 'declined' && statusCode !== 'shelved';
  }
  if (filter === 'pending') return statusCode === 'pending';
  if (filter === 'applied') return statusCode === 'applied';
  if (filter === 'interviewing') return statusCode === 'in_progress';
  if (filter === 'offer') return statusCode === 'offer' || statusCode === 'oc';
  if (filter === 'failed') {
    return statusCode === 'failed' || statusCode === 'declined' || statusCode === 'shelved';
  }
  return true;
}

/**
 * 判断某条投递是否符合搜索关键词
 */
export function matchesQuery(application: ApplicationView, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === '') return true;

  const searchableText = [
    application.company,
    application.position,
    application.city ?? '',
    application.industry ?? '',
    application.companyType ?? '',
    application.channel ?? '',
    application.referral ?? '',
    application.status.label,
    ...application.rounds.map((r) => `${r.name} ${r.notes ?? ''}`),
    application.notes ?? '',
  ]
    .join(' ')
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

/**
 * 过滤与排序主逻辑
 */
export function filterAndSortApplications(
  applications: ApplicationView[],
  options: FilterAndSortOptions,
): ApplicationView[] {
  const { query, statusFilter, priorityFilter, sortBy } = options;

  return applications
    .filter((app) => {
      if (!matchesQuery(app, query)) return false;
      if (!matchesStatusFilter(app.status.code, statusFilter)) return false;
      if (priorityFilter !== 'all' && app.priority !== priorityFilter) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'priority-desc': {
          const diff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
          if (diff !== 0) return diff;
          return b.updatedAt.localeCompare(a.updatedAt);
        }
        case 'deadline-asc': {
          if (a.applyDeadlineDate === null && b.applyDeadlineDate === null) {
            return b.updatedAt.localeCompare(a.updatedAt);
          }
          if (a.applyDeadlineDate === null) return 1;
          if (b.applyDeadlineDate === null) return -1;
          const diff = a.applyDeadlineDate.localeCompare(b.applyDeadlineDate);
          if (diff !== 0) return diff;
          return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        }
        case 'interview-asc': {
          const timeA = getEarliestUpcomingInterviewTime(a);
          const timeB = getEarliestUpcomingInterviewTime(b);
          if (timeA === null && timeB === null) {
            return b.updatedAt.localeCompare(a.updatedAt);
          }
          if (timeA === null) return 1;
          if (timeB === null) return -1;
          return timeA.localeCompare(timeB);
        }
        case 'created-desc':
          return b.createdAt.localeCompare(a.createdAt);
        case 'updated-desc':
        default:
          return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
}
