import { describe, expect, it } from "vitest";
import { parseErrorResponse } from "./parseErrorResponse";

describe("parseErrorResponse", () => {
  it("parses JSON error with code and message", async () => {
    const response = new Response(JSON.stringify({ error: "file_too_large", message: "Too big" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

    const parsed = await parseErrorResponse(response);
    expect(parsed.httpStatus).toBe(400);
    expect(parsed.code).toBe("file_too_large");
    expect(parsed.message).toBe("Too big");
  });

  it("falls back to text when body is not JSON", async () => {
    const response = new Response("<html>Server Error</html>", {
      status: 500,
      headers: { "content-type": "text/html" },
    });

    const parsed = await parseErrorResponse(response);
    expect(parsed.httpStatus).toBe(500);
    expect(parsed.message).toContain("Server Error");
  });

  it("returns generic message on empty body", async () => {
    const response = new Response("", { status: 401 });
    const parsed = await parseErrorResponse(response);
    expect(parsed.httpStatus).toBe(401);
    expect(parsed.message).toContain("401");
  });
});

