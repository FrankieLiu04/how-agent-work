import { describe, expect, it } from "vitest";
import type { ToolCall } from "~/components/ToolCallDisplay";
import { mergeToolCallDelta } from "./tool-call-merge";

describe("mergeToolCallDelta", () => {
  it("backfills tool name from later delta chunks", () => {
    const toolCalls: ToolCall[] = [];
    const indexMap = new Map<number, { arrayIndex: number; rawArgs: string }>();

    mergeToolCallDelta(
      {
        index: 0,
        id: "call_1",
        function: {
          arguments: "{\"path\":\"/src/sum.py\",",
        },
      },
      toolCalls,
      indexMap
    );

    mergeToolCallDelta(
      {
        index: 0,
        function: {
          name: "write_file",
          arguments: "\"content\":\"def add(a,b):\\n    return a+b\"}",
        },
      },
      toolCalls,
      indexMap
    );

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.name).toBe("write_file");
    expect(toolCalls[0]?.id).toBe("call_1");
    expect(toolCalls[0]?.arguments).toEqual({
      path: "/src/sum.py",
      content: "def add(a,b):\n    return a+b",
    });
  });
});

