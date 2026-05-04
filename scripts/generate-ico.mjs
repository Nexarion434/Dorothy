/**
 * Generates public/icon.ico (multi-size) from the PNG source using sharp.
 * No extra npm packages required — sharp is already a devDependency.
 *
 * ICO format spec:
 *   Header  : 6 bytes  (reserved=0, type=1, count=N)
 *   Dir     : 16 bytes × N  (width, height, colorCount, reserved, planes, bitCount, size, offset)
 *   Images  : raw PNG blobs (modern ICO supports embedded PNGs since Windows Vista)
 */

import sharp from 'sharp';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const sourcePath = path.join(root, 'public', 'dorothy-without-text.png');
const outputPath = path.join(root, 'public', 'icon.ico');

// Standard Windows ICO sizes (include 256 for high-DPI)
const SIZES = [16, 24, 32, 48, 64, 128, 256];

console.log(`Source : ${sourcePath}`);
console.log(`Output : ${outputPath}`);
console.log(`Sizes  : ${SIZES.join(', ')}\n`);

// Generate PNG buffer for each size
const pngBuffers = await Promise.all(
  SIZES.map(async (size) => {
    const buf = await sharp(sourcePath)
      .flatten({ background: { r: 106, g: 148, b: 120 } }) // match the app green background
      .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    console.log(`  ✓ ${size}×${size}  (${buf.length} bytes)`);
    return buf;
  })
);

// ── Build ICO binary ──────────────────────────────────────────────────────────
const count = SIZES.length;
const headerSize = 6;
const dirEntrySize = 16;
const dataOffset = headerSize + dirEntrySize * count;

// Header: ICONDIR
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);      // idReserved (must be 0)
header.writeUInt16LE(1, 2);      // idType (1 = icon)
header.writeUInt16LE(count, 4);  // idCount

// Directory entries: ICONDIRENTRY × count
const dirEntries = [];
let offset = dataOffset;

for (let i = 0; i < count; i++) {
  const size = SIZES[i];
  const entry = Buffer.alloc(dirEntrySize);
  // width/height: 0 encodes 256 (the max value that fits in 1 byte)
  entry.writeUInt8(size >= 256 ? 0 : size, 0);   // bWidth
  entry.writeUInt8(size >= 256 ? 0 : size, 1);   // bHeight
  entry.writeUInt8(0, 2);                          // bColorCount (0 = 24/32-bit)
  entry.writeUInt8(0, 3);                          // bReserved
  entry.writeUInt16LE(1, 4);                       // wPlanes
  entry.writeUInt16LE(32, 6);                      // wBitCount (32bpp RGBA)
  entry.writeUInt32LE(pngBuffers[i].length, 8);   // dwBytesInRes
  entry.writeUInt32LE(offset, 12);                 // dwImageOffset
  dirEntries.push(entry);
  offset += pngBuffers[i].length;
}

const ico = Buffer.concat([header, ...dirEntries, ...pngBuffers]);
writeFileSync(outputPath, ico);

console.log(`\n✅  icon.ico written (${ico.length} bytes total)\n`);
