import { getTrace, listTraces } from "~/server/observability";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const traceId = url.searchParams.get("trace_id");
  if (traceId) {
    const t = getTrace(traceId);
    if (!t) {
      return new Response(JSON.stringify({ error: "Trace not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(t), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const limitStr = url.searchParams.get("limit");
  const limit = limitStr ? Math.max(1, Math.min(200, Number(limitStr))) : 50;

  return new Response(JSON.stringify(listTraces(Number.isFinite(limit) ? limit : 50)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
