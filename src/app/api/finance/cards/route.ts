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

  const cards = await db.financeKnowledgeCard.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return new Response(
    JSON.stringify({
      cards: cards.map((c) => ({
        id: c.id,
        title: c.title,
        content: c.content,
        tags: c.tags,
        sourceUrls: c.sourceUrls,
        updatedAt: c.updatedAt.toISOString(),
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
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

  let body: { title?: string; content?: string; tags?: string[]; sourceUrls?: string[] };
  try {
    body = (await request.json()) as {
      title?: string;
      content?: string;
      tags?: string[];
      sourceUrls?: string[];
    };
  } catch {
    body = {};
  }

  if (!body.title || !body.content) {
    return new Response(JSON.stringify({ error: "title_and_content_required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const card = await db.financeKnowledgeCard.create({
    data: {
      userId: session.user.id,
      title: body.title,
      content: body.content,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [],
      sourceUrls: Array.isArray(body.sourceUrls) ? body.sourceUrls.slice(0, 20) : [],
    },
  });

  return new Response(
    JSON.stringify({
      card: {
        id: card.id,
        title: card.title,
        content: card.content,
        tags: card.tags,
        sourceUrls: card.sourceUrls,
        updatedAt: card.updatedAt.toISOString(),
      },
    }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
}

