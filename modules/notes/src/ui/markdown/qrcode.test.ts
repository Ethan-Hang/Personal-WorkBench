import { describe, it, expect } from 'vitest';
import { generateQrSvg } from './qrcode.js';

describe('qrcode generator (Offline Local-First SVG)', () => {
  it('为普通 URL 生成合法可渲染的 SVG 字符串', () => {
    const svg = generateQrSvg('https://github.com/Ethan-Hang/Personal-WorkBench');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('rect');
  });

  it('支持自定义尺寸与前景色背景色', () => {
    const svg = generateQrSvg('TEST_CONTENT', {
      size: 256,
      darkColor: '#1e293b',
      lightColor: '#ffffff',
    });
    expect(svg).toContain('width="256"');
    expect(svg).toContain('height="256"');
    expect(svg).toContain('#1e293b');
    expect(svg).toContain('#ffffff');
  });

  it('空文本或非法输入降级处理不抛异常', () => {
    expect(() => generateQrSvg('')).not.toThrow();
    const svg = generateQrSvg('');
    expect(svg).toContain('<svg');
  });
});
