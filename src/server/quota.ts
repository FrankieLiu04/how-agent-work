import { db } from "~/server/db";

export type QuotaStatus = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  resetAt: Date;
};

function getHourStart(d: Date): Date {
  const hourStart = new Date(d);
  hourStart.setMinutes(0, 0, 0);
  return hourStart;
}

export async function consumeHourlyQuota(args: { userId: string; limit?: number }): Promise<QuotaStatus> {
  const limit = args.limit ?? 5;
  const hourStart = getHourStart(new Date());
  const resetAt = new Date(hourStart.getTime() + 60 * 60 * 1000);

  const result = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "QuotaHourly" ("userId","hourStart","count","updatedAt")
      VALUES (${args.userId}, ${hourStart}, 1, NOW())
      ON CONFLICT ("userId","hourStart") DO UPDATE
      SET "count" = "QuotaHourly"."count" + 1,
          "updatedAt" = NOW()
      WHERE "QuotaHourly"."count" < ${limit}
      RETURNING "count";
    `;

    if (rows.length > 0) {
      return { allowed: true, count: rows[0]!.count };
    }

    const existing = await tx.quotaHourly.findUnique({
      where: { userId_hourStart: { userId: args.userId, hourStart } },
      select: { count: true },
    });
    return { allowed: false, count: existing?.count ?? limit };
  });

  const used = result.count;
  const remaining = Math.max(0, limit - used);

  return {
    allowed: result.allowed,
    limit,
    used,
    remaining,
    resetAt,
  };
}
