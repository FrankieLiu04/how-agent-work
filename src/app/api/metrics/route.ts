import { exportMetrics } from "~/server/observability";

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify(exportMetrics()), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
