import { exportMetrics, finishTrace, getTrace, listTraces, recordSample, startTrace } from "./observability";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  delete (globalThis as unknown as { __how_agent_work_obs__?: unknown }).__how_agent_work_obs__;
});

describe("observability metrics", () => {
  it("computes latency percentiles from samples", () => {
    for (let i = 1; i <= 100; i++) {
      recordSample("latency_ms", i);
    }

    const exported = exportMetrics();
    const latency = exported.latencies.latency_ms;
    expect(latency).toBeDefined();
    expect(latency?.p50).toBe(51);
    expect(latency?.p95).toBe(96);
    expect(latency?.p99).toBe(100);
  });
});

describe("observability traces", () => {
  it("stores and retrieves traces", () => {
    const trace = startTrace({ traceId: "abc123", route: "/api/chat/stream", mode: "chat", provider: "mock" });
    finishTrace(trace, { status: 200, ttfbMs: 12 });

    const list = listTraces(10);
    expect(list.length).toBe(1);
    expect(list[0]?.traceId).toBe("abc123");
    expect(list[0]?.route).toBe("/api/chat/stream");
    expect(list[0]?.status).toBe(200);

    const fetched = getTrace("abc123");
    expect(fetched?.traceId).toBe("abc123");
    expect(fetched?.ttfbMs).toBe(12);
  });
});
