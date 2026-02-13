export function normalizePath(path: string): string {
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

export function resolvePath(cwd: string, path: string): string {
  if (path.startsWith("/")) {
    return normalizePath(path);
  }
  return normalizePath(`${cwd}/${path}`);
}

export function getParentPath(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return path.substring(0, lastSlash);
}

export function getFileName(path: string): string {
  return path.split("/").pop() ?? "";
}

export function parseCommand(cmdStr: string): { cmd: string; args: string[] } {
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

export function globToRegex(pattern: string): string {
  return pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
}
