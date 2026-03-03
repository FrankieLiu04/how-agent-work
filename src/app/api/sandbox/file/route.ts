import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  isReservedSandboxPath,
  normalizeUserPath,
  toStoredPath,
} from "~/lib/sandbox/scope";

async function ensureScopeAccess(userId: string, conversationId: string | null): Promise<Response | null> {
  if (!conversationId) return null;
  const conversation = await db.conversation.findFirst({
    where: {
      id: conversationId,
      userId,
    },
    select: { id: true },
  });
  if (!conversation) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const pathParam = url.searchParams.get("path");
  const conversationId = url.searchParams.get("conversationId");
  if (!pathParam) {
    return new Response(JSON.stringify({ error: "Path is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const scopeError = await ensureScopeAccess(session.user.id, conversationId);
  if (scopeError) return scopeError;

  const path = normalizeUserPath(pathParam);
  if (isReservedSandboxPath(path)) {
    return new Response(JSON.stringify({ error: "Invalid path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const storedPath = toStoredPath(path, conversationId);

  const file = await db.virtualFile.findUnique({
    where: {
      userId_path: {
        userId: session.user.id,
        path: storedPath,
      },
    },
    select: {
      path: true,
      content: true,
      isDir: true,
      size: true,
      updatedAt: true,
    },
  });

  if (!file) {
    return new Response(JSON.stringify({ error: "File not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (file.isDir) {
    return new Response(JSON.stringify({ error: "Path is a directory" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      path,
      content: file.content ?? "",
      isDir: file.isDir,
      size: file.size,
      updatedAt: file.updatedAt.toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
