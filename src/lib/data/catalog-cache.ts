// Short-lived, account-scoped snapshot: no full catalog download on each keystroke.
// Keep one account and never persist private catalog metadata to browser storage.
let cached: { owner: string; expires: number; value: Promise<unknown> } | null =
  null;
export function catalogSnapshot<T>(
  owner: string,
  load: () => Promise<T>,
): Promise<T> {
  if (cached?.owner === owner && cached.expires > Date.now())
    return cached.value as Promise<T>;
  const entry = { owner, expires: Date.now() + 15_000, value: load() };
  cached = entry;
  entry.value.catch(() => {
    if (cached === entry) cached = null;
  });
  return entry.value;
}
export function invalidateCatalogSnapshot() {
  cached = null;
}
