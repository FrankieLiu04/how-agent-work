import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { getTitleGenerationPrompt } from "~/lib/tools/prompts";
import { env } from "~/env";

const MAX_MESSAGES_PER_CONVERSATION = 40;

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = await params;

  // Verify ownership
  const conversation = await db.conversation.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
  });

  if (!conversation) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages = await db.conversationMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
  });

  return new Response(
    JSON.stringify({
      conversationId: id,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        toolCallId: m.toolCallId,
        createdAt: m.createdAt.toISOString(),
      })),
      limits: {
        maxMessages: MAX_MESSAGES_PER_CONVERSATION,
        currentCount: messages.length,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function POST(
  request: Request,
  { params }: RouteParams
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = await params;

  // Verify ownership
  const conversation = await db.conversation.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
    include: {
      _count: {
        select: { messages: true },
      },
    },
  });

  if (!conversation) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check message limit
  if (conversation._count.messages >= MAX_MESSAGES_PER_CONVERSATION) {
    return new Response(
      JSON.stringify({
        error: "message_limit_reached",
        limit: MAX_MESSAGES_PER_CONVERSATION,
        current: conversation._count.messages,
        message: `This conversation has reached the maximum of ${MAX_MESSAGES_PER_CONVERSATION / 2} rounds. Please start a new conversation.`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  let body: {
    role: string;
    content?: string;
    toolCalls?: unknown;
    toolCallId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.role || !["user", "assistant", "tool"].includes(body.role)) {
    return new Response(
      JSON.stringify({ error: "Invalid role. Must be user, assistant, or tool" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Create the message
  const message = await db.conversationMessage.create({
    data: {
      conversationId: id,
      role: body.role,
      content: body.content ?? null,
      toolCalls: body.toolCalls ? JSON.parse(JSON.stringify(body.toolCalls)) : null,
      toolCallId: body.toolCallId ?? null,
    },
  });

  // Update conversation timestamp
  await db.conversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  // Auto-generate title if this is the first user message and no title exists
  if (
    body.role === "user" &&
    body.content &&
    !conversation.title &&
    conversation._count.messages === 0
  ) {
    // Try to generate title asynchronously
    void generateTitle(id, body.content);
  }

  return new Response(
    JSON.stringify({
      id: message.id,
      role: message.role,
      content: message.content,
      toolCalls: message.toolCalls,
      toolCallId: message.toolCallId,
      createdAt: message.createdAt.toISOString(),
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Generate a title for the conversation based on the first message
 */
async function generateTitle(conversationId: string, firstMessage: string): Promise<void> {
  if (!env.OPENAI_API_KEY) {
    // Fallback: use first 20 characters of the message
    const fallbackTitle = firstMessage.slice(0, 20) + (firstMessage.length > 20 ? "..." : "");
    await db.conversation.update({
      where: { id: conversationId },
      data: { title: fallbackTitle },
    });
    return;
  }

  try {
    const baseUrl = env.OPENAI_BASE_URL ?? "https://api.deepseek.com";
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "user",
            content: getTitleGenerationPrompt(firstMessage),
          },
        ],
        max_tokens: 30,
        temperature: 0.7,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const title = data.choices?.[0]?.message?.content?.trim();
      if (title) {
        await db.conversation.update({
          where: { id: conversationId },
          data: { title: title.slice(0, 50) },
        });
      }
    }
  } catch (error) {
    console.error("Failed to generate title:", error);
    // Fallback to truncated message
    const fallbackTitle = firstMessage.slice(0, 20) + (firstMessage.length > 20 ? "..." : "");
    await db.conversation.update({
      where: { id: conversationId },
      data: { title: fallbackTitle },
    });
  }
}
