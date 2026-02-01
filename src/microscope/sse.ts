export type SSEEvent =
  | { type: "data"; data: string }
  | { type: "done" };

export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  bufferRef: { buffer: string },
): AsyncGenerator<SSEEvent, void, void> {
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;

    bufferRef.buffer += decoder.decode(value, { stream: true });

    while (true) {
      const sep = bufferRef.buffer.indexOf("\n\n");
      if (sep === -1) break;

      const rawEvent = bufferRef.buffer.slice(0, sep);
      bufferRef.buffer = bufferRef.buffer.slice(sep + 2);

      const lines = rawEvent
        .split("\n")
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0);

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice("data:".length).trim();
        if (data === "[DONE]") {
          yield { type: "done" };
          return;
        }
        yield { type: "data", data };
      }
    }
  }
}
