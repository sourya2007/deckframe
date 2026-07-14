const fs = require('fs');
const path = require('path');

const SIZE = 256;
const BPP = 32;

function setPixel(buf, x, y, b, g, r, a) {
  const idx = (y * SIZE + x) * 4;
  buf[idx] = b;
  buf[idx+1] = g;
  buf[idx+2] = r;
  buf[idx+3] = a;
}

function sqdist(x1, y1, x2, y2) {
  const dx = x1 - x2, dy = y1 - y2;
  return dx*dx + dy*dy;
}

function createICO() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4, 0);

  const cx = SIZE / 2, cy = SIZE / 2;
  const cardW = SIZE * 0.85, cardH = SIZE * 0.85;
  const cardR = SIZE * 0.12;
  const bg = [0x13, 0x13, 0x16, 0xFF];
  const fg = [0xF6, 0x82, 0x3B, 0xFF];
  const border = [0x33, 0x33, 0x38, 0xFF];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const lx = x - cx + cardW/2;
      const ly = y - cy + cardH/2;

      let inCard = false;
      if (lx >= 0 && lx < cardW && ly >= 0 && ly < cardH) {
        const dx1 = lx, dx2 = cardW - lx, dy1 = ly, dy2 = cardH - ly;
        const minDx = Math.min(dx1, dx2);
        const minDy = Math.min(dy1, dy2);
        if (minDx <= cardR && minDy <= cardR) {
          inCard = sqdist(
            minDx === dx1 ? cardR : cardW - cardR,
            minDy === dy1 ? cardR : cardH - cardR,
            lx, ly
          ) <= cardR * cardR;
        } else {
          inCard = true;
        }
      }

      if (inCard) {
        const borderSize = 2;
        const nearEdge = lx < borderSize || lx >= cardW - borderSize ||
                         ly < borderSize || ly >= cardH - borderSize;
        setPixel(pixels, x, y, ...(nearEdge ? border : bg));
      } else {
        setPixel(pixels, x, y, 0, 0, 0, 0);
      }
    }
  }

  const tSize = SIZE * 0.22;
  const tx1 = cx + tSize * 0.05;
  const ty1 = cy;
  const tx2 = cx - tSize * 0.55;
  const ty2 = cy - tSize * 0.65;
  const tx3 = cx - tSize * 0.55;
  const ty3 = cy + tSize * 0.65;

  function inTri(px, py) {
    const d = (ty2 - ty3) * (tx1 - tx3) + (tx3 - tx2) * (ty1 - ty3);
    if (d === 0) return false;
    const a = ((ty2 - ty3) * (px - tx3) + (tx3 - tx2) * (py - ty3)) / d;
    const b = ((ty3 - ty1) * (px - tx3) + (tx1 - tx3) * (py - ty3)) / d;
    const c = 1 - a - b;
    return a >= 0 && b >= 0 && c >= 0;
  }

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (pixels[(y * SIZE + x) * 4 + 3] === 0) continue;
      if (inTri(x, y)) {
        setPixel(pixels, x, y, ...fg);
      }
    }
  }

  const bihSize = 40;
  const rowSize = SIZE * 4;
  const pixelDataSize = rowSize * SIZE;
  const andRowSize = Math.ceil(SIZE / 32) * 4;
  const andMaskSize = andRowSize * SIZE;
  const bmpTotal = bihSize + pixelDataSize + andMaskSize;

  const bmp = Buffer.alloc(bmpTotal, 0);
  let off = 0;
  bmp.writeUInt32LE(bihSize, off); off += 4;
  bmp.writeInt32LE(SIZE, off); off += 4;
  bmp.writeInt32LE(SIZE * 2, off); off += 4;
  bmp.writeUInt16LE(1, off); off += 2;
  bmp.writeUInt16LE(BPP, off); off += 2;
  bmp.writeUInt32LE(0, off); off += 4;
  bmp.writeUInt32LE(pixelDataSize, off); off += 4;
  bmp.writeInt32LE(2835, off); off += 4;
  bmp.writeInt32LE(2835, off); off += 4;
  bmp.writeUInt32LE(0, off); off += 4;
  bmp.writeUInt32LE(0, off); off += 4;

  for (let y = 0; y < SIZE; y++) {
    const srcOff = (SIZE - 1 - y) * rowSize;
    pixels.copy(bmp, bihSize + y * rowSize, srcOff, srcOff + rowSize);
  }

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const pxOff = (y * SIZE + x) * 4;
      if (pixels[pxOff + 3] < 128) {
        const byteIdx = bihSize + pixelDataSize + y * andRowSize + Math.floor(x / 8);
        bmp[byteIdx] |= (1 << (7 - (x % 8)));
      }
    }
  }

  const ico = Buffer.alloc(22 + bmpTotal);
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(1, 4);
  ico.writeUInt8(0, 6);
  ico.writeUInt8(0, 7);
  ico.writeUInt8(0, 8);
  ico.writeUInt8(0, 9);
  ico.writeUInt16LE(1, 10);
  ico.writeUInt16LE(BPP, 12);
  ico.writeUInt32LE(bmpTotal, 14);
  ico.writeUInt32LE(22, 18);
  bmp.copy(ico, 22);

  return ico;
}

const outDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.ico'), createICO());
console.log('build/icon.ico created');
