import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { MockShell, type VirtualFileInfo } from "~/lib/sandbox/mockShell";
import { SANDBOX_LIMITS, TERMINAL_LIMITS } from "~/lib/config";
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
 * POST /api/sandbox/exec
 * Execute a shell command in the user's sandbox
 * 
 * Body: { command: string, cwd?: string }
 * Returns: { stdout, stderr, exitCode, cwdChanged?, files? }
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { command: string; cwd?: string; conversationId?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.command || typeof body.command !== "string") {
    return new Response(JSON.stringify({ error: "Command is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const conversationId = body.conversationId ?? null;
  const scopeError = await ensureScopeAccess(session.user.id, conversationId);
  if (scopeError) return scopeError;

  // Limit command length
  if (body.command.length > TERMINAL_LIMITS.MAX_COMMAND_LENGTH) {
    return new Response(
      JSON.stringify({
        error: "command_too_long",
        maxLength: TERMINAL_LIMITS.MAX_COMMAND_LENGTH,
        message: `Command too long (max ${TERMINAL_LIMITS.MAX_COMMAND_LENGTH} characters)`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Get user's files from database
  const dbFiles = await db.virtualFile.findMany({
    where: whereForScope(session.user.id, conversationId),
    select: {
      path: true,
      content: true,
      isDir: true,
      size: true,
    },
  });

  // Convert to MockShell format
  const files: VirtualFileInfo[] = dbFiles.map((f) => ({
    path: fromStoredPath(f.path, conversationId),
    content: f.content,
    isDir: f.isDir,
    size: f.size,
  }));

  // Ensure root directory exists
  if (!files.find((f) => f.path === "/")) {
    files.push({ path: "/", content: "", isDir: true, size: 0 });
  }

  // Create shell instance with user's files
  const shell = new MockShell(files, body.cwd ?? "/");

  // Execute command
  const result = shell.execute(body.command);

  // Get modified files
  const newFiles = shell.getFiles();

  // Check if files changed (need to sync back to database)
  const filesChanged = 
    newFiles.length !== files.length ||
    newFiles.some((nf) => {
      const of = files.find((f) => f.path === nf.path);
      return !of || of.content !== nf.content || of.isDir !== nf.isDir;
    });

  // Sync changes back to database if files changed
  if (filesChanged) {
    const nonDirFiles = newFiles.filter((f) => !f.isDir && f.path !== "/");
    const totalSize = nonDirFiles.reduce((sum, f) => sum + f.size, 0);
    const tooLarge = nonDirFiles.find((f) => f.size > SANDBOX_LIMITS.MAX_FILE_SIZE_BYTES);
    if (tooLarge) {
      return new Response(
        JSON.stringify({
          error: "file_too_large",
          maxSize: SANDBOX_LIMITS.MAX_FILE_SIZE_BYTES,
          actualSize: tooLarge.size,
          path: tooLarge.path,
          message: `File exceeds maximum size of ${SANDBOX_LIMITS.MAX_FILE_SIZE_BYTES / 1024}KB`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (nonDirFiles.length > SANDBOX_LIMITS.MAX_FILES_PER_USER) {
      return new Response(
        JSON.stringify({
          error: "file_limit_reached",
          maxFiles: SANDBOX_LIMITS.MAX_FILES_PER_USER,
          currentCount: nonDirFiles.length,
          message: `You have reached the maximum of ${SANDBOX_LIMITS.MAX_FILES_PER_USER} files. Please delete some to continue.`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (totalSize > SANDBOX_LIMITS.MAX_TOTAL_SIZE_BYTES) {
      return new Response(
        JSON.stringify({
          error: "storage_limit_exceeded",
          maxTotal: SANDBOX_LIMITS.MAX_TOTAL_SIZE_BYTES,
          currentTotal: totalSize,
          message: `Storage limit of ${SANDBOX_LIMITS.MAX_TOTAL_SIZE_BYTES / 1024}KB would be exceeded`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get current file paths in DB
    const existingPaths = new Set(dbFiles.map((f) => f.path));
    const newPaths = new Set(
      newFiles
        .filter((f) => f.path !== "/")
        .map((f) => toStoredPath(f.path, conversationId))
    );

    // Files to create/update
    for (const file of newFiles) {
      if (file.path === "/") continue; // Skip root
      const storedPath = toStoredPath(file.path, conversationId);

      await db.virtualFile.upsert({
        where: {
          userId_path: {
            userId: session.user.id,
            path: storedPath,
          },
        },
        create: {
          userId: session.user.id,
          path: storedPath,
          content: file.content,
          isDir: file.isDir,
          size: file.size,
        },
        update: {
          content: file.content,
          isDir: file.isDir,
          size: file.size,
        },
      });
    }

    // Files to delete
    for (const path of existingPaths) {
      if (!newPaths.has(path)) {
        await db.virtualFile.delete({
          where: {
            userId_path: {
              userId: session.user.id,
              path,
            },
          },
        });
      }
    }
  }

  return new Response(
    JSON.stringify({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      cwdChanged: result.cwdChanged,
      filesChanged,
      // Return file list if files changed
      ...(filesChanged && {
        files: newFiles
          .filter((f) => f.path !== "/")
          .map((f) => ({
            path: f.path,
            isDir: f.isDir,
            size: f.size,
          })),
      }),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
