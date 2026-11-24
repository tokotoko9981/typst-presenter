export interface TypstDiagnostic {
  file?: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
  message: string;
  raw: string;
}

function normalizeDiagnosticFile(rawPath: string): string {
  return rawPath.replace(/^\\\\\?\\/, '').trim();
}

/**
 * Parses `typst compile --diagnostic-format short` stderr lines such as:
 * `\\?\C:\deck\slides.typ:12:5: error: unclosed delimiter`
 * or `slides.typ:4:1: warning: ...`
 * Falls back to a single error entry if non-empty stderr has no short-format lines.
 */
export function parseTypstDiagnostics(stderr: string): TypstDiagnostic[] {
  const normalized = stderr.replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const results: TypstDiagnostic[] = [];
  const shortLineRe = /^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/i;

  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(shortLineRe);
    if (match) {
      const parsedLine = Number.parseInt(match[2]!, 10);
      const parsedCol = Number.parseInt(match[3]!, 10);
      results.push({
        file: normalizeDiagnosticFile(match[1]!),
        line: Number.isFinite(parsedLine) ? parsedLine : undefined,
        column: Number.isFinite(parsedCol) ? parsedCol : undefined,
        severity: match[4]!.toLowerCase() === 'warning' ? 'warning' : 'error',
        message: match[5]!.trim(),
        raw: line,
      });
    }
  }

  if (results.length > 0) {
    return results;
  }

  const firstMeaningful = normalized
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? normalized;

  return [
    {
      severity: /^warning:/i.test(firstMeaningful) ? 'warning' : 'error',
      message: firstMeaningful.replace(/^(?:error|warning):\s*/i, '').trim(),
      raw: normalized,
    },
  ];
}
