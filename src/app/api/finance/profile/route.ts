import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profile = await db.financeProfile.findUnique({
    where: { userId: session.user.id },
  });

  return new Response(
    JSON.stringify({
      profile: profile
        ? {
            id: profile.id,
            data: profile.data ?? null,
            updatedAt: profile.updatedAt.toISOString(),
          }
        : null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

export async function PUT(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { data?: unknown };
  try {
    body = (await request.json()) as { data?: unknown };
  } catch {
    body = {};
  }

  const profile = await db.financeProfile.upsert({
    where: { userId: session.user.id },
    update: { data: body.data as never },
    create: { userId: session.user.id, data: body.data as never },
  });

  return new Response(
    JSON.stringify({
      profile: {
        id: profile.id,
        data: profile.data ?? null,
        updatedAt: profile.updatedAt.toISOString(),
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

export async function DELETE(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db.financeProfile.deleteMany({
    where: { userId: session.user.id },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

