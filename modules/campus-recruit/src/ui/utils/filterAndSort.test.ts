import { describe, expect, it } from 'vitest';
import type { ApplicationView } from '../../contract.js';
import {
  filterAndSortApplications,
  getEarliestUpcomingInterviewTime,
  matchesQuery,
  matchesStatusFilter,
} from './filterAndSort.js';

function createMockApp(partial: Partial<ApplicationView>): ApplicationView {
  return {
    id: 'app-1',
    company: '华为',
    position: '嵌入式软件工程师',
    companyType: '民营大厂',
    industry: 'ICT通信',
    city: '深圳',
    channel: '官网直投',
    referral: 'REF123',
    priority: 'S',
    applyDeadlineDate: '2026-09-15',
    appliedAt: '2026-08-10T10:00:00.000Z',
    outcome: null,
    outcomeAt: null,
    salary: null,
    link: 'https://example.com',
    notes: '重点关注BSP方向',
    status: {
      code: 'in_progress',
      label: '流程中 · 技术一面',
      failedRoundName: null,
    },
    rounds: [
      {
        id: 'r-1',
        applicationId: 'app-1',
        sequence: 1,
        kind: 'technical',
        name: '技术一面',
        scheduledAt: '2026-08-20T14:00:00.000Z',
        format: '线上视频',
        durationMin: 60,
        outcome: 'pending',
        outcomeAt: null,
        notes: '手撕链表反转',
        itemId: 'item-1',
      },
    ],
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z',
    ...partial,
  };
}

describe('filterAndSort', () => {
  it('matchesQuery: 匹配公司名、岗位、城市或备注', () => {
    const app = createMockApp({ company: '大疆创新', position: '飞控算法', city: '深圳' });
    expect(matchesQuery(app, '大疆')).toBe(true);
    expect(matchesQuery(app, '算法')).toBe(true);
    expect(matchesQuery(app, '深圳')).toBe(true);
    expect(matchesQuery(app, '腾讯')).toBe(false);
  });

  it('matchesStatusFilter: 正确过滤状态分类', () => {
    expect(matchesStatusFilter('pending', 'pending')).toBe(true);
    expect(matchesStatusFilter('in_progress', 'active')).toBe(true);
    expect(matchesStatusFilter('offer', 'offer')).toBe(true);
    expect(matchesStatusFilter('oc', 'offer')).toBe(true);
    expect(matchesStatusFilter('failed', 'failed')).toBe(true);
    expect(matchesStatusFilter('declined', 'failed')).toBe(true);
    expect(matchesStatusFilter('shelved', 'failed')).toBe(true);
    expect(matchesStatusFilter('failed', 'active')).toBe(false);
  });

  it('getEarliestUpcomingInterviewTime: 优先获取待定的最早面试排期', () => {
    const app = createMockApp({
      rounds: [
        {
          id: 'r-1',
          applicationId: 'app-1',
          sequence: 1,
          kind: 'technical',
          name: '一面',
          scheduledAt: '2026-08-25T10:00:00.000Z',
          format: null,
          durationMin: null,
          outcome: 'pending',
          outcomeAt: null,
          notes: null,
          itemId: null,
        },
        {
          id: 'r-2',
          applicationId: 'app-1',
          sequence: 2,
          kind: 'hr',
          name: 'HR面',
          scheduledAt: '2026-08-28T10:00:00.000Z',
          format: null,
          durationMin: null,
          outcome: 'pending',
          outcomeAt: null,
          notes: null,
          itemId: null,
        },
      ],
    });
    expect(getEarliestUpcomingInterviewTime(app)).toBe('2026-08-25T10:00:00.000Z');
  });

  it('filterAndSortApplications: 按优先级与截止日排序', () => {
    const app1 = createMockApp({
      id: '1',
      company: 'A公司',
      priority: 'B',
      applyDeadlineDate: '2026-09-20',
    });
    const app2 = createMockApp({
      id: '2',
      company: 'B公司',
      priority: 'S',
      applyDeadlineDate: '2026-09-10',
    });
    const app3 = createMockApp({
      id: '3',
      company: 'C公司',
      priority: 'A',
      applyDeadlineDate: null,
    });

    const sortedByPriority = filterAndSortApplications([app1, app2, app3], {
      query: '',
      statusFilter: 'all',
      priorityFilter: 'all',
      sortBy: 'priority-desc',
    });
    expect(sortedByPriority.map((a) => a.priority)).toEqual(['S', 'A', 'B']);

    const sortedByDeadline = filterAndSortApplications([app1, app2, app3], {
      query: '',
      statusFilter: 'all',
      priorityFilter: 'all',
      sortBy: 'deadline-asc',
    });
    expect(sortedByDeadline.map((a) => a.id)).toEqual(['2', '1', '3']);
  });
});
