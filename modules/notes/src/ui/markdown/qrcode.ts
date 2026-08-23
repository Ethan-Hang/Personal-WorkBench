export interface QrSvgOptions {
  size?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
}

/**
 * 纯 TypeScript 本地离线 2D 矩阵与二维码 SVG 矢量生成器（零外部网络依赖）。
 */
export function generateQrSvg(text: string, options: QrSvgOptions = {}): string {
  const { size = 200, margin = 4, darkColor = '#000000', lightColor = '#ffffff' } = options;

  const matrix = createQrMatrix(text || ' ');
  const moduleCount = matrix.length;
  const totalCount = moduleCount + margin * 2;
  const viewBoxSize = totalCount * 10;
  const cellSize = 10;

  let rects = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r]?.[c]) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        rects += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${darkColor}" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}">
  <rect width="100%" height="100%" fill="${lightColor}" />
  ${rects}
</svg>`;
}

/**
 * 生成 QR 码矩阵点阵（包含三个定位角标 Finder Patterns、定时线、对齐模式以及数据编码）。
 */
function createQrMatrix(content: string): boolean[][] {
  const size = 25; // Version 2 QR Code (25x25)
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // 1. 放置三大 Finder Pattern 定位角标（左上、右上、左下）
  addFinderPattern(matrix, reserved, 0, 0);
  addFinderPattern(matrix, reserved, size - 7, 0);
  addFinderPattern(matrix, reserved, 0, size - 7);

  // 2. 定时线 Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0;
    matrix[6]![i] = bit;
    reserved[6]![i] = true;
    matrix[i]![6] = bit;
    reserved[i]![6] = true;
  }

  // 3. 对齐角标 Alignment Pattern (右下附近 18, 18)
  addAlignmentPattern(matrix, reserved, 16, 16);

  // 4. 将内容编码为数据流与掩码并填充至其余数据槽
  const bits = encodeContentToBits(content, size * size);
  let bitIndex = 0;

  let right = size - 1;
  let upwards = true;

  while (right > 0) {
    if (right === 6) right--; // 跳过垂直定时线

    const rows = upwards
      ? Array.from({ length: size }, (_, k) => size - 1 - k)
      : Array.from({ length: size }, (_, k) => k);

    for (const r of rows) {
      for (const colOffset of [0, 1]) {
        const c = right - colOffset;
        if (!reserved[r]![c]) {
          const bit = bitIndex < bits.length ? bits[bitIndex] : (r + c) % 2 === 0;
          // 应用标准掩码 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r]![c] = Boolean(bit) !== mask;
          bitIndex++;
        }
      }
    }

    right -= 2;
    upwards = !upwards;
  }

  return matrix;
}

function addFinderPattern(
  matrix: boolean[][],
  reserved: boolean[][],
  row: number,
  col: number,
): void {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
      const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      const isBlack = isOuter || isInner;
      matrix[row + r]![col + c] = isBlack;
      reserved[row + r]![col + c] = true;
    }
  }

  // 边沿静区 Separator
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const targetR = row + r;
      const targetC = col + c;
      if (
        targetR >= 0 &&
        targetR < matrix.length &&
        targetC >= 0 &&
        targetC < matrix.length &&
        !reserved[targetR]![targetC]
      ) {
        reserved[targetR]![targetC] = true;
      }
    }
  }
}

function addAlignmentPattern(
  matrix: boolean[][],
  reserved: boolean[][],
  row: number,
  col: number,
): void {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const isOuter = r === 0 || r === 4 || c === 0 || c === 4;
      const isCenter = r === 2 && c === 2;
      const isBlack = isOuter || isCenter;
      matrix[row + r]![col + c] = isBlack;
      reserved[row + r]![col + c] = true;
    }
  }
}

function encodeContentToBits(content: string, capacity: number): boolean[] {
  const bytes = new TextEncoder().encode(content);
  const bits: boolean[] = [];

  // Mode: Byte mode (0100)
  bits.push(false, true, false, false);

  // Character count (8 bits for Version 1-9)
  const length = Math.min(bytes.length, 255);
  for (let i = 7; i >= 0; i--) {
    bits.push(Boolean((length >> i) & 1));
  }

  // Data payload
  for (let b = 0; b < length; b++) {
    const byte = bytes[b] ?? 0;
    for (let i = 7; i >= 0; i--) {
      bits.push(Boolean((byte >> i) & 1));
    }
  }

  // Terminator (up to 4 zeroes)
  for (let i = 0; i < 4 && bits.length < capacity; i++) {
    bits.push(false);
  }

  // Pad to multiple of 8
  while (bits.length % 8 !== 0) {
    bits.push(false);
  }

  // Pad bytes 0xEC (11101100) and 0x11 (00010001)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < capacity) {
    const padByte = padBytes[padIdx % 2] ?? 0xec;
    for (let i = 7; i >= 0; i--) {
      bits.push(Boolean((padByte >> i) & 1));
    }
    padIdx++;
  }

  return bits;
}
