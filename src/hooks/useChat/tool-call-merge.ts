import type { ToolCall } from "~/components/ToolCallDisplay";

export interface StreamingToolCallDelta {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ToolCallIndexEntry {
  arrayIndex: number;
  rawArgs: string;
}

export function mergeToolCallDelta(
  delta: StreamingToolCallDelta,
  toolCalls: ToolCall[],
  toolCallIndexMap: Map<number, ToolCallIndexEntry>
): void {
  const idx = delta.index ?? 0;
  const existing = toolCallIndexMap.get(idx);

  if (existing != null) {
    existing.rawArgs += delta.function?.arguments ?? "";
    const current = toolCalls[existing.arrayIndex];
    if (!current) return;

    let next: ToolCall = current;
    if (delta.id) {
      next = { ...next, id: delta.id };
    }
    if (delta.function?.name) {
      next = { ...next, name: delta.function.name };
    }
    try {
      const args = JSON.parse(existing.rawArgs) as Record<string, unknown>;
      next = { ...next, arguments: args };
    } catch {
      // ignore partial JSON chunks
    }

    toolCalls[existing.arrayIndex] = next;
    return;
  }

  const rawArgs = delta.function?.arguments ?? "";
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs) as Record<string, unknown>;
  } catch {
    // ignore partial JSON chunks
  }

  const arrayIndex = toolCalls.length;
  toolCalls.push({
    id: delta.id ?? `pending_${idx}`,
    name: delta.function?.name ?? "unknown",
    arguments: args,
    status: "pending",
  });
  toolCallIndexMap.set(idx, { arrayIndex, rawArgs });
}

