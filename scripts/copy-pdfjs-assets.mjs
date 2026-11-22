import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const destRoot = path.join(projectRoot, 'public', 'pdfjs');
const versionMarkerPath = path.join(destRoot, '.version');
const ASSET_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

const pdfjsPkgPath = require.resolve('pdfjs-dist/package.json');
const pdfjsRoot = path.dirname(pdfjsPkgPath);
const { version: pdfjsVersion } = JSON.parse(readFileSync(pdfjsPkgPath, 'utf8'));

const isUpToDate =
  existsSync(versionMarkerPath) &&
  readFileSync(versionMarkerPath, 'utf8').trim() === pdfjsVersion &&
  ASSET_DIRS.every((dir) => existsSync(path.join(destRoot, dir)));

if (!isUpToDate) {
  rmSync(destRoot, { recursive: true, force: true });
  mkdirSync(destRoot, { recursive: true });

  for (const dir of ASSET_DIRS) {
    const srcDir = path.join(pdfjsRoot, dir);
    if (!existsSync(srcDir)) {
      throw new Error(`Expected pdfjs-dist asset directory not found: ${srcDir}`);
    }
    cpSync(srcDir, path.join(destRoot, dir), { recursive: true, force: true });
  }

  writeFileSync(versionMarkerPath, `${pdfjsVersion}\n`, 'utf8');
  console.log(`[copy-pdfjs-assets] Copied pdfjs-dist@${pdfjsVersion} assets (${ASSET_DIRS.join(', ')}) to public/pdfjs/`);
}
