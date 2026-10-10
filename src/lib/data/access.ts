import { supabase } from "@/lib/supabase";
import { throwOnError } from "./errors";

export type LibraryAccess = { role: "reader" | "admin"; revoked: boolean };

export function hasLibraryAccess(access: LibraryAccess | null, admin = false) {
  return Boolean(
    access &&
    access.revoked === false &&
    (access.role === "reader" || access.role === "admin") &&
    (!admin || access.role === "admin"),
  );
}

/** Must match migration 014: explicit suspension, never a trial expiry. */
export async function loadLibraryAccess(userId: string) {
  const result = await supabase()
    .from("beta_access")
    .select("role,revoked")
    .eq("user_id", userId)
    .maybeSingle();
  return throwOnError(
    result,
    "Não foi possível confirmar seu acesso.",
  ) as LibraryAccess | null;
}
