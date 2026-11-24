import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkTypstCli,
  isTauriRuntime,
  listTypstFonts,
  onTypstCompileResult,
  pickTypstFile,
  readCompiledPdf,
  startTypstWatch,
  stopTypstWatch,
  type TypstCliStatus,
  type TypstCompileOptions,
} from '../../../core/platform/DesktopBridge.ts';
import {
  parseTypstDiagnostics,
  type TypstDiagnostic,
} from '../../../core/typst/typstDiagnostics.ts';
import {
  parseTypstPdfpcQueryJson,
  type TypstPdfpcQueryResult,
} from '../../../core/typst/typstPdfpcParser.ts';

export type TypstBuildStatus = 'idle' | 'compiling' | 'ok' | 'error';

export interface UseTypstLiveCompileOptions {
  onCompiledPdf: (
    bytes: ArrayBuffer,
    fileName: string,
    queryResult: TypstPdfpcQueryResult | null,
  ) => Promise<void> | void;
}

function parseOptionLines(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function useTypstLiveCompile({ onCompiledPdf }: UseTypstLiveCompileOptions) {
  const [cliStatus, setCliStatus] = useState<TypstCliStatus | null>(null);
  const [watchedPath, setWatchedPath] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<TypstBuildStatus>('idle');
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [diagnostics, setDiagnostics] = useState<TypstDiagnostic[]>([]);
  const [rawStderr, setRawStderr] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [rootDir, setRootDir] = useState<string>('');
  const [inputsText, setInputsText] = useState<string>('');
  const [fontPathsText, setFontPathsText] = useState<string>('');
  const [fonts, setFonts] = useState<string[]>([]);
  const [loadingFonts, setLoadingFonts] = useState<boolean>(false);

  const onCompiledPdfRef = useRef(onCompiledPdf);
  onCompiledPdfRef.current = onCompiledPdf;

  const refreshCliStatus = useCallback(async () => {
    if (!isTauriRuntime()) return null;
    const status = await checkTypstCli();
    setCliStatus(status);
    return status;
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void refreshCliStatus();
  }, [refreshCliStatus]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    let unlisten: (() => void) | null = null;

    void onTypstCompileResult(async (event) => {
      if (!active) return;
      setWatchedPath(event.filePath);
      setLastDurationMs(event.durationMs);

      if (!event.ok) {
        setBuildStatus('error');
        setRawStderr(event.stderr);
        setDiagnostics(parseTypstDiagnostics(event.stderr));
        return;
      }

      setBuildStatus('ok');
      setRawStderr(event.stderr);
      setDiagnostics(event.stderr ? parseTypstDiagnostics(event.stderr) : []);

      try {
        const pdfBytes = await readCompiledPdf();
        if (!active) return;
        const queryResult = event.pdfpcQueryJson
          ? parseTypstPdfpcQueryJson(event.pdfpcQueryJson)
          : null;
        await onCompiledPdfRef.current(pdfBytes, event.fileName, queryResult);
      } catch (err) {
        if (!active) return;
        setBuildStatus('error');
        const msg = err instanceof Error ? err.message : String(err);
        setDiagnostics([
          {
            severity: 'error',
            message: msg,
            raw: msg,
          },
        ]);
      }
    }).then((fn) => {
      if (active) {
        unlisten = fn;
      } else {
        fn();
      }
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const buildCompileOptions = useCallback((): TypstCompileOptions => {
    const root = rootDir.trim();
    const inputs = parseOptionLines(inputsText);
    const fontPaths = parseOptionLines(fontPathsText);
    return {
      ...(root ? { root } : {}),
      ...(inputs.length > 0 ? { inputs } : {}),
      ...(fontPaths.length > 0 ? { fontPaths } : {}),
    };
  }, [rootDir, inputsText, fontPathsText]);

  const startWatchPath = useCallback(
    async (filePath: string) => {
      const status = await refreshCliStatus();
      if (status && !status.available) {
        setDrawerOpen(true);
        return false;
      }
      setWatchedPath(filePath);
      setBuildStatus('compiling');
      try {
        await startTypstWatch(filePath, buildCompileOptions());
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setBuildStatus('error');
        setDiagnostics([{ severity: 'error', message: msg, raw: msg }]);
        setDrawerOpen(true);
        return false;
      }
    },
    [buildCompileOptions, refreshCliStatus],
  );

  const pickAndStartWatch = useCallback(async () => {
    const status = await refreshCliStatus();
    if (status && !status.available) {
      setDrawerOpen(true);
      return false;
    }
    const picked = await pickTypstFile();
    if (!picked) {
      return false;
    }
    return await startWatchPath(picked);
  }, [refreshCliStatus, startWatchPath]);

  const recompileNow = useCallback(async () => {
    if (!watchedPath) return;
    await startWatchPath(watchedPath);
  }, [watchedPath, startWatchPath]);

  const stopWatch = useCallback(async () => {
    await stopTypstWatch();
    setWatchedPath(null);
    setBuildStatus('idle');
    setDiagnostics([]);
    setRawStderr('');
  }, []);

  const refreshFonts = useCallback(async () => {
    setLoadingFonts(true);
    try {
      const list = await listTypstFonts(parseOptionLines(fontPathsText));
      setFonts(list);
    } catch {
      setFonts([]);
    } finally {
      setLoadingFonts(false);
    }
  }, [fontPathsText]);

  return {
    cliStatus,
    watchedPath,
    buildStatus,
    lastDurationMs,
    diagnostics,
    rawStderr,
    drawerOpen,
    setDrawerOpen,
    rootDir,
    setRootDir,
    inputsText,
    setInputsText,
    fontPathsText,
    setFontPathsText,
    fonts,
    loadingFonts,
    refreshCliStatus,
    pickAndStartWatch,
    startWatchPath,
    recompileNow,
    stopWatch,
    refreshFonts,
  };
}
