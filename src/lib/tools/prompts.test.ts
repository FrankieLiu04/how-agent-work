import { describe, expect, it } from "vitest";
import { getSystemPrompt } from "./prompts";

describe("prompts", () => {
  it("finance prompt includes safety and non-advice constraints", () => {
    const p = getSystemPrompt("finance");
    expect(p).toContain("不构成投资建议");
    expect(p).toContain("不编造");
    expect(p).toContain("标注来源");
  });

  it("teaching modes keep programming constraint", () => {
    const p = getSystemPrompt("chat");
    expect(p).toContain("只回答与编程、技术、学习相关的问题");
  });
});

