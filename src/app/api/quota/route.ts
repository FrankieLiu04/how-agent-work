import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

function getHourStart(d: Date): Date {
  const hourStart = new Date(d);
  hourStart.setMinutes(0, 0, 0);
  return hourStart;
}

/**
 * GET /api/quota
 * Returns current quota status without consuming
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = 60;
  const hourStart = getHourStart(new Date());
  const resetAt = new Date(hourStart.getTime() + 60 * 60 * 1000);

  try {
    const existing = await db.quotaHourly.findUnique({
      where: { userId_hourStart: { userId: session.user.id, hourStart } },
      select: { count: true },
    });

    const used = existing?.count ?? 0;
    const remaining = Math.max(0, limit - used);

    return NextResponse.json({
      used,
      limit,
      remaining,
      resetAt: resetAt.toISOString(),
    });
  } catch (error) {
    console.error("Quota check error:", error);
    return NextResponse.json({ error: "Failed to check quota" }, { status: 500 });
  }
}
