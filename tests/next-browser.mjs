// Builds the real Next app with a localhost-only MOCK endpoint. No Supabase exists here.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import assert from "node:assert/strict";

const port = await new Promise((resolve, reject) => {
  const socket = createServer();
  socket.on("error", reject);
  socket.listen(0, "127.0.0.1", () => {
    const port = socket.address().port;
    socket.close(() => resolve(port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NOOK_UI_BUILD: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-ui-mock-no-credentials",
  NOOK_UI_ORIGIN: origin,
};
function command(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error(`Local Next validation failed (${code}).`)),
    );
  });
}
await command(["node_modules/next/dist/bin/next", "build"]);
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { env, stdio: "inherit" },
);
try {
  let started = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw Error("Local Next server exited.");
    try {
      started = (await fetch(origin)).ok;
    } catch {
      /* Wait for loopback server. */
    }
    if (started) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(started, "Local Next did not start.");
  await command(["tests/navigation-history.mjs"]);
} finally {
  server.kill();
}
