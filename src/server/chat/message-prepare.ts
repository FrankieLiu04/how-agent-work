import { type ApiChatMessage, type ChatMode } from "~/types";
import { getSystemPrompt } from "~/lib/tools/prompts";

export function prepareMessages(
  mode: ChatMode,
  messages: ApiChatMessage[]
): ApiChatMessage[] {
  const systemPrompt = getSystemPrompt(mode);
  const hasSystemMessage = messages.some((m) => m.role === "system");

  if (hasSystemMessage) {
    return messages.map((m) => {
      if (m.role === "system") {
        return {
          ...m,
          content: `${systemPrompt}\n\n${m.content ?? ""}`,
        };
      }
      return m;
    });
  }

  return [{ role: "system", content: systemPrompt }, ...messages];
}

export function lastUserContent(messages: ApiChatMessage[] | undefined): string {
  const ms = messages ?? [];
  for (let i = ms.length - 1; i >= 0; i--) {
    const m = ms[i];
    if (m?.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

export function hasToolResult(messages: ApiChatMessage[] | undefined): boolean {
  return (messages ?? []).some((m) => m?.role === "tool");
}
