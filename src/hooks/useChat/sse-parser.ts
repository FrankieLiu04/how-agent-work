export async function* parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") {
          return;
        }
        yield data;
      }
    }
  }
}

export interface SSEParsedChunk {
  type?: string;
  tool_call_id?: string;
  name?: string;
  result?: unknown;
  status?: "working" | "done";
  text?: string;
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

export function parseSSEChunk(data: string): SSEParsedChunk | null {
  try {
    return JSON.parse(data) as SSEParsedChunk;
  } catch {
    return null;
  }
}
