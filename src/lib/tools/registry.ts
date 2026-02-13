import type { ToolDefinition, ChatMode } from "~/types";

export interface ToolExecutor<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  parameters: ToolDefinition["function"]["parameters"];
  execute: (args: TArgs) => Promise<TResult>;
  validate?: (args: TArgs) => boolean;
}

export interface RegisteredTool extends ToolExecutor {
  definition: ToolDefinition;
}

class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private modeTools: Map<ChatMode, Set<string>> = new Map([
    ["chat", new Set()],
    ["agent", new Set()],
    ["ide", new Set()],
    ["cli", new Set()],
  ]);

  register<TArgs = Record<string, unknown>, TResult = unknown>(
    executor: ToolExecutor<TArgs, TResult>,
    modes: ChatMode[] = ["agent", "ide", "cli"]
  ): void {
    const definition: ToolDefinition = {
      type: "function",
      function: {
        name: executor.name,
        description: executor.description,
        parameters: executor.parameters,
      },
    };

    this.tools.set(executor.name, {
      ...executor,
      definition,
    } as RegisteredTool);

    for (const mode of modes) {
      this.modeTools.get(mode)?.add(executor.name);
    }
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  getDefinitions(mode: ChatMode): ToolDefinition[] {
    const toolNames = this.modeTools.get(mode);
    if (!toolNames) return [];

    const definitions: ToolDefinition[] = [];
    for (const name of toolNames) {
      const tool = this.tools.get(name);
      if (tool) {
        definitions.push(tool.definition);
      }
    }
    return definitions;
  }

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    if (tool.validate && !tool.validate(args)) {
      throw new Error(`Invalid arguments for tool: ${name}`);
    }

    return tool.execute(args);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  listForMode(mode: ChatMode): string[] {
    const toolNames = this.modeTools.get(mode);
    return toolNames ? Array.from(toolNames) : [];
  }
}

export const toolRegistry = new ToolRegistry();

export function createTool<TArgs = Record<string, unknown>, TResult = unknown>(
  config: ToolExecutor<TArgs, TResult>
): ToolExecutor<TArgs, TResult> {
  return config;
}
