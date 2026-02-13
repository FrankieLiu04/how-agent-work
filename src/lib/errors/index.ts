export type ErrorCode =
  | "UNKNOWN"
  | "INVALID_INPUT"
  | "QUOTA_EXCEEDED"
  | "AUTH_REQUIRED"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "TOOL_EXECUTION_ERROR"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED";

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  status?: number;
  cause?: Error;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: Record<string, unknown>;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status ?? this.getDefaultStatus(options.code);
    this.details = options.details;
  }

  private getDefaultStatus(code: ErrorCode): number {
    switch (code) {
      case "INVALID_INPUT":
      case "VALIDATION_ERROR":
        return 400;
      case "AUTH_REQUIRED":
        return 401;
      case "NOT_FOUND":
        return 404;
      case "QUOTA_EXCEEDED":
      case "RATE_LIMITED":
        return 429;
      case "UPSTREAM_ERROR":
        return 502;
      default:
        return 500;
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
    };
  }
}

export class QuotaExceededError extends AppError {
  constructor(limit: number, remaining: number, resetAt: Date) {
    super({
      code: "QUOTA_EXCEEDED",
      message: "Quota exceeded",
      status: 429,
      details: { limit, remaining, resetAt: resetAt.toISOString() },
    });
    this.name = "QuotaExceededError";
  }
}

export class AuthRequiredError extends AppError {
  constructor(message: string = "Authentication required") {
    super({
      code: "AUTH_REQUIRED",
      message,
      status: 401,
    });
    this.name = "AuthRequiredError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: "VALIDATION_ERROR",
      message,
      status: 400,
      details,
    });
    this.name = "ValidationError";
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, status: number = 502) {
    super({
      code: "UPSTREAM_ERROR",
      message,
      status,
    });
    this.name = "UpstreamError";
  }
}

export class ToolExecutionError extends AppError {
  constructor(toolName: string, reason: string) {
    super({
      code: "TOOL_EXECUTION_ERROR",
      message: `Tool '${toolName}' failed: ${reason}`,
      status: 500,
      details: { toolName, reason },
    });
    this.name = "ToolExecutionError";
  }
}

export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function formatError(error: unknown): {
  message: string;
  code: ErrorCode;
  status: number;
} {
  if (isAppError(error)) {
    return {
      message: error.message,
      code: error.code,
      status: error.status,
    };
  }

  if (isError(error)) {
    return {
      message: error.message,
      code: "UNKNOWN",
      status: 500,
    };
  }

  return {
    message: String(error),
    code: "UNKNOWN",
    status: 500,
  };
}

export function parseErrorResponse(response: unknown): AppError {
  if (!response || typeof response !== "object") {
    return new AppError({ code: "UNKNOWN", message: "Unknown error" });
  }

  const r = response as Record<string, unknown>;
  const code = (r.error as ErrorCode) ?? "UNKNOWN";
  const message = typeof r.message === "string" ? r.message : "An error occurred";
  const status = typeof r.status === "number" ? r.status : 500;

  return new AppError({
    code,
    message,
    status,
    details: r.details as Record<string, unknown> | undefined,
  });
}
