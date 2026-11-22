import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const tauriIconsDir = path.resolve(rootDir, 'src-tauri', 'icons');
const svgPath = path.resolve(publicDir, 'icon.svg');

function buildHtmlForSvg(svgContent) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: transparent;
          }
          svg {
            width: 100%;
            height: 100%;
            display: block;
          }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>
  `;
}

async function renderSvgPng(page, svgContent, size, outPath) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(buildHtmlForSvg(svgContent));
  const pngBuffer = await page.screenshot({ path: outPath, omitBackground: true });
  console.log(`Generated: ${outPath} (${size}x${size})`);
  return pngBuffer;
}

/**
 * Builds a Windows .ico container embedding PNG-encoded icon frames.
 * @param {Array<{ width: number; height: number; data: Buffer }>} frames
 * @returns {Buffer}
 */
function buildPngIco(frames) {
  const headerSize = 6;
  const dirEntrySize = 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved, must be 0
  header.writeUInt16LE(1, 2); // Image type: 1 = ICO
  header.writeUInt16LE(frames.length, 4);

  const directory = Buffer.alloc(dirEntrySize * frames.length);
  let dataOffset = headerSize + directory.length;

  frames.forEach((frame, idx) => {
    const entryOffset = idx * dirEntrySize;
    directory.writeUInt8(frame.width >= 256 ? 0 : frame.width, entryOffset + 0);
    directory.writeUInt8(frame.height >= 256 ? 0 : frame.height, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2); // Color palette count (0 for >= 8bpp)
    directory.writeUInt8(0, entryOffset + 3); // Reserved
    directory.writeUInt16LE(1, entryOffset + 4); // Color planes
    directory.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    directory.writeUInt32LE(frame.data.length, entryOffset + 8);
    directory.writeUInt32LE(dataOffset, entryOffset + 12);
    dataOffset += frame.data.length;
  });

  return Buffer.concat([header, directory, ...frames.map((frame) => frame.data)]);
}

async function main() {
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  fs.mkdirSync(tauriIconsDir, { recursive: true });

  // Launch system Edge/Chrome browser (with Playwright chromium fallback) to render SVG to exact PNGs
  const browser = await chromium
    .launch({ channel: 'msedge' })
    .catch(() => chromium.launch({ channel: 'chrome' }))
    .catch(() => chromium.launch());
  const page = await browser.newPage();

  try {
    // Public PWA icons
    await renderSvgPng(page, svgContent, 192, path.resolve(publicDir, 'icon-192.png'));
    const png512 = await renderSvgPng(page, svgContent, 512, path.resolve(publicDir, 'icon-512.png'));

    // Tauri desktop icons
    const png32 = await renderSvgPng(page, svgContent, 32, path.resolve(tauriIconsDir, '32x32.png'));
    await renderSvgPng(page, svgContent, 128, path.resolve(tauriIconsDir, '128x128.png'));
    const png256 = await renderSvgPng(page, svgContent, 256, path.resolve(tauriIconsDir, '128x128@2x.png'));

    const tauriIconPngPath = path.resolve(tauriIconsDir, 'icon.png');
    fs.writeFileSync(tauriIconPngPath, png512);
    console.log(`Generated: ${tauriIconPngPath} (512x512)`);

    const icoPath = path.resolve(tauriIconsDir, 'icon.ico');
    const icoBuffer = buildPngIco([
      { width: 32, height: 32, data: png32 },
      { width: 256, height: 256, data: png256 },
    ]);
    fs.writeFileSync(icoPath, icoBuffer);
    console.log(`Generated: ${icoPath} (32x32 + 256x256 PNG ICO)`);
  } finally {
    await browser.close();
  }

  console.log('Icons generated successfully.');
}

main().catch((err) => {
  console.error('Failed to generate PNG icons:', err);
  process.exit(1);
});
