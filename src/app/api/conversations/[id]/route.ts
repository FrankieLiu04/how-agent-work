import { auth } from "~/server/auth";
import { db } from "~/server/db";

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

  const conversation = await db.conversation.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
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

  return new Response(
    JSON.stringify({
      id: conversation.id,
      mode: conversation.mode,
      title: conversation.title,
      messageCount: conversation._count.messages,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        toolCallId: m.toolCallId,
        working: m.working,
        createdAt: m.createdAt.toISOString(),
      })),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function DELETE(
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

  // Verify ownership before deleting
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

  // Delete conversation (messages will cascade delete due to schema)
  await db.conversation.delete({
    where: { id },
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function PATCH(
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

  let body: { title?: string };
  try {
    body = (await request.json()) as { title?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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

  const updated = await db.conversation.update({
    where: { id },
    data: {
      title: body.title,
    },
  });

  return new Response(
    JSON.stringify({
      id: updated.id,
      title: updated.title,
      updatedAt: updated.updatedAt.toISOString(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
