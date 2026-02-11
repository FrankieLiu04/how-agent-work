"use client";

import { useState, useCallback, useEffect } from "react";
import type { TerminalLine } from "~/components/TerminalView";
import { parseErrorResponse } from "~/lib/http/parseErrorResponse";

export interface SandboxFile {
  id?: string;
  path: string;
  content?: string;
  isDir: boolean;
  size: number;
  createdAt?: string;
  updatedAt?: string;
}

export type SandboxWriteResult =
  | { ok: true; file: SandboxFile; refreshed: boolean; warning?: string }
  | { ok: false; error: string; code?: string; httpStatus?: number };

interface SandboxLimits {
  maxFiles: number;
  maxFileSize: number;
  maxTotalSize: number;
  currentFileCount: number;
  currentTotalSize: number;
}

interface UseSandboxOptions {
  autoInit?: boolean;
}

interface UseSandboxReturn {
  files: SandboxFile[];
  limits: SandboxLimits | null;
  cwd: string;
  terminalLines: TerminalLine[];
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  
  // File operations
  loadFiles: () => Promise<void>;
  readFile: (path: string) => Promise<string | null>;
  writeFile: (path: string, content: string) => Promise<SandboxWriteResult>;
  deleteFile: (path: string) => Promise<boolean>;
  
  // Shell operations
  execCommand: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  initSandbox: (force?: boolean) => Promise<void>;
  
  // Terminal
  addTerminalLine: (type: TerminalLine["type"], content: string) => void;
  clearTerminal: () => void;
}

function generateLineId(): string {
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useSandbox({ autoInit = false }: UseSandboxOptions = {}): UseSandboxReturn {
  const [files, setFiles] = useState<SandboxFile[]>([]);
  const [limits, setLimits] = useState<SandboxLimits | null>(null);
  const [cwd, setCwd] = useState("/");
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const addTerminalLine = useCallback((type: TerminalLine["type"], content: string) => {
    setTerminalLines((prev) => [
      ...prev,
      { id: generateLineId(), type, content, timestamp: new Date() },
    ]);
  }, []);

  const clearTerminal = useCallback(() => {
    setTerminalLines([]);
  }, []);

  const loadFilesImpl = useCallback(async ({ silent }: { silent: boolean }) => {
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const response = await fetch("/api/sandbox/files");
      if (!response.ok) {
        const parsed = await parseErrorResponse(response);
        throw new Error(parsed.message);
      }
      const data = (await response.json()) as {
        files: SandboxFile[];
        limits: SandboxLimits;
      };
      setFiles(data.files);
      setLimits(data.limits);
      setInitialized(data.files.length > 0);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to load files");
      }
      throw err;
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  const loadFiles = useCallback(async () => {
    await loadFilesImpl({ silent: false });
  }, [loadFilesImpl]);

  const readFile = useCallback(async (path: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/sandbox/file?path=${encodeURIComponent(path)}`);
      if (!response.ok) return null;

      const data = (await response.json()) as { content?: string };
      return data.content ?? null;
    } catch {
      return null;
    }
  }, []);

  const writeFile = useCallback(async (path: string, content: string): Promise<SandboxWriteResult> => {
    setError(null);

    try {
      const response = await fetch("/api/sandbox/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content, isDir: false }),
      });

      if (!response.ok) {
        const errorData = await parseErrorResponse(response);
        return {
          ok: false,
          error: errorData.message,
          code: errorData.code,
          httpStatus: errorData.httpStatus,
        };
      }

      const file = (await response.json()) as SandboxFile;

      setFiles((prev) => {
        const existingIndex = prev.findIndex((f) => f.path === file.path);
        if (existingIndex === -1) return [...prev, file].sort((a, b) => a.path.localeCompare(b.path));

        const next = [...prev];
        next[existingIndex] = { ...prev[existingIndex], ...file };
        return next;
      });

      let refreshed = true;
      let warning: string | undefined;
      try {
        await loadFilesImpl({ silent: true });
      } catch (err) {
        refreshed = false;
        warning = err instanceof Error ? err.message : "Failed to refresh file list";
      }

      return warning ? { ok: true, file, refreshed, warning } : { ok: true, file, refreshed };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to write file";
      setError(message);
      return { ok: false, error: message };
    }
  }, [loadFilesImpl]);

  const deleteFile = useCallback(async (path: string): Promise<boolean> => {
    setError(null);

    try {
      const response = await fetch(`/api/sandbox/files?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await parseErrorResponse(response);
        throw new Error(errorData.message);
      }

      // Reload files
      await loadFiles();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
      return false;
    }
  }, [loadFiles]);

  const execCommand = useCallback(async (command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    setError(null);

    // Add command to terminal
    addTerminalLine("command", command);

    try {
      const response = await fetch("/api/sandbox/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, cwd }),
      });

      if (!response.ok) {
        const errorData = await parseErrorResponse(response);
        const errorMsg = errorData.message ?? `Command failed: ${response.status}`;
        addTerminalLine("error", errorMsg);
        return { stdout: "", stderr: errorMsg, exitCode: 1 };
      }

      const result = (await response.json()) as {
        stdout: string;
        stderr: string;
        exitCode: number;
        cwdChanged?: string;
        filesChanged?: boolean;
      };

      // Add output to terminal
      if (result.stdout) {
        addTerminalLine("output", result.stdout);
      }
      if (result.stderr) {
        addTerminalLine("error", result.stderr);
      }

      // Update cwd if changed
      if (result.cwdChanged) {
        setCwd(result.cwdChanged);
      }

      // Reload files if changed
      if (result.filesChanged) {
        await loadFiles();
      }

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Command failed";
      setError(errorMsg);
      addTerminalLine("error", errorMsg);
      return { stdout: "", stderr: errorMsg, exitCode: 1 };
    }
  }, [cwd, addTerminalLine, loadFiles]);

  const initSandbox = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sandbox/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });

      if (!response.ok) {
        const errorData = await parseErrorResponse(response);
        throw new Error(errorData.message);
      }

      const data = (await response.json()) as { initialized: boolean; files: SandboxFile[] };
      
      if (data.initialized) {
        addTerminalLine("system", "Sandbox initialized with default template files.");
      }
      
      setInitialized(true);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize sandbox");
    } finally {
      setIsLoading(false);
    }
  }, [addTerminalLine, loadFiles]);

  useEffect(() => {
    if (!autoInit) return;
    void loadFiles();
  }, [autoInit, loadFiles]);

  useEffect(() => {
    if (!autoInit) return;
    if (initialized) return;
    if (files.length !== 0) return;
    void initSandbox();
  }, [autoInit, files.length, initSandbox, initialized]);

  return {
    files,
    limits,
    cwd,
    terminalLines,
    isLoading,
    error,
    initialized,
    loadFiles,
    readFile,
    writeFile,
    deleteFile,
    execCommand,
    initSandbox,
    addTerminalLine,
    clearTerminal,
  };
}
