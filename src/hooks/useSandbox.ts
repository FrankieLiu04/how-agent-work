"use client";

import { useState, useCallback, useEffect } from "react";
import type { TerminalLine } from "~/components/TerminalView";

export interface SandboxFile {
  id?: string;
  path: string;
  content?: string;
  isDir: boolean;
  size: number;
}

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
  writeFile: (path: string, content: string) => Promise<boolean>;
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

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sandbox/files");
      if (!response.ok) {
        throw new Error(`Failed to load files: ${response.status}`);
      }
      const data = (await response.json()) as {
        files: SandboxFile[];
        limits: SandboxLimits;
      };
      setFiles(data.files);
      setLimits(data.limits);
      setInitialized(data.files.length > 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const readFile = useCallback(async (path: string): Promise<string | null> => {
    try {
      // For now, fetch full file list and find the file
      // In production, you'd have a dedicated endpoint
      const response = await fetch("/api/sandbox/files");
      if (!response.ok) return null;
      
      const data = (await response.json()) as { files: Array<SandboxFile & { content?: string }> };
      const file = data.files.find((f) => f.path === path);
      return file?.content ?? null;
    } catch {
      return null;
    }
  }, []);

  const writeFile = useCallback(async (path: string, content: string): Promise<boolean> => {
    setError(null);

    try {
      const response = await fetch("/api/sandbox/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content, isDir: false }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string; message?: string };
        throw new Error(errorData.message ?? errorData.error ?? "Failed to write file");
      }

      // Reload files to get updated list
      await loadFiles();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to write file");
      return false;
    }
  }, [loadFiles]);

  const deleteFile = useCallback(async (path: string): Promise<boolean> => {
    setError(null);

    try {
      const response = await fetch(`/api/sandbox/files?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string; message?: string };
        throw new Error(errorData.message ?? errorData.error ?? "Failed to delete file");
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
        const errorData = (await response.json()) as { error?: string };
        const errorMsg = errorData.error ?? `Command failed: ${response.status}`;
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
        throw new Error(`Failed to initialize sandbox: ${response.status}`);
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

  // Auto-init on mount
  useEffect(() => {
    if (autoInit) {
      void loadFiles().then(() => {
        // Check if we need to initialize
        if (files.length === 0) {
          void initSandbox();
        }
      });
    }
  }, [autoInit]); // eslint-disable-line react-hooks/exhaustive-deps

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
