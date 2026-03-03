import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { getTemplatesWithSizes } from "~/lib/sandbox/templates";
import { fromStoredPath, getScopeRoot, toStoredPath } from "~/lib/sandbox/scope";

function whereForScope(userId: string, conversationId: string | null) {
  if (conversationId) {
    return {
      userId,
      path: {
        startsWith: `${toStoredPath("/", conversationId)}`,
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

/**
 * POST /api/sandbox/init
 * Initialize the user's sandbox with default template files
 * 
 * Options:
 * - force: boolean - If true, delete all existing files and reinitialize
 * 
 * Returns: { initialized: boolean, files: [...] }
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { force?: boolean; conversationId?: string | null } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Body is optional for this endpoint
  }

  const force = body.force ?? false;
  const conversationId = body.conversationId ?? null;
  const scopeError = await ensureScopeAccess(session.user.id, conversationId);
  if (scopeError) return scopeError;

  // Check if user already has files
  const existingCount = await db.virtualFile.count({
    where: whereForScope(session.user.id, conversationId),
  });

  if (existingCount > 0 && !force) {
    // Return existing files without reinitializing
    const existingFiles = await db.virtualFile.findMany({
      where: whereForScope(session.user.id, conversationId),
      orderBy: { path: "asc" },
      select: {
        id: true,
        path: true,
        isDir: true,
        size: true,
      },
    });

    return new Response(
      JSON.stringify({
        initialized: false,
        message: "Sandbox already initialized. Use force=true to reinitialize.",
        files: existingFiles.map((f) => ({
          ...f,
          path: fromStoredPath(f.path, conversationId),
        })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // If force, delete all existing files
  if (force && existingCount > 0) {
    await db.virtualFile.deleteMany({
      where: whereForScope(session.user.id, conversationId),
    });
  }

  // Get template files with sizes
  const templates = getTemplatesWithSizes();

  // Create all template files
  const createdFiles = await Promise.all(
    templates.map(async (template) => {
      const file = await db.virtualFile.create({
        data: {
          userId: session.user.id,
          path: toStoredPath(template.path, conversationId),
          content: template.content,
          isDir: template.isDir,
          size: template.size,
        },
      });
      return {
        id: file.id,
        path: fromStoredPath(file.path, conversationId),
        isDir: file.isDir,
        size: file.size,
      };
    })
  );

  return new Response(
    JSON.stringify({
      initialized: true,
      files: createdFiles,
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * GET /api/sandbox/init
 * Check if sandbox is initialized and get status
 */
export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const conversationId = null;
  const existingCount = await db.virtualFile.count({
    where: whereForScope(session.user.id, conversationId),
  });

  return new Response(
    JSON.stringify({
      initialized: existingCount > 0,
      fileCount: existingCount,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
