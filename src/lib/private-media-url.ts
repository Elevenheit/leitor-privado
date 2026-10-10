import { supabase } from "@/lib/supabase";

export const PRIVATE_MEDIA_URL_TTL_SECONDS = 60 * 60;
export const PRIVATE_MEDIA_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type PrivateMediaUrl = { url: string; expiresAt: number };

export async function createPrivateMediaUrl(
  bucket: string,
  path: string,
  expiresIn = PRIVATE_MEDIA_URL_TTL_SECONDS,
): Promise<PrivateMediaUrl> {
  const { data, error } = await supabase()
    .storage.from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl)
    throw new Error("O acesso a esta mÃ­dia expirou ou foi revogado.");
  return { url: data.signedUrl, expiresAt: Date.now() + expiresIn * 1000 };
}

export function isPrivateMediaAuthorizationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  const status = Number(value.status ?? value.statusCode);
  if (status === 401 || status === 403) return true;
  return typeof value.message === "string" &&
    /\b401\b|\b403\b|unauthorized|forbidden|expired(token| url)?|invalid signature/i.test(value.message);
}
