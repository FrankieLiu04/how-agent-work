"use client";

import { describe, expect, it } from "vitest";
import { languageForPath } from "./editorLanguage";

describe("languageForPath", () => {
  it("detects common extensions", () => {
    expect(languageForPath("/src/index.ts")).toBe("ts");
    expect(languageForPath("/src/index.tsx")).toBe("ts");
    expect(languageForPath("/src/index.js")).toBe("js");
    expect(languageForPath("/src/index.jsx")).toBe("js");
    expect(languageForPath("/data/config.json")).toBe("json");
    expect(languageForPath("/scripts/main.py")).toBe("py");
    expect(languageForPath("/README.md")).toBe("md");
    expect(languageForPath("/public/index.html")).toBe("html");
    expect(languageForPath("/styles/app.css")).toBe("css");
  });

  it("falls back to text", () => {
    expect(languageForPath(null)).toBe("text");
    expect(languageForPath("/notes.txt")).toBe("text");
    expect(languageForPath("/Makefile")).toBe("text");
  });
});

