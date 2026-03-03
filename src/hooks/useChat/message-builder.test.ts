import { describe, expect, it } from "vitest";
import { createWorkingUpdater } from "./message-builder";
import type { ChatMessage } from "./types";

describe("createWorkingUpdater", () => {
  it("tracks current working state for round persistence", () => {
    let messages: ChatMessage[] = [
      {
        id: "assistant_1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-03T00:00:00.000Z"),
      },
    ];

    const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      messages = updater(messages);
    };

    const working = createWorkingUpdater("assistant_1", setMessages);
    working.appendWorkingSummary("搜索资料");
    working.setWorkingStatus("done");

    expect(working.getCurrentWorking()).toEqual({
      status: "done",
      summary: ["搜索资料"],
    });
    expect(messages[0]?.working).toEqual({
      status: "done",
      summary: ["搜索资料"],
    });
  });
});

