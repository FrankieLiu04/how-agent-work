export type Span = {
  name: string;
  startMs: number;
  endMs: number | null;
  attrs: Record<string, string>;
};

export type Trace = {
  traceId: string;
  route: string;
  mode: string;
  provider: "mock" | "openai";
  startMs: number;
  endMs: number | null;
  status: number | null;
  ttfbMs: number | null;
  spans: Span[];
};

type Store = {
  maxTraces: number;
  traces: Trace[];
  counters: Record<string, number>;
  samples: Record<string, number[]>;
};

function getStore(): Store {
  const g = globalThis as unknown as { __how_agent_work_obs__?: Store };
  if (!g.__how_agent_work_obs__) {
    g.__how_agent_work_obs__ = {
      maxTraces: 200,
      traces: [],
      counters: {},
      samples: {},
    };
  }
  return g.__how_agent_work_obs__;
}

export function startTrace(args: { traceId: string; route: string; mode: string; provider: "mock" | "openai" }): Trace {
  return {
    traceId: args.traceId,
    route: args.route,
    mode: args.mode,
    provider: args.provider,
    startMs: Date.now(),
    endMs: null,
    status: null,
    ttfbMs: null,
    spans: [],
  };
}

export function startSpan(trace: Trace, name: string, attrs?: Record<string, string>): Span {
  const span: Span = { name, startMs: Date.now(), endMs: null, attrs: attrs ?? {} };
  trace.spans.push(span);
  return span;
}

export function finishSpan(span: Span): void {
  span.endMs = Date.now();
}

export function finishTrace(trace: Trace, args: { status: number; ttfbMs: number | null }): void {
  trace.endMs = Date.now();
  trace.status = args.status;
  trace.ttfbMs = args.ttfbMs;

  const store = getStore();
  store.traces.push(trace);
  if (store.traces.length > store.maxTraces) {
    store.traces.splice(0, store.traces.length - store.maxTraces);
  }
}

export function incrementCounter(name: string, delta = 1): void {
  const store = getStore();
  store.counters[name] = (store.counters[name] ?? 0) + delta;
}

export function recordSample(name: string, value: number, max = 5000): void {
  const store = getStore();
  const arr = store.samples[name] ?? [];
  arr.push(value);
  if (arr.length > max) arr.splice(0, arr.length - max);
  store.samples[name] = arr;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx] ?? 0;
}

export function exportMetrics(): { counters: Record<string, number>; latencies: Record<string, { p50: number; p95: number; p99: number }> } {
  const store = getStore();
  const counters = { ...store.counters };

  const latencies: Record<string, { p50: number; p95: number; p99: number }> = {};
  for (const [name, values] of Object.entries(store.samples)) {
    const copied = [...values].sort((a, b) => a - b);
    latencies[name] = {
      p50: percentile(copied, 0.5),
      p95: percentile(copied, 0.95),
      p99: percentile(copied, 0.99),
    };
  }

  return { counters, latencies };
}

export function listTraces(limit = 50): Array<{
  traceId: string;
  route: string;
  mode: string;
  provider: string;
  status: number | null;
  durationMs: number | null;
  startTime: string;
}> {
  const store = getStore();
  const slice = store.traces.slice(Math.max(0, store.traces.length - limit));
  return slice.map((t) => ({
    traceId: t.traceId,
    route: t.route,
    mode: t.mode,
    provider: t.provider,
    status: t.status,
    durationMs: t.endMs ? t.endMs - t.startMs : null,
    startTime: new Date(t.startMs).toISOString(),
  }));
}

export function getTrace(traceId: string): Trace | null {
  const store = getStore();
  for (let i = store.traces.length - 1; i >= 0; i--) {
    const t = store.traces[i];
    if (t?.traceId === traceId) return t;
  }
  return null;
}
