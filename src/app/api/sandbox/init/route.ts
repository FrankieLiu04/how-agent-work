import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { getTemplatesWithSizes } from "~/lib/sandbox/templates";

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

  let body: { force?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Body is optional for this endpoint
  }

  const force = body.force ?? false;

  // Check if user already has files
  const existingCount = await db.virtualFile.count({
    where: { userId: session.user.id },
  });

  if (existingCount > 0 && !force) {
    // Return existing files without reinitializing
    const existingFiles = await db.virtualFile.findMany({
      where: { userId: session.user.id },
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
        files: existingFiles,
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
      where: { userId: session.user.id },
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
          path: template.path,
          content: template.content,
          isDir: template.isDir,
          size: template.size,
        },
      });
      return {
        id: file.id,
        path: file.path,
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

  const existingCount = await db.virtualFile.count({
    where: { userId: session.user.id },
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
