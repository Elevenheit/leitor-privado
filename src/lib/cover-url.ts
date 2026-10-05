import { createPrivateMediaUrl } from "@/lib/private-media-url";

const cache = new Map<string, { url: string; expiresAt: number }>();
const pending = new Map<string, Promise<string>>();

export function getPrivateCoverUrl(userId: string, path: string) {
  const key = `${userId}:${path}`;
  const saved = cache.get(key);
  if (saved && saved.expiresAt > Date.now() + 60_000) return Promise.resolve(saved.url);
  const ongoing = pending.get(key);
  if (ongoing) return ongoing;
  const request = createPrivateMediaUrl("covers", path)
    .then(result => {
      cache.set(key, result);
      return result.url;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function invalidatePrivateCoverUrl(userId: string, path: string) {
  cache.delete(`${userId}:${path}`);
}
