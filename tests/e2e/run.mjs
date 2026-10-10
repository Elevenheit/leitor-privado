import { spawnSync } from "node:child_process";
import { isolatedEnvironment } from "./isolation.mjs";
const config = isolatedEnvironment();
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: config.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: config.key };
for (const args of [["node_modules/next/dist/bin/next", "build"], ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.config.mjs"]]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
