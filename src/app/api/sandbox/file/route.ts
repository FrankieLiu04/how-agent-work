import { auth } from "~/server/auth";
import { db } from "~/server/db";

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
  if (!pathParam) {
    return new Response(JSON.stringify({ error: "Path is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const path = pathParam.startsWith("/") ? pathParam : `/${pathParam}`;

  const file = await db.virtualFile.findUnique({
    where: {
      userId_path: {
        userId: session.user.id,
        path,
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
      path: file.path,
      content: file.content ?? "",
      isDir: file.isDir,
      size: file.size,
      updatedAt: file.updatedAt.toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
