import { beforeEach, describe, expect, it, vi } from "vitest";
import { SANDBOX_LIMITS } from "~/lib/config";

let mockedShellFiles: Array<{ path: string; content: string; isDir: boolean; size: number }> = [];
let mockedShellResult = { stdout: "", stderr: "", exitCode: 0 as number, cwdChanged: undefined as string | undefined };

vi.mock("~/lib/sandbox/mockShell", () => {
  return {
    MockShell: class {
      execute() {
        return mockedShellResult;
      }
      getFiles() {
        return mockedShellFiles;
      }
    },
  };
});

vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    conversation: {
      findFirst: vi.fn(),
    },
    virtualFile: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { POST } from "./route";

type MockedDb = typeof db & {
  conversation: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  virtualFile: {
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

describe("sandbox exec route", () => {
  const authMock = vi.mocked(auth);
  const dbMock = db as MockedDb;

  beforeEach(() => {
    vi.resetAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
    dbMock.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
    dbMock.virtualFile.findMany.mockResolvedValue([]);
    mockedShellFiles = [{ path: "/", content: "", isDir: true, size: 0 }];
    mockedShellResult = { stdout: "", stderr: "", exitCode: 0, cwdChanged: undefined };
  });

  it("enforces sandbox size limits when syncing shell changes", async () => {
    mockedShellFiles = [
      { path: "/", content: "", isDir: true, size: 0 },
      {
        path: "/huge.txt",
        content: "x",
        isDir: false,
        size: SANDBOX_LIMITS.MAX_FILE_SIZE_BYTES + 1,
      },
    ];

    const res = await POST(
      new Request("http://localhost/api/sandbox/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: "conv_1", command: "touch /huge.txt", cwd: "/" }),
      })
    );
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBe("file_too_large");
    expect(dbMock.virtualFile.upsert).not.toHaveBeenCalled();
  });

  it("syncs shell files into conversation-scoped storage paths", async () => {
    mockedShellFiles = [
      { path: "/", content: "", isDir: true, size: 0 },
      { path: "/src/main.ts", content: "export {};", isDir: false, size: 10 },
    ];

    const res = await POST(
      new Request("http://localhost/api/sandbox/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: "conv_1", command: "touch /src/main.ts", cwd: "/" }),
      })
    );
    const json = (await res.json()) as { files?: Array<{ path: string }> };

    expect(res.status).toBe(200);
    expect(dbMock.virtualFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_path: {
            userId: "user_1",
            path: "/__scopes/conv_1/src/main.ts",
          },
        },
      })
    );
    expect(json.files?.[0]?.path).toBe("/src/main.ts");
  });
});

