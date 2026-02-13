import { handleChatStream } from "~/server/chat";
import { type ChatStreamRequest } from "~/types";

export async function POST(request: Request): Promise<Response> {
  let body: ChatStreamRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await handleChatStream({ request, body });
  return result.response;
}
