export type AppPreferences = { welcomeSound: boolean; reduceMotion: boolean };

export function normalizeAppPreferences(value: unknown): AppPreferences {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    welcomeSound: data.welcomeSound === true,
    reduceMotion: data.reduceMotion === true,
  };
}

/** Reuse the authenticated profile loads; this creates no additional query. */
export function publishAppPreferences(ownerId: string, value: unknown) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("nook-app-preferences", {
        detail: { ownerId, ...normalizeAppPreferences(value) },
      }),
    );
}

export function clearAppPreferences() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("nook-app-preferences-clear"));
}
