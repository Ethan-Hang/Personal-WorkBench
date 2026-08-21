import { describe, it, expect } from 'vitest';
import { extractToc } from './toc.js';

describe('extractToc', () => {
  it('从 Markdown 文本中提取 H1 ~ H6 标题层级', () => {
    const md = `
# 一级标题
正文内容
## 二级标题 A
### 三级标题
## 二级标题 B
#### 四级标题
`;
    const toc = extractToc(md);
    expect(toc).toHaveLength(5);
    expect(toc[0]).toEqual({ id: '一级标题', level: 1, text: '一级标题' });
    expect(toc[1]).toEqual({ id: '二级标题-a', level: 2, text: '二级标题 A' });
    expect(toc[2]).toEqual({ id: '三级标题', level: 3, text: '三级标题' });
    expect(toc[3]).toEqual({ id: '二级标题-b', level: 2, text: '二级标题 B' });
    expect(toc[4]).toEqual({ id: '四级标题', level: 4, text: '四级标题' });
  });

  it('正确处理重复标题并生成唯一 slug id', () => {
    const md = `
## 快速开始
## 快速开始
## 快速开始
`;
    const toc = extractToc(md);
    expect(toc).toHaveLength(3);
    expect(toc[0]?.id).toBe('快速开始');
    expect(toc[1]?.id).toBe('快速开始-1');
    expect(toc[2]?.id).toBe('快速开始-2');
  });

  it('忽略代码块与容器内的 # 符号', () => {
    const md = `
# 真实标题
\`\`\`bash
# 这里的不是标题
echo "hello"
\`\`\`
## 真实子标题
`;
    const toc = extractToc(md);
    expect(toc).toHaveLength(2);
    expect(toc[0]?.text).toBe('真实标题');
    expect(toc[1]?.text).toBe('真实子标题');
  });
});
