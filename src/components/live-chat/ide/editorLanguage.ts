"use client";

export type EditorLanguageKind = "ts" | "js" | "json" | "py" | "md" | "html" | "css" | "text";

export function languageForPath(path: string | null): EditorLanguageKind {
  if (!path) return "text";
  const name = path.split("/").pop() ?? "";
  const lower = name.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "ts";
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "js";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".py")) return "py";
  if (lower.endsWith(".md")) return "md";
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".css")) return "css";
  return "text";
}

