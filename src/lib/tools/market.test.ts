import { describe, expect, it, vi } from "vitest";
import { fetchStooqDailyHistory, fetchStooqQuote } from "./market";

describe("market tools", () => {
  it("parses stooq quote csv", async () => {
    const csv = [
      "Symbol,Date,Time,Open,High,Low,Close,Volume",
      "aapl.us,2026-02-21,22:00:10,180.0,185.0,179.5,184.2,123456",
      "",
    ].join("\n");

    const fetchMock = vi.fn(async () => {
      return new Response(csv, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const quote = await fetchStooqQuote("AAPL.US");
    expect(quote.symbol).toBe("aapl.us");
    expect(quote.close).toBe(184.2);
    expect(quote.volume).toBe(123456);
    expect(quote.source).toContain("stooq.com");
  });

  it("parses stooq daily history csv with limit", async () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "2026-02-19,10,11,9,10.5,100",
      "2026-02-20,10.5,12,10,11.2,200",
      "2026-02-21,11.2,13,11,12.8,300",
      "",
    ].join("\n");

    const fetchMock = vi.fn(async () => {
      return new Response(csv, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const history = await fetchStooqDailyHistory("spy.us", 2);
    expect(history.symbol).toBe("spy.us");
    expect(history.bars.length).toBe(2);
    expect(history.bars[0]?.date).toBe("2026-02-20");
    expect(history.bars[1]?.close).toBe(12.8);
    expect(history.source).toContain("stooq.com");
  });
});

