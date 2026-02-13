import type { VirtualFileInfo, CommandResult } from "./types";
import { normalizePath, resolvePath, parseCommand } from "./path-utils";
import * as commands from "./commands";

export type { VirtualFileInfo, CommandResult };

export class MockShell {
  private cwd: string = "/";
  private files: Map<string, VirtualFileInfo>;

  constructor(files: VirtualFileInfo[], initialCwd: string = "/") {
    this.files = new Map(files.map((f) => [f.path, f]));
    this.cwd = initialCwd;
    if (!this.files.has("/")) {
      this.files.set("/", { path: "/", content: "", isDir: true, size: 0 });
    }
  }

  getCwd(): string {
    return this.cwd;
  }

  getFiles(): VirtualFileInfo[] {
    return Array.from(this.files.values());
  }

  private resolvePath(path: string): string {
    return resolvePath(this.cwd, path);
  }

  private normalizePath(path: string): string {
    return normalizePath(path);
  }

  execute(cmdStr: string): CommandResult {
    const { cmd, args } = parseCommand(cmdStr.trim());

    const ctx = {
      cwd: this.cwd,
      files: this.files,
      resolvePath: (path: string) => this.resolvePath(path),
      normalizePath: (path: string) => this.normalizePath(path),
      setCwd: (path: string) => {
        this.cwd = path;
      },
    };

    switch (cmd) {
      case "ls":
        return commands.ls(args, ctx);
      case "cd":
        return commands.cd(args, ctx);
      case "pwd":
        return commands.pwd(args, ctx);
      case "cat":
        return commands.cat(args, ctx);
      case "mkdir":
        return commands.mkdir(args, ctx);
      case "touch":
        return commands.touch(args, ctx);
      case "rm":
        return commands.rm(args, ctx);
      case "echo":
        return commands.echo(args, ctx, cmdStr);
      case "grep":
        return commands.grep(args, ctx);
      case "find":
        return commands.find(args, ctx);
      case "":
        return { stdout: "", stderr: "", exitCode: 0 };
      default:
        return {
          stdout: "",
          stderr: `command not found: ${cmd}`,
          exitCode: 127,
        };
    }
  }

  readFile(path: string): { content: string | null; error: string | null } {
    const resolvedPath = this.resolvePath(path);
    const file = this.files.get(resolvedPath);

    if (!file) {
      return { content: null, error: `File not found: ${path}` };
    }
    if (file.isDir) {
      return { content: null, error: `Is a directory: ${path}` };
    }
    return { content: file.content, error: null };
  }

  writeFile(
    path: string,
    content: string,
    maxFileSize: number = 5120
  ): { success: boolean; error: string | null } {
    const resolvedPath = this.resolvePath(path);
    const byteSize = new TextEncoder().encode(content).length;

    if (byteSize > maxFileSize) {
      return {
        success: false,
        error: `File too large: ${byteSize} bytes exceeds limit of ${maxFileSize} bytes`,
      };
    }

    const parent = resolvedPath.substring(0, resolvedPath.lastIndexOf("/")) || "/";
    if (parent !== "/" && !this.files.has(parent)) {
      const parts = parent.split("/").filter(Boolean);
      let currentPath = "";
      for (const part of parts) {
        currentPath += "/" + part;
        if (!this.files.has(currentPath)) {
          this.files.set(currentPath, {
            path: currentPath,
            content: "",
            isDir: true,
            size: 0,
          });
        }
      }
    }

    this.files.set(resolvedPath, {
      path: resolvedPath,
      content,
      isDir: false,
      size: byteSize,
    });

    return { success: true, error: null };
  }

  listFiles(path: string = "/"): { files: string[]; error: string | null } {
    const resolvedPath = this.resolvePath(path);
    const entries: string[] = [];

    for (const [filePath, file] of this.files) {
      const parent = filePath.substring(0, filePath.lastIndexOf("/")) || "/";
      if (parent === resolvedPath || (resolvedPath === "/" && parent === "")) {
        const name = filePath.split("/").pop() ?? "";
        entries.push(file.isDir ? `${name}/` : name);
      }
    }

    return { files: entries, error: null };
  }

  deleteFile(path: string): { success: boolean; error: string | null } {
    const resolvedPath = this.resolvePath(path);
    const file = this.files.get(resolvedPath);

    if (!file) {
      return { success: false, error: `File not found: ${path}` };
    }

    if (file.isDir) {
      for (const p of this.files.keys()) {
        if (p.startsWith(resolvedPath + "/")) {
          return {
            success: false,
            error: `Directory not empty: ${path}`,
          };
        }
      }
    }

    this.files.delete(resolvedPath);
    return { success: true, error: null };
  }

  searchFiles(
    pattern: string,
    searchPath: string = "/"
  ): { results: Array<{ path: string; line: number; content: string }>; error: string | null } {
    const resolvedPath = this.resolvePath(searchPath);
    const results: Array<{ path: string; line: number; content: string }> = [];

    try {
      const regex = new RegExp(pattern, "g");

      for (const [path, file] of this.files) {
        if (file.isDir) continue;
        if (!path.startsWith(resolvedPath) && path !== resolvedPath) continue;

        const lines = file.content.split("\n");
        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            results.push({
              path,
              line: idx + 1,
              content: line,
            });
          }
          regex.lastIndex = 0;
        });
      }
    } catch {
      return { results: [], error: `Invalid regex: ${pattern}` };
    }

    return { results, error: null };
  }
}
