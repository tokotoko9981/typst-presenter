import { encode, renderSVG } from 'uqr';

/**
 * Generates an offline SVG QR code with Error Correction M.
 * Returns an empty string when input is blank or encoding fails.
 */
export function generateQrSvg(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return '';
  }
  try {
    return renderSVG(trimmed, {
      ecc: 'M',
      border: 2,
      blackColor: '#0f172a',
      whiteColor: '#ffffff',
    });
  } catch {
    return '';
  }
}

export function getQrMatrix(rawText: string): boolean[][] {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return [];
  }
  try {
    return encode(trimmed, { ecc: 'M', border: 2 }).data;
  } catch {
    return [];
  }
}
