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
  conversationId?: string | null;
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
  readFile: (path: string, conversationIdOverride?: string | null) => Promise<string | null>;
  writeFile: (path: string, content: string, conversationIdOverride?: string | null) => Promise<SandboxWriteResult>;
  deleteFile: (path: string, conversationIdOverride?: string | null) => Promise<boolean>;
  
  // Shell operations
  execCommand: (command: string, conversationIdOverride?: string | null) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  initSandbox: (force?: boolean, conversationIdOverride?: string | null) => Promise<void>;
  
  // Terminal
  addTerminalLine: (type: TerminalLine["type"], content: string) => void;
  clearTerminal: () => void;
  clearError: () => void;
}

function generateLineId(): string {
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function resolveScopeId(baseConversationId: string | null | undefined, override?: string | null): string | null {
  if (override !== undefined) return override;
  return baseConversationId ?? null;
}

function withScope(path: string, conversationId: string | null): string {
  if (!conversationId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}conversationId=${encodeURIComponent(conversationId)}`;
}

export function useSandbox({ autoInit = false, conversationId = null }: UseSandboxOptions = {}): UseSandboxReturn {
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

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loadFilesImpl = useCallback(async ({ silent }: { silent: boolean }) => {
    if (!conversationId) {
      setFiles([]);
      setLimits(null);
      setInitialized(false);
      if (!silent) {
        setError(null);
      }
      return;
    }

    if (!silent) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const response = await fetch(withScope("/api/sandbox/files", conversationId));
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
  }, [conversationId]);

  const loadFiles = useCallback(async () => {
    await loadFilesImpl({ silent: false });
  }, [loadFilesImpl]);

  const readFile = useCallback(async (path: string, conversationIdOverride?: string | null): Promise<string | null> => {
    const scopeId = resolveScopeId(conversationId, conversationIdOverride);
    if (!scopeId) return null;
    try {
      const response = await fetch(
        `/api/sandbox/file?path=${encodeURIComponent(path)}&conversationId=${encodeURIComponent(scopeId)}`
      );
      if (!response.ok) return null;

      const data = (await response.json()) as { content?: string };
      return data.content ?? null;
    } catch {
      return null;
    }
  }, [conversationId]);

  const writeFile = useCallback(async (path: string, content: string, conversationIdOverride?: string | null): Promise<SandboxWriteResult> => {
    const scopeId = resolveScopeId(conversationId, conversationIdOverride);
    if (!scopeId) {
      const message = "No conversation selected";
      setError(message);
      return { ok: false, error: message, code: "missing_conversation" };
    }
    setError(null);

    try {
      const response = await fetch("/api/sandbox/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content, isDir: false, conversationId: scopeId }),
      });

      if (!response.ok) {
        const errorData = await parseErrorResponse(response);
        setError(errorData.message);
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
  }, [conversationId, loadFilesImpl]);

  const deleteFile = useCallback(async (path: string, conversationIdOverride?: string | null): Promise<boolean> => {
    const scopeId = resolveScopeId(conversationId, conversationIdOverride);
    if (!scopeId) {
      setError("No conversation selected");
      return false;
    }
    setError(null);

    try {
      const response = await fetch(
        `/api/sandbox/files?path=${encodeURIComponent(path)}&conversationId=${encodeURIComponent(scopeId)}`,
        {
        method: "DELETE",
        }
      );

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
  }, [conversationId, loadFiles]);

  const execCommand = useCallback(async (command: string, conversationIdOverride?: string | null): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    const scopeId = resolveScopeId(conversationId, conversationIdOverride);
    if (!scopeId) {
      const errorMsg = "No conversation selected";
      setError(errorMsg);
      addTerminalLine("error", errorMsg);
      return { stdout: "", stderr: errorMsg, exitCode: 1 };
    }
    setError(null);

    // Add command to terminal
    addTerminalLine("command", command);

    try {
      const response = await fetch("/api/sandbox/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, cwd, conversationId: scopeId }),
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
  }, [conversationId, cwd, addTerminalLine, loadFiles]);

  const initSandbox = useCallback(async (force = false, conversationIdOverride?: string | null) => {
    const scopeId = resolveScopeId(conversationId, conversationIdOverride);
    if (!scopeId) {
      setError("No conversation selected");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sandbox/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, conversationId: scopeId }),
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
  }, [conversationId, addTerminalLine, loadFiles]);

  useEffect(() => {
    if (!autoInit) return;
    if (!conversationId) return;
    void loadFiles();
  }, [autoInit, conversationId, loadFiles]);

  useEffect(() => {
    if (!autoInit) return;
    if (!conversationId) return;
    if (initialized) return;
    if (files.length !== 0) return;
    void initSandbox();
  }, [autoInit, conversationId, files.length, initSandbox, initialized]);

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
    clearError,
  };
}
