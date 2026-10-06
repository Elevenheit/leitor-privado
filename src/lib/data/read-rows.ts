import { throwOnError } from "./errors";

type Result<T> = {
  data: T[] | null;
  error: { message: string; code?: string } | null;
};

// Existing PostgREST tables remain the source; respect RLS and response limits.
export async function readRows<T>(
  query: () => { range(from: number, to: number): PromiseLike<Result<T>> },
  message: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const page =
      throwOnError(await query().range(offset, offset + 499), message) || [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
