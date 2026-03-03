import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { SANDBOX_LIMITS } from "~/lib/config";
import {
  buildScopePrefix,
  fromStoredPath,
  getScopeRoot,
  isReservedSandboxPath,
  normalizeUserPath,
  toStoredPath,
} from "~/lib/sandbox/scope";

// Limits
const MAX_FILES_PER_USER = SANDBOX_LIMITS.MAX_FILES_PER_USER;
const MAX_FILE_SIZE_BYTES = SANDBOX_LIMITS.MAX_FILE_SIZE_BYTES;
const MAX_TOTAL_SIZE_BYTES = SANDBOX_LIMITS.MAX_TOTAL_SIZE_BYTES;

function whereForScope(userId: string, conversationId: string | null) {
  if (conversationId) {
    return {
      userId,
      path: {
        startsWith: `${buildScopePrefix(conversationId)}/`,
      },
    };
  }

  return {
    userId,
    NOT: {
      path: {
        startsWith: `${getScopeRoot()}/`,
      },
    },
  };
}

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
  const conversationId = url.searchParams.get("conversationId");
  const scopeError = await ensureScopeAccess(session.user.id, conversationId);
  if (scopeError) return scopeError;

  const files = await db.virtualFile.findMany({
    where: whereForScope(session.user.id, conversationId),
    orderBy: { path: "asc" },
    select: {
      id: true,
      path: true,
      isDir: true,
      size: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const fileCount = files.filter((f) => !f.isDir).length;

  return new Response(
    JSON.stringify({
      files: files.map((f) => ({
        ...f,
        path: fromStoredPath(f.path, conversationId),
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      limits: {
        maxFiles: MAX_FILES_PER_USER,
        maxFileSize: MAX_FILE_SIZE_BYTES,
        maxTotalSize: MAX_TOTAL_SIZE_BYTES,
        currentFileCount: fileCount,
        currentTotalSize: totalSize,
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

  let body: { path: string; content?: string; isDir?: boolean; conversationId?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.path) {
    return new Response(JSON.stringify({ error: "Path is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const conversationId = body.conversationId ?? null;
  const scopeError = await ensureScopeAccess(session.user.id, conversationId);
  if (scopeError) return scopeError;

  try {
    const path = normalizeUserPath(body.path);
    if (isReservedSandboxPath(path)) {
      return new Response(JSON.stringify({ error: "Invalid path" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const storedPath = toStoredPath(path, conversationId);
    const content = body.content ?? "";
    const isDir = body.isDir ?? false;
    const size = isDir ? 0 : new TextEncoder().encode(content).length;

    if (size > MAX_FILE_SIZE_BYTES) {
      return new Response(
        JSON.stringify({
          error: "file_too_large",
          maxSize: MAX_FILE_SIZE_BYTES,
          actualSize: size,
          message: `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024}KB`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const existing = await db.virtualFile.findUnique({
        where: {
          userId_path: {
            userId: session.user.id,
            path: storedPath,
          },
        },
      });

    if (existing) {
      const currentStats = await db.virtualFile.aggregate({
        where: whereForScope(session.user.id, conversationId),
        _sum: { size: true },
      });
      const currentTotal = currentStats._sum.size ?? 0;
      const newTotal = currentTotal - existing.size + size;

      if (newTotal > MAX_TOTAL_SIZE_BYTES) {
        return new Response(
          JSON.stringify({
            error: "storage_limit_exceeded",
            maxTotal: MAX_TOTAL_SIZE_BYTES,
            currentTotal: newTotal,
            message: `Storage limit of ${MAX_TOTAL_SIZE_BYTES / 1024}KB would be exceeded`,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const updated = await db.virtualFile.update({
        where: {
          userId_path: {
            userId: session.user.id,
            path: storedPath,
          },
        },
        data: {
          content,
          size,
          isDir,
        },
      });

      return new Response(
        JSON.stringify({
          id: updated.id,
          path,
          size: updated.size,
          isDir: updated.isDir,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const fileCount = await db.virtualFile.count({
      where: {
        ...whereForScope(session.user.id, conversationId),
        isDir: false,
      },
    });

    if (!isDir && fileCount >= MAX_FILES_PER_USER) {
      return new Response(
        JSON.stringify({
          error: "file_limit_reached",
          maxFiles: MAX_FILES_PER_USER,
          currentCount: fileCount,
          message: `You have reached the maximum of ${MAX_FILES_PER_USER} files. Please delete some to continue.`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const currentStats = await db.virtualFile.aggregate({
      where: whereForScope(session.user.id, conversationId),
      _sum: { size: true },
    });
    const currentTotal = currentStats._sum.size ?? 0;

    if (currentTotal + size > MAX_TOTAL_SIZE_BYTES) {
      return new Response(
        JSON.stringify({
          error: "storage_limit_exceeded",
          maxTotal: MAX_TOTAL_SIZE_BYTES,
          currentTotal: currentTotal + size,
          message: `Storage limit of ${MAX_TOTAL_SIZE_BYTES / 1024}KB would be exceeded`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const parentPath = "/" + parts.slice(0, i).join("/");
      const storedParentPath = toStoredPath(parentPath, conversationId);
      const existingParent = await db.virtualFile.findUnique({
        where: {
          userId_path: {
            userId: session.user.id,
            path: storedParentPath,
          },
        },
        select: { isDir: true },
      });
      if (existingParent && !existingParent.isDir) {
        return new Response(
          JSON.stringify({
            error: "parent_not_directory",
            message: `Parent path is not a directory: ${parentPath}`,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      await db.virtualFile.upsert({
        where: {
          userId_path: {
            userId: session.user.id,
            path: storedParentPath,
          },
        },
        create: {
          userId: session.user.id,
          path: storedParentPath,
          content: "",
          isDir: true,
          size: 0,
        },
        update: {},
      });
    }

    const created = await db.virtualFile.create({
      data: {
        userId: session.user.id,
        path: storedPath,
        content,
        isDir,
        size,
      },
    });

    return new Response(
      JSON.stringify({
        id: created.id,
        path,
        size: created.size,
        isDir: created.isDir,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: "internal_error", message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  const conversationId = url.searchParams.get("conversationId");

  if (!path) {
    return new Response(JSON.stringify({ error: "Path is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const scopeError = await ensureScopeAccess(session.user.id, conversationId);
  if (scopeError) return scopeError;

  const normalizedPath = normalizeUserPath(path);
  if (isReservedSandboxPath(normalizedPath)) {
    return new Response(JSON.stringify({ error: "Invalid path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const storedPath = toStoredPath(normalizedPath, conversationId);

  // Check if file exists
  const file = await db.virtualFile.findUnique({
    where: {
      userId_path: {
        userId: session.user.id,
        path: storedPath,
      },
    },
  });

  if (!file) {
    return new Response(JSON.stringify({ error: "File not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // If it's a directory, check if it has children
  if (file.isDir) {
    const children = await db.virtualFile.count({
      where: {
        userId: session.user.id,
        path: {
          startsWith: storedPath + "/",
        },
      },
    });

    if (children > 0) {
      return new Response(
        JSON.stringify({
          error: "directory_not_empty",
          message: "Cannot delete non-empty directory. Delete children first.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  await db.virtualFile.delete({
    where: {
      userId_path: {
        userId: session.user.id,
        path: storedPath,
      },
    },
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
