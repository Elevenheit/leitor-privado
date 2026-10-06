import { supabase } from "@/lib/supabase";
import {
  normalizeReaderPreferences,
  type ReaderPreferences,
} from "@/lib/reader-preferences";
import { throwOnError } from "./errors";

const queues = new Map<string, Promise<ReaderPreferences>>();
type IdentityPatch = Partial<
  Record<"nickname" | "display_name" | "bio" | "avatar", string>
>;

/** Preserve existing settings using the profile table and serialize this client's edits. */
export async function patchProfileSettings(
  ownerId: string,
  settings: Partial<ReaderPreferences>,
  identity: IdentityPatch = {},
) {
  const snapshot = { ...settings };
  const current = (queues.get(ownerId) || Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const api = supabase();
      const current = throwOnError(
        await api
          .from("profiles")
          .select("preferences")
          .eq("id", ownerId)
          .single(),
        "Não foi possível carregar suas preferências.",
      );
      if (!current) throw new Error("Perfil indisponível.");
      const result = await api
        .from("profiles")
        .update({
          ...identity,
          preferences: { ...current.preferences, ...snapshot },
        })
        .eq("id", ownerId)
        .select("preferences")
        .single();
      const saved = throwOnError(
        result,
        "Não foi possível salvar suas preferências. Tente novamente.",
      );
      if (!saved) throw new Error("O salvamento do perfil não foi confirmado.");
      return normalizeReaderPreferences(saved.preferences);
    });
  queues.set(ownerId, current);
  try {
    return await current;
  } finally {
    if (queues.get(ownerId) === current) queues.delete(ownerId);
  }
}
