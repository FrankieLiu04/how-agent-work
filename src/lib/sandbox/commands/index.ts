import type { CommandHandler, CommandContext, CommandResult } from "../types";

export const ls: CommandHandler = (args: string[], ctx: CommandContext): CommandResult => {
  const showAll = args.includes("-a") || args.includes("-la") || args.includes("-al");
  const showLong = args.includes("-l") || args.includes("-la") || args.includes("-al");
  const pathArg = args.find((a) => !a.startsWith("-")) ?? ctx.cwd;
  const targetPath = ctx.resolvePath(pathArg);

  const entries: string[] = [];
  const targetDir = targetPath === "/" ? "" : targetPath;

  for (const [path, file] of ctx.files) {
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

  if (entries.length === 0 && !ctx.files.has(targetPath)) {
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
};

export const cd: CommandHandler = (args: string[], ctx: CommandContext): CommandResult => {
  const target = args[0] ?? "/";
  const newPath = ctx.resolvePath(target);

  const dirEntry = ctx.files.get(newPath);
  if (!dirEntry) {
    let pathExists = false;
    for (const path of ctx.files.keys()) {
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

  ctx.setCwd(newPath);
  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
    cwdChanged: newPath,
  };
};

export const pwd: CommandHandler = (_args: string[], ctx: CommandContext): CommandResult => {
  return {
    stdout: ctx.cwd,
    stderr: "",
    exitCode: 0,
  };
};

export const cat: CommandHandler = (args: string[], ctx: CommandContext): CommandResult => {
  if (args.length === 0) {
    return {
      stdout: "",
      stderr: "cat: missing file operand",
      exitCode: 1,
    };
  }

  const outputs: string[] = [];
  for (const arg of args) {
    const path = ctx.resolvePath(arg);
    const file = ctx.files.get(path);

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
};

export const mkdir: CommandHandler = (args: string[], ctx: CommandContext): CommandResult => {
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
    const path = ctx.resolvePath(dir);

    if (ctx.files.has(path)) {
      if (!createParents) {
        return {
          stdout: "",
          stderr: `mkdir: ${dir}: File exists`,
          exitCode: 1,
        };
      }
      continue;
    }

    if (createParents) {
      const parts = path.split("/").filter(Boolean);
      let currentPath = "";
      for (const part of parts) {
        currentPath += "/" + part;
        if (!ctx.files.has(currentPath)) {
          ctx.files.set(currentPath, {
            path: currentPath,
            content: "",
            isDir: true,
            size: 0,
          });
        }
      }
    } else {
      const parent = path.substring(0, path.lastIndexOf("/")) || "/";
      if (!ctx.files.has(parent) && parent !== "/") {
        return {
          stdout: "",
          stderr: `mkdir: ${dir}: No such file or directory`,
          exitCode: 1,
        };
      }

      ctx.files.set(path, {
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
};

export const touch: CommandHandler = (args: string[], ctx: CommandContext): CommandResult => {
  if (args.length === 0) {
    return {
      stdout: "",
      stderr: "touch: missing file operand",
      exitCode: 1,
    };
  }

  for (const arg of args) {
    const path = ctx.resolvePath(arg);

    if (!ctx.files.has(path)) {
      const parent = path.substring(0, path.lastIndexOf("/")) || "/";
      if (!ctx.files.has(parent) && parent !== "/") {
        return {
          stdout: "",
          stderr: `touch: ${arg}: No such file or directory`,
          exitCode: 1,
        };
      }

      ctx.files.set(path, {
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
};

export const rm: CommandHandler = (args: string[], ctx: CommandContext): CommandResult => {
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
    const path = ctx.resolvePath(target);
    const file = ctx.files.get(path);

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

    const toDelete = [path];
    if (file.isDir) {
      for (const p of ctx.files.keys()) {
        if (p.startsWith(path + "/")) {
          toDelete.push(p);
        }
      }
    }

    for (const p of toDelete) {
      ctx.files.delete(p);
    }
  }

  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
  };
};

export const echo: CommandHandler = (args: string[], ctx: CommandContext, fullCmd?: string): CommandResult => {
  const redirectMatch = fullCmd?.match(/echo\s+(.+?)\s*>\s*(.+)$/);
  if (redirectMatch) {
    const content = redirectMatch[1]!.replace(/^["']|["']$/g, "").trim();
    const filePath = ctx.resolvePath(redirectMatch[2]!.trim());

    const parent = filePath.substring(0, filePath.lastIndexOf("/")) || "/";
    if (!ctx.files.has(parent) && parent !== "/") {
      return {
        stdout: "",
        stderr: `echo: ${redirectMatch[2]}: No such file or directory`,
        exitCode: 1,
      };
    }

    const byteSize = new TextEncoder().encode(content).length;
    ctx.files.set(filePath, {
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

  const output = args.map((a) => a.replace(/^["']|["']$/g, "")).join(" ");
  return {
    stdout: output,
    stderr: "",
    exitCode: 0,
  };
};

export const grep: CommandHandler = (args: string[], ctx: CommandContext): CommandResult => {
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
      const isGlob = filePattern.includes("*");

      for (const [path, file] of ctx.files) {
        if (file.isDir) continue;

        let matches = false;
        if (isGlob) {
          const regexPattern = filePattern
            .replace(/\./g, "\\.")
            .replace(/\*/g, ".*");
          matches = new RegExp(`^${ctx.resolvePath(regexPattern)}$`).test(path);
        } else {
          matches = path === ctx.resolvePath(filePattern);
        }

        if (matches) {
          const lines = file.content.split("\n");
          lines.forEach((line, idx) => {
            if (regex.test(line)) {
              results.push(`${path}:${idx + 1}:${line}`);
            }
            regex.lastIndex = 0;
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
};

export const find: CommandHandler = (args: string[], ctx: CommandContext): CommandResult => {
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

  const searchPath = ctx.resolvePath(pathArg);
  const results: string[] = [];

  const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
  const nameRegex = new RegExp(`^${regexPattern}$`);

  for (const path of ctx.files.keys()) {
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
};
