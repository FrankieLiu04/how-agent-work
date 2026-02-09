import { auth } from "~/server/auth";
import { db } from "~/server/db";

// Limits
const MAX_FILES_PER_USER = 20;
const MAX_FILE_SIZE_BYTES = 5 * 1024; // 5KB
const MAX_TOTAL_SIZE_BYTES = 100 * 1024; // 100KB

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const files = await db.virtualFile.findMany({
    where: { userId: session.user.id },
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

  return new Response(
    JSON.stringify({
      files: files.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      limits: {
        maxFiles: MAX_FILES_PER_USER,
        maxFileSize: MAX_FILE_SIZE_BYTES,
        maxTotalSize: MAX_TOTAL_SIZE_BYTES,
        currentFileCount: files.length,
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

  let body: { path: string; content?: string; isDir?: boolean };
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

  // Normalize path
  const path = body.path.startsWith("/") ? body.path : `/${body.path}`;
  const content = body.content ?? "";
  const isDir = body.isDir ?? false;
  const size = isDir ? 0 : new TextEncoder().encode(content).length;

  // Check file size limit
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

  // Check if file exists
  const existing = await db.virtualFile.findUnique({
    where: {
      userId_path: {
        userId: session.user.id,
        path,
      },
    },
  });

  if (existing) {
    // Update existing file
    const currentStats = await db.virtualFile.aggregate({
      where: { userId: session.user.id },
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
          path,
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
        path: updated.path,
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

  // Creating new file
  const fileCount = await db.virtualFile.count({
    where: { userId: session.user.id },
  });

  if (fileCount >= MAX_FILES_PER_USER) {
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
    where: { userId: session.user.id },
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

  // Create parent directories if needed
  const parts = path.split("/").filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const parentPath = "/" + parts.slice(0, i).join("/");
    await db.virtualFile.upsert({
      where: {
        userId_path: {
          userId: session.user.id,
          path: parentPath,
        },
      },
      create: {
        userId: session.user.id,
        path: parentPath,
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
      path,
      content,
      isDir,
      size,
    },
  });

  return new Response(
    JSON.stringify({
      id: created.id,
      path: created.path,
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

  if (!path) {
    return new Response(JSON.stringify({ error: "Path is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // Check if file exists
  const file = await db.virtualFile.findUnique({
    where: {
      userId_path: {
        userId: session.user.id,
        path: normalizedPath,
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
          startsWith: normalizedPath + "/",
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
        path: normalizedPath,
      },
    },
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
