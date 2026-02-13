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
  cwdChanged?: string;
}

export interface CommandContext {
  cwd: string;
  files: Map<string, VirtualFileInfo>;
  resolvePath: (path: string) => string;
  normalizePath: (path: string) => string;
  setCwd: (path: string) => void;
}

export type CommandHandler = (args: string[], ctx: CommandContext, fullCmd?: string) => CommandResult;
