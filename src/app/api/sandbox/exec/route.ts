import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { MockShell, type VirtualFileInfo } from "~/lib/sandbox/mockShell";

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

  let body: { command: string; cwd?: string };
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

  // Limit command length
  if (body.command.length > 500) {
    return new Response(
      JSON.stringify({ error: "Command too long (max 500 characters)" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Get user's files from database
  const dbFiles = await db.virtualFile.findMany({
    where: { userId: session.user.id },
    select: {
      path: true,
      content: true,
      isDir: true,
      size: true,
    },
  });

  // Convert to MockShell format
  const files: VirtualFileInfo[] = dbFiles.map((f) => ({
    path: f.path,
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
    // Get current file paths in DB
    const existingPaths = new Set(dbFiles.map((f) => f.path));
    const newPaths = new Set(newFiles.map((f) => f.path));

    // Files to create/update
    for (const file of newFiles) {
      if (file.path === "/") continue; // Skip root

      await db.virtualFile.upsert({
        where: {
          userId_path: {
            userId: session.user.id,
            path: file.path,
          },
        },
        create: {
          userId: session.user.id,
          path: file.path,
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
