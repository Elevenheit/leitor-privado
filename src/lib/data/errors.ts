
export type DataErrorKind =
  | "session"
  | "network"
  | "storage"
  | "authorization"
  | "partial"
  | "unknown";

export type ErrorOperation = "auth" | "supabase" | "storage" | "pdf" | "cbz";
export function reportDataError(error: unknown, operation: ErrorOperation) {
  if (process.env.NODE_ENV !== "development") return;
  console.warn("[nook]", { operation, kind: error instanceof DataError ? error.kind : "unknown" });
}

export class DataError extends Error {
  readonly kind: DataErrorKind;
  readonly cause?: unknown;
  constructor(
    message: string,
    kind: DataErrorKind,
    cause?: unknown,
  ) {
    super(message);
    this.name = "DataError";
    this.kind = kind;
    this.cause = cause;
  }
}

export function toDataError(cause: unknown, fallback: string, operation: ErrorOperation = "supabase"): DataError {
  reportDataError(cause, operation);
  if (cause instanceof DataError) return cause;
  const error = cause as {
    code?: string;
    status?: number;
    name?: string;
    message?: string;
  };
  const message = typeof error?.message === "string" ? error.message : fallback;
  const text = message.toLowerCase();
  if (error?.status === 401 || /jwt|session.*expir|refresh token/.test(text))
    return new DataError("Sua sessão expirou. Entre novamente.", "session", cause);
  if (error?.status === 403 || error?.code === "42501")
    return new DataError("Você não tem autorização para esta operação.", "authorization", cause);
  if (error?.name === "StorageError" || /storage|bucket|object not found/.test(text))
    return new DataError("Falha no armazenamento. Tente novamente.", "storage", cause);
  if (/failed to fetch|network|fetch failed|offline/.test(text))
    return new DataError("Falha de conexão. Confira a rede e tente novamente.", "network", cause);
  return new DataError(fallback, "unknown", cause);
}

export function throwOnError<T>(
  result: { data: T; error: { message: string; code?: string; details?: string; hint?: string; status?: number; name?: string } | null },
  fallback: string,
): T {
  if (result.error) throw toDataError(result.error, fallback);
  return result.data;
}
