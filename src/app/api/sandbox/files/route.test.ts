import { beforeEach, describe, expect, it, vi } from "vitest";

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
      findUnique: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { GET, POST } from "./route";

type MockedDb = typeof db & {
  conversation: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  virtualFile: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

describe("sandbox files route", () => {
  const authMock = vi.mocked(auth);
  const dbMock = db as MockedDb;

  beforeEach(() => {
    vi.resetAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
    dbMock.conversation.findFirst.mockResolvedValue({ id: "conv_1" });
  });

  it("scopes GET files by conversation and maps stored paths", async () => {
    const now = new Date("2026-03-03T00:00:00.000Z");
    dbMock.virtualFile.findMany.mockResolvedValue([
      {
        id: "dir_1",
        path: "/__scopes/conv_1/src",
        isDir: true,
        size: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "file_1",
        path: "/__scopes/conv_1/src/index.ts",
        isDir: false,
        size: 42,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/sandbox/files?conversationId=conv_1")
    );
    const json = (await res.json()) as {
      files: Array<{ path: string; isDir: boolean }>;
      limits: { currentFileCount: number };
    };

    expect(res.status).toBe(200);
    expect(dbMock.virtualFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user_1",
          path: { startsWith: "/__scopes/conv_1/" },
        }),
      })
    );
    expect(json.files.map((f) => f.path)).toEqual(["/src", "/src/index.ts"]);
    expect(json.limits.currentFileCount).toBe(1);
  });

  it("stores scoped path on POST and returns user path", async () => {
    const now = new Date("2026-03-03T00:00:00.000Z");
    dbMock.virtualFile.findUnique.mockResolvedValue(null);
    dbMock.virtualFile.count.mockResolvedValue(0);
    dbMock.virtualFile.aggregate.mockResolvedValue({ _sum: { size: 0 } });
    dbMock.virtualFile.create.mockResolvedValue({
      id: "file_2",
      path: "/__scopes/conv_1/src/app.ts",
      size: 12,
      isDir: false,
      createdAt: now,
      updatedAt: now,
    });

    const res = await POST(
      new Request("http://localhost/api/sandbox/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv_1",
          path: "/src/app.ts",
          content: "console.log(1)",
          isDir: false,
        }),
      })
    );
    const json = (await res.json()) as { path: string };

    expect(res.status).toBe(201);
    expect(dbMock.virtualFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          path: "/__scopes/conv_1/src/app.ts",
        }),
      })
    );
    expect(json.path).toBe("/src/app.ts");
  });

  it("does not apply file-count limit when creating directories", async () => {
    const now = new Date("2026-03-03T00:00:00.000Z");
    dbMock.virtualFile.findUnique.mockResolvedValue(null);
    dbMock.virtualFile.count.mockResolvedValue(200);
    dbMock.virtualFile.aggregate.mockResolvedValue({ _sum: { size: 0 } });
    dbMock.virtualFile.create.mockResolvedValue({
      id: "dir_2",
      path: "/__scopes/conv_1/src",
      size: 0,
      isDir: true,
      createdAt: now,
      updatedAt: now,
    });

    const res = await POST(
      new Request("http://localhost/api/sandbox/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv_1",
          path: "/src",
          content: "",
          isDir: true,
        }),
      })
    );

    expect(res.status).toBe(201);
  });
});

