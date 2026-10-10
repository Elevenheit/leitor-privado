import { defineConfig } from "@playwright/test";
import { isolatedEnvironment } from "./tests/e2e/isolation.mjs";
const isolated = isolatedEnvironment();
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== isolated.url) throw Error("Run npm run test:e2e to rebuild against the isolated project.");
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "*.spec.mjs", workers: 1, retries: 0, timeout: 90000,
  use: { baseURL: "http://127.0.0.1:3100", viewport: { width: 1440, height: 1000 }, trace: "off", screenshot: "off", video: "off" },
  webServer: { command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 60000 },
});
