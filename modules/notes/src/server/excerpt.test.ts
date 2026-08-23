import { describe, expect, it } from 'vitest';
import { deriveExcerpt } from './excerpt.js';

describe('deriveExcerpt', () => {
  it('剥掉标题、强调与行内代码，只留下正文', () => {
    expect(deriveExcerpt('# 标题\n\n**加粗**与 `code` 与 *斜体*')).toBe('标题 加粗与 code 与 斜体');
  });

  it('整块丢掉围栏代码——摘要里出现半截代码比空着更糟', () => {
    const content = '前言\n\n```ts\nconst a = 1;\n```\n\n后记';
    expect(deriveExcerpt(content)).toBe('前言 后记');
  });

  it('容器指令只丢标记行，保留里面的正文', () => {
    expect(deriveExcerpt('::: tip 提示\n真正的内容\n:::')).toBe('真正的内容');
  });

  it('链接只留可见文字，图片整体丢掉', () => {
    expect(deriveExcerpt('见[文档](https://example.com)与![图](a.png)')).toBe('见文档与');
  });

  it('Obsidian 双链取显示名', () => {
    expect(deriveExcerpt('参考 [[目标便签|别名]] 与 [[另一条]]')).toBe('参考 别名 与 另一条');
  });

  it('马克笔高亮与刮刮乐的标记不进摘要', () => {
    expect(deriveExcerpt('==重点==与!!隐秘!!')).toBe('重点与隐秘');
  });

  it('列表与引用的行首标记被剥掉，换行折叠成空格', () => {
    expect(deriveExcerpt('> 引用\n- 甲\n- 乙\n1. 丙')).toBe('引用 甲 乙 丙');
  });

  it('超长正文按码点截断并加省略号', () => {
    const excerpt = deriveExcerpt('あ'.repeat(300), 10);
    expect(excerpt).toBe(`${'あ'.repeat(10)}…`);
  });

  it('按码点而不是 UTF-16 码元截断——否则会把 emoji 劈成两半', () => {
    const excerpt = deriveExcerpt('🌱🌿🌳🌴🌵', 3);
    expect(excerpt).toBe('🌱🌿🌳…');
  });

  it('空正文得到空摘要，不抛错', () => {
    expect(deriveExcerpt('')).toBe('');
    expect(deriveExcerpt('   \n\n  ')).toBe('');
  });
});
