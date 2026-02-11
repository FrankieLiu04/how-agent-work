export type ParsedErrorResponse = {
  httpStatus: number;
  code?: string;
  message: string;
  bodyText?: string;
};

function safeString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export async function parseErrorResponse(response: Response): Promise<ParsedErrorResponse> {
  const httpStatus = response.status;
  const contentType = response.headers.get("content-type") ?? "";

  let bodyText: string | undefined;
  try {
    bodyText = await response.text();
  } catch {
    return { httpStatus, message: `Request failed: ${httpStatus}` };
  }

  const trimmed = bodyText.trim();
  const looksLikeJson =
    contentType.includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (looksLikeJson) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        const code = safeString(obj.error) ?? safeString(obj.code);
        const message =
          safeString(obj.message) ??
          safeString(obj.error) ??
          `Request failed: ${httpStatus}`;
        return { httpStatus, code, message, bodyText };
      }
    } catch {
      // fall through
    }
  }

  return {
    httpStatus,
    message: trimmed ? trimmed.slice(0, 400) : `Request failed: ${httpStatus}`,
    bodyText,
  };
}

