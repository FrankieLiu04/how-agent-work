/**
 * Mock Shell implementation for CLI mode
 * Supports: ls, cd, pwd, cat, mkdir, touch, rm, echo, grep, find
 */

export interface VirtualFileInfo {
  path: string;
  content: string;
  isDir: boolean;
  size: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwdChanged?: string; // New cwd if cd command was executed
}

export class MockShell {
  private cwd: string = "/";
  private files: Map<string, VirtualFileInfo>;

  constructor(files: VirtualFileInfo[], initialCwd: string = "/") {
    this.files = new Map(files.map((f) => [f.path, f]));
    this.cwd = initialCwd;
    // Ensure root directory exists
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

  /**
   * Parse command string into command and arguments
   */
  private parseCommand(cmdStr: string): { cmd: string; args: string[] } {
    const parts: string[] = [];
    let current = "";
    let inQuote = false;
    let quoteChar = "";

    for (const char of cmdStr) {
      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = "";
      } else if (char === " " && !inQuote) {
        if (current) {
          parts.push(current);
          current = "";
        }
      } else {
        current += char;
      }
    }
    if (current) parts.push(current);

    const [cmd, ...args] = parts;
    return { cmd: cmd ?? "", args };
  }

  /**
   * Resolve a path relative to cwd
   */
  private resolvePath(path: string): string {
    if (path.startsWith("/")) {
      return this.normalizePath(path);
    }
    return this.normalizePath(`${this.cwd}/${path}`);
  }

  /**
   * Normalize path (remove . and .., handle multiple slashes)
   */
  private normalizePath(path: string): string {
    const parts = path.split("/").filter((p) => p && p !== ".");
    const result: string[] = [];

    for (const part of parts) {
      if (part === "..") {
        result.pop();
      } else {
        result.push(part);
      }
    }

    return "/" + result.join("/");
  }

  /**
   * Execute a shell command
   */
  execute(cmdStr: string): CommandResult {
    const { cmd, args } = this.parseCommand(cmdStr.trim());

    switch (cmd) {
      case "ls":
        return this.ls(args);
      case "cd":
        return this.cd(args);
      case "pwd":
        return this.pwd();
      case "cat":
        return this.cat(args);
      case "mkdir":
        return this.mkdir(args);
      case "touch":
        return this.touch(args);
      case "rm":
        return this.rm(args);
      case "echo":
        return this.echo(args, cmdStr);
      case "grep":
        return this.grep(args);
      case "find":
        return this.find(args);
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

  private ls(args: string[]): CommandResult {
    const showAll = args.includes("-a") || args.includes("-la") || args.includes("-al");
    const showLong = args.includes("-l") || args.includes("-la") || args.includes("-al");
    const pathArg = args.find((a) => !a.startsWith("-")) ?? this.cwd;
    const targetPath = this.resolvePath(pathArg);

    const entries: string[] = [];
    const targetDir = targetPath === "/" ? "" : targetPath;

    for (const [path, file] of this.files) {
      // Get direct children of targetDir
      const parent = path.substring(0, path.lastIndexOf("/")) || "/";
      if (parent === targetPath || (targetPath === "/" && parent === "")) {
        const name = path.split("/").pop() ?? "";
        if (!showAll && name.startsWith(".")) continue;

        if (showLong) {
          const type = file.isDir ? "d" : "-";
          const perms = "rwxr-xr-x";
          const size = file.size.toString().padStart(6);
          entries.push(`${type}${perms}  1 user  user  ${size}  ${name}${file.isDir ? "/" : ""}`);
        } else {
          entries.push(file.isDir ? `${name}/` : name);
        }
      }
    }

    if (entries.length === 0 && !this.files.has(targetPath)) {
      return {
        stdout: "",
        stderr: `ls: ${pathArg}: No such file or directory`,
        exitCode: 1,
      };
    }

    return {
      stdout: showLong ? entries.join("\n") : entries.join("  "),
      stderr: "",
      exitCode: 0,
    };
  }

  private cd(args: string[]): CommandResult {
    const target = args[0] ?? "/";
    const newPath = this.resolvePath(target);

    // Check if directory exists
    const dirEntry = this.files.get(newPath);
    if (!dirEntry) {
      // Check if it's a valid parent path
      let pathExists = false;
      for (const path of this.files.keys()) {
        if (path.startsWith(newPath + "/") || path === newPath) {
          pathExists = true;
          break;
        }
      }
      if (!pathExists && newPath !== "/") {
        return {
          stdout: "",
          stderr: `cd: ${target}: No such file or directory`,
          exitCode: 1,
        };
      }
    } else if (!dirEntry.isDir) {
      return {
        stdout: "",
        stderr: `cd: ${target}: Not a directory`,
        exitCode: 1,
      };
    }

    this.cwd = newPath;
    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
      cwdChanged: newPath,
    };
  }

  private pwd(): CommandResult {
    return {
      stdout: this.cwd,
      stderr: "",
      exitCode: 0,
    };
  }

  private cat(args: string[]): CommandResult {
    if (args.length === 0) {
      return {
        stdout: "",
        stderr: "cat: missing file operand",
        exitCode: 1,
      };
    }

    const outputs: string[] = [];
    for (const arg of args) {
      const path = this.resolvePath(arg);
      const file = this.files.get(path);

      if (!file) {
        return {
          stdout: "",
          stderr: `cat: ${arg}: No such file or directory`,
          exitCode: 1,
        };
      }
      if (file.isDir) {
        return {
          stdout: "",
          stderr: `cat: ${arg}: Is a directory`,
          exitCode: 1,
        };
      }
      outputs.push(file.content);
    }

    return {
      stdout: outputs.join("\n"),
      stderr: "",
      exitCode: 0,
    };
  }

  private mkdir(args: string[]): CommandResult {
    const createParents = args.includes("-p");
    const dirs = args.filter((a) => !a.startsWith("-"));

    if (dirs.length === 0) {
      return {
        stdout: "",
        stderr: "mkdir: missing operand",
        exitCode: 1,
      };
    }

    for (const dir of dirs) {
      const path = this.resolvePath(dir);

      if (this.files.has(path)) {
        if (!createParents) {
          return {
            stdout: "",
            stderr: `mkdir: ${dir}: File exists`,
            exitCode: 1,
          };
        }
        continue;
      }

      // Create parent directories if -p
      if (createParents) {
        const parts = path.split("/").filter(Boolean);
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
      } else {
        // Check parent exists
        const parent = path.substring(0, path.lastIndexOf("/")) || "/";
        if (!this.files.has(parent) && parent !== "/") {
          return {
            stdout: "",
            stderr: `mkdir: ${dir}: No such file or directory`,
            exitCode: 1,
          };
        }

        this.files.set(path, {
          path,
          content: "",
          isDir: true,
          size: 0,
        });
      }
    }

    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }

  private touch(args: string[]): CommandResult {
    if (args.length === 0) {
      return {
        stdout: "",
        stderr: "touch: missing file operand",
        exitCode: 1,
      };
    }

    for (const arg of args) {
      const path = this.resolvePath(arg);

      if (!this.files.has(path)) {
        // Check parent exists
        const parent = path.substring(0, path.lastIndexOf("/")) || "/";
        if (!this.files.has(parent) && parent !== "/") {
          return {
            stdout: "",
            stderr: `touch: ${arg}: No such file or directory`,
            exitCode: 1,
          };
        }

        this.files.set(path, {
          path,
          content: "",
          isDir: false,
          size: 0,
        });
      }
    }

    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }

  private rm(args: string[]): CommandResult {
    const recursive = args.includes("-r") || args.includes("-rf");
    const targets = args.filter((a) => !a.startsWith("-"));

    if (targets.length === 0) {
      return {
        stdout: "",
        stderr: "rm: missing operand",
        exitCode: 1,
      };
    }

    for (const target of targets) {
      const path = this.resolvePath(target);
      const file = this.files.get(path);

      if (!file) {
        return {
          stdout: "",
          stderr: `rm: ${target}: No such file or directory`,
          exitCode: 1,
        };
      }

      if (file.isDir && !recursive) {
        return {
          stdout: "",
          stderr: `rm: ${target}: is a directory`,
          exitCode: 1,
        };
      }

      // Delete file/directory and all children
      const toDelete = [path];
      if (file.isDir) {
        for (const p of this.files.keys()) {
          if (p.startsWith(path + "/")) {
            toDelete.push(p);
          }
        }
      }

      for (const p of toDelete) {
        this.files.delete(p);
      }
    }

    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }

  private echo(args: string[], fullCmd: string): CommandResult {
    // Handle redirection
    const redirectMatch = fullCmd.match(/echo\s+(.+?)\s*>\s*(.+)$/);
    if (redirectMatch) {
      const content = redirectMatch[1]!.replace(/^["']|["']$/g, "").trim();
      const filePath = this.resolvePath(redirectMatch[2]!.trim());

      // Check parent exists
      const parent = filePath.substring(0, filePath.lastIndexOf("/")) || "/";
      if (!this.files.has(parent) && parent !== "/") {
        return {
          stdout: "",
          stderr: `echo: ${redirectMatch[2]}: No such file or directory`,
          exitCode: 1,
        };
      }

      const byteSize = new TextEncoder().encode(content).length;
      this.files.set(filePath, {
        path: filePath,
        content,
        isDir: false,
        size: byteSize,
      });

      return {
        stdout: "",
        stderr: "",
        exitCode: 0,
      };
    }

    // Normal echo
    const output = args.map((a) => a.replace(/^["']|["']$/g, "")).join(" ");
    return {
      stdout: output,
      stderr: "",
      exitCode: 0,
    };
  }

  private grep(args: string[]): CommandResult {
    if (args.length < 2) {
      return {
        stdout: "",
        stderr: "grep: missing pattern or file",
        exitCode: 1,
      };
    }

    const pattern = args[0]!;
    const filePatterns = args.slice(1);
    const results: string[] = [];

    try {
      const regex = new RegExp(pattern, "g");

      for (const filePattern of filePatterns) {
        // Handle simple glob patterns
        const isGlob = filePattern.includes("*");

        for (const [path, file] of this.files) {
          if (file.isDir) continue;

          let matches = false;
          if (isGlob) {
            const regexPattern = filePattern
              .replace(/\./g, "\\.")
              .replace(/\*/g, ".*");
            matches = new RegExp(`^${this.resolvePath(regexPattern)}$`).test(path);
          } else {
            matches = path === this.resolvePath(filePattern);
          }

          if (matches) {
            const lines = file.content.split("\n");
            lines.forEach((line, idx) => {
              if (regex.test(line)) {
                results.push(`${path}:${idx + 1}:${line}`);
              }
              regex.lastIndex = 0; // Reset regex state
            });
          }
        }
      }
    } catch {
      return {
        stdout: "",
        stderr: `grep: invalid regex: ${pattern}`,
        exitCode: 1,
      };
    }

    return {
      stdout: results.join("\n"),
      stderr: "",
      exitCode: results.length > 0 ? 0 : 1,
    };
  }

  private find(args: string[]): CommandResult {
    const pathArg = args[0] ?? ".";
    const nameIdx = args.indexOf("-name");
    const pattern = nameIdx >= 0 ? args[nameIdx + 1] : "*";

    if (!pattern) {
      return {
        stdout: "",
        stderr: "find: missing argument to -name",
        exitCode: 1,
      };
    }

    const searchPath = this.resolvePath(pathArg);
    const results: string[] = [];

    // Convert glob pattern to regex
    const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
    const nameRegex = new RegExp(`^${regexPattern}$`);

    for (const path of this.files.keys()) {
      if (!path.startsWith(searchPath) && path !== searchPath) continue;

      const name = path.split("/").pop() ?? "";
      if (nameRegex.test(name)) {
        results.push(path);
      }
    }

    return {
      stdout: results.join("\n"),
      stderr: "",
      exitCode: 0,
    };
  }

  /**
   * Read a file (for tool execution)
   */
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

  /**
   * Write a file (for tool execution)
   */
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

    // Ensure parent directory exists
    const parent = resolvedPath.substring(0, resolvedPath.lastIndexOf("/")) || "/";
    if (parent !== "/" && !this.files.has(parent)) {
      // Create parent directories
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

  /**
   * List files in a directory (for tool execution)
   */
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

  /**
   * Delete a file (for tool execution)
   */
  deleteFile(path: string): { success: boolean; error: string | null } {
    const resolvedPath = this.resolvePath(path);
    const file = this.files.get(resolvedPath);

    if (!file) {
      return { success: false, error: `File not found: ${path}` };
    }

    // Check if directory has children
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

  /**
   * Search files (for tool execution)
   */
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
