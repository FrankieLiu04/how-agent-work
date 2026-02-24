export type MarketQuote = {
  symbol: string;
  date: string | null;
  time: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  source: string;
};

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0]!.split(",").map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(",");
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = (parts[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function toNumberOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function fetchStooqQuote(symbolRaw: string): Promise<MarketQuote> {
  const symbol = symbolRaw.trim().toLowerCase();
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`market_upstream_error:${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  const row = rows[0];
  if (!row) {
    return {
      symbol,
      date: null,
      time: null,
      open: null,
      high: null,
      low: null,
      close: null,
      volume: null,
      source: url,
    };
  }

  const close = toNumberOrNull(row.Close);
  const open = toNumberOrNull(row.Open);
  const high = toNumberOrNull(row.High);
  const low = toNumberOrNull(row.Low);
  const volume = toIntOrNull(row.Volume);

  return {
    symbol,
    date: row.Date || null,
    time: row.Time || null,
    open,
    high,
    low,
    close,
    volume,
    source: url,
  };
}

export type MarketBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export async function fetchStooqDailyHistory(
  symbolRaw: string,
  limit: number
): Promise<{ symbol: string; bars: MarketBar[]; source: string }> {
  const symbol = symbolRaw.trim().toLowerCase();
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`market_upstream_error:${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  const bars = rows
    .map((r) => {
      const date = r.Date;
      const open = toNumberOrNull(r.Open);
      const high = toNumberOrNull(r.High);
      const low = toNumberOrNull(r.Low);
      const close = toNumberOrNull(r.Close);
      if (!date || open === null || high === null || low === null || close === null) return null;
      return {
        date,
        open,
        high,
        low,
        close,
        volume: toIntOrNull(r.Volume),
      } satisfies MarketBar;
    })
    .filter((b): b is MarketBar => Boolean(b));

  const sliced = limit > 0 ? bars.slice(Math.max(0, bars.length - limit)) : bars;
  return { symbol, bars: sliced, source: url };
}

