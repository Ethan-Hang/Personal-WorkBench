import { describe, expect, it } from 'vitest';
import { nameForKindChange, suggestRoundKind } from './roundNaming.js';

describe('nameForKindChange', () => {
  it('名称为空时带上类型名', () => {
    expect(nameForKindChange('written', '')).toBe('笔试');
    expect(nameForKindChange('hr', '   ')).toBe('HR面');
  });

  it('改写上一次自动填进去的类型名', () => {
    expect(nameForKindChange('technical', '笔试')).toBe('专业面');
  });

  it('不覆盖手打过的名字', () => {
    expect(nameForKindChange('hr', '技术二面')).toBeNull();
  });

  it('选「其他」时不填——那是分类不是名字', () => {
    expect(nameForKindChange('other', '')).toBeNull();
    expect(nameForKindChange('other', '笔试')).toBeNull();
  });

  it('名称已经等于目标类型名时不动，避免多一次无谓渲染', () => {
    expect(nameForKindChange('assessment', '测评')).toBeNull();
  });
});

describe('suggestRoundKind', () => {
  it('从名称反推类型', () => {
    expect(suggestRoundKind('在线笔试')).toBe('written');
    expect(suggestRoundKind('性格测评')).toBe('assessment');
    expect(suggestRoundKind('HR 终面')).toBe('hr');
    expect(suggestRoundKind('技术二面')).toBe('technical');
    expect(suggestRoundKind('宣讲会')).toBe('other');
  });
});
