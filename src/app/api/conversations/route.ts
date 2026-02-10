import { auth } from "~/server/auth";
import { db } from "~/server/db";
import type { ConversationMode } from "@prisma/client";

// Limits
const MAX_CONVERSATIONS_PER_USER = 10;
const MAX_MESSAGES_PER_CONVERSATION = 40; // 20 rounds = 40 messages (user + assistant)

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode");
  const mode = (modeParam?.toUpperCase() ?? "") as ConversationMode;

  const where = {
    userId: session.user.id,
    ...(mode && ["CHAT", "AGENT", "IDE", "CLI"].includes(mode)
      ? { mode }
      : {}),
  };

  const conversations = await db.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: { messages: true },
      },
    },
  });

  return new Response(
    JSON.stringify({
      conversations: conversations.map((c) => ({
        id: c.id,
        mode: c.mode,
        title: c.title,
        messageCount: c._count.messages,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      limits: {
        maxConversations: MAX_CONVERSATIONS_PER_USER,
        currentCount: conversations.length,
        maxMessagesPerConversation: MAX_MESSAGES_PER_CONVERSATION,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check conversation limit
  const count = await db.conversation.count({
    where: { userId: session.user.id },
  });

  if (count >= MAX_CONVERSATIONS_PER_USER) {
    return new Response(
      JSON.stringify({
        error: "conversation_limit_reached",
        limit: MAX_CONVERSATIONS_PER_USER,
        current: count,
        message: `You have reached the maximum of ${MAX_CONVERSATIONS_PER_USER} conversations. Please delete some to continue.`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  let body: { mode?: string; title?: string };
  try {
    body = (await request.json()) as { mode?: string; title?: string };
  } catch {
    body = {};
  }

  const mode = (body.mode?.toUpperCase() ?? "CHAT") as ConversationMode;
  if (!["CHAT", "AGENT", "IDE", "CLI"].includes(mode)) {
    return new Response(
      JSON.stringify({ error: "Invalid mode. Must be CHAT, AGENT, IDE, or CLI" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const conversation = await db.conversation.create({
    data: {
      userId: session.user.id,
      mode,
      title: body.title ?? null,
    },
  });

  return new Response(
    JSON.stringify({
      id: conversation.id,
      mode: conversation.mode,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messageCount: 0,
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }
  );
}
