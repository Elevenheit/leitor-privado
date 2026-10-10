export function isolatedEnvironment(env = process.env) {
  const keys = ["NOOK_TEST_URL", "NOOK_TEST_ANON_KEY", "NOOK_TEST_SERVICE_KEY", "NOOK_TEST_PROJECT_REF", "NOOK_PRODUCTION_PROJECT_REF"];
  if (keys.some(key => !env[key]) || env.NOOK_ALLOW_TEST_WRITES !== "isolated-beta-only") throw Error("Isolated E2E configuration missing. No request performed; see docs/E2E.md.");
  const url = new URL(env.NOOK_TEST_URL);
  if (url.protocol !== "https:" || url.hostname !== `${env.NOOK_TEST_PROJECT_REF}.supabase.co` || env.NOOK_TEST_PROJECT_REF === env.NOOK_PRODUCTION_PROJECT_REF) throw Error("Unsafe test project configuration. No request performed.");
  return { url: url.origin, host: url.hostname, key: env.NOOK_TEST_ANON_KEY, serviceKey: env.NOOK_TEST_SERVICE_KEY };
}
