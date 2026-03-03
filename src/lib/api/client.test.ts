import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";

describe("ApiClient sandbox routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses sandbox files delete endpoint with conversation scope", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient();
    await client.sandbox.deleteFile("/src/index.ts", "conv_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sandbox/files?path=%2Fsrc%2Findex.ts&conversationId=conv_1",
      expect.objectContaining({
        method: "DELETE",
      })
    );
  });
});

