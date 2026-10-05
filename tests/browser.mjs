import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { zipSync } from "fflate";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
mkdirSync("artifacts/browser", { recursive: true });
mkdirSync("tests/fixtures", { recursive: true });
const bundle = await build({
  entryPoints: ["src/lib/cbz.worker.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
});
const server = createServer((req, res) => {
  res.setHeader(
    "Content-Type",
    req.url === "/worker.js" ? "application/javascript" : "text/html",
  );
  res.end(
    req.url === "/worker.js"
      ? bundle.outputFiles[0].text
      : "<!doctype html><title>Nook authorized media validation</title>",
  );
});
await new Promise((r) => server.listen(3199, "127.0.0.1", r));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3199");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 720;
    const c = canvas.getContext("2d");
    c.fillStyle = "#211c1b";
    c.fillRect(0, 0, 480, 720);
    c.fillStyle = "#d1aa78";
    c.font = "42px serif";
    c.fillText("nook. teste original", 45, 320);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const bytes = Buffer.from(png, "base64");
  const archive = zipSync({ "10.png": bytes, "2.png": bytes, "1.png": bytes });
  writeFileSync("artifacts/browser/nook-original.cbz", archive);
  const result = await page.evaluate(async (bytes) => {
    const w = new Worker("/worker.js");
    const received = [];
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("worker timeout")), 10000);
      w.onmessage = async (e) => {
        if (e.data.error) {
          reject(Error(e.data.error));
          return;
        }
        if (e.data.names) {
          received.push(e.data.names);
          w.postMessage({ index: 1 });
        } else {
          const image = await createImageBitmap(
            new Blob([e.data.data], { type: "image/png" }),
          );
          clearTimeout(timer);
          w.terminate();
          resolve({
            names: received[0],
            index: e.data.index,
            width: image.width,
            height: image.height,
          });
          image.close();
        }
      };
      w.postMessage({ archive: new Uint8Array(bytes).buffer });
    });
  }, Array.from(archive));
  assert.deepEqual(result, {
    names: ["1.png", "2.png", "10.png"],
    index: 1,
    width: 480,
    height: 720,
  });
  const invalid = await page.evaluate(async () => {
    const w = new Worker("/worker.js");
    return await new Promise((resolve) => {
      w.onmessage = (e) => {
        w.terminate();
        resolve(Boolean(e.data.error));
      };
      w.postMessage({ archive: new Uint8Array([1, 2, 3, 4]).buffer });
    });
  });
  assert.equal(invalid, true);
  const rapid = await page.evaluate(async (bytes) => {
    const worker = new Worker("/worker.js");
    return new Promise((resolve, reject) => {
      const indices = [];
      const timer = setTimeout(() => { worker.terminate(); reject(Error("rapid worker timeout")); }, 10000);
      worker.onmessage = ({ data }) => {
        if (data.error) { clearTimeout(timer); worker.terminate(); reject(Error("worker failed")); return; }
        if (data.names) { for (const index of [2, 0, 1, 2]) worker.postMessage({ index }); }
        else { indices.push(data.index); if (indices.length === 4) { clearTimeout(timer); worker.terminate(); resolve(indices); } }
      };
      worker.postMessage({ archive: new Uint8Array(bytes).buffer });
    });
  }, Array.from(archive));
  assert.deepEqual(rapid, [2,0,1,2]);

  const response = await page.goto("http://localhost:3100");
  assert.equal(response.headers()["x-content-type-options"], "nosniff");
  assert.equal(response.headers()["x-frame-options"], "DENY");
  assert.ok(response.headers()["content-security-policy-report-only"]);

  await page
    .getByRole("button", { name: "Criar conta", exact: true })
    .waitFor();
  await page.evaluate(() => {
    const trigger = document.createElement("button");
    trigger.id = "focus-test-origin";
    trigger.textContent = "Open focus fixture";
    document.body.append(trigger);
    trigger.focus();
    const modal = document.createElement("section");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Local focus fixture");
    modal.innerHTML = '<button aria-label="Fechar fixture" id="focus-close">Close</button><input autofocus id="focus-input">';
    modal.querySelector("button").onclick = () => modal.remove();
    document.body.append(modal);
    modal.querySelector("input").focus();
  });
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.id), "focus-close");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.activeElement.id), "focus-test-origin");
  await page.evaluate(() => document.getElementById("focus-test-origin").remove());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "artifacts/browser/access-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page
    .getByRole("button", { name: "Criar conta", exact: true })
    .last()
    .waitFor();
  assert.equal(
    await page.locator("input[type=password]").getAttribute("minlength"),
    "10",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/browser/signup-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  console.log(
    "PASS: real CBZ worker ordering/decode/corruption/rapid requests; headers and dialog focus; actual login/signup UI desktop/mobile screenshots. Authenticated end-to-end tests still require test Supabase.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
