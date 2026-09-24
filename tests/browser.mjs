import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { zipSync } from "fflate";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
mkdirSync("docs/screenshots", { recursive: true });
mkdirSync("tests/fixtures", { recursive: true });
const bundle = await build({
  entryPoints: ["src/lib/cbz.worker.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
});
const server = createServer((req, res) => {
  if (req.url === "/long.webm") {
    const data = readFileSync("tests/fixtures/nook-long.webm");
    res.setHeader("Content-Type", "video/webm");
    res.setHeader("Accept-Ranges", "bytes");
    const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
    if (match) {
      const start = Number(match[1]);
      const end = match[2]
        ? Math.min(Number(match[2]), data.length - 1)
        : data.length - 1;
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${data.length}`);
      res.setHeader("Content-Length", end - start + 1);
      res.end(data.subarray(start, end + 1));
    } else {
      res.setHeader("Content-Length", data.length);
      res.end(data);
    }
    return;
  }
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
  writeFileSync("tests/fixtures/nook-original.cbz", archive);
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
  // Real original canvas video; no external distribution rights needed.
  const videoData = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 360;
    const x = c.getContext("2d");
    const stream = c.captureStream(15);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8",
    });
    const parts = [];
    recorder.ondataavailable = (e) => parts.push(e.data);
    const done = new Promise((resolve) => {
      recorder.onstop = async () => {
        const data = new Uint8Array(
          await new Blob(parts, { type: "video/webm" }).arrayBuffer(),
        );
        let binary = "";
        for (const n of data) binary += String.fromCharCode(n);
        resolve(btoa(binary));
        stream.getTracks().forEach((t) => t.stop());
      };
    });
    recorder.start();
    let frame = 0;
    const interval = setInterval(() => {
      x.fillStyle = "#201b19";
      x.fillRect(0, 0, 640, 360);
      x.fillStyle = "#d1aa78";
      x.font = "36px serif";
      x.fillText("nook. mídia original", 70, 160);
      x.fillText(`Quadro ${frame++}`, 70, 220);
    }, 66);
    await new Promise((r) => setTimeout(r, 2200));
    clearInterval(interval);
    recorder.stop();
    return done;
  });
  writeFileSync(
    "tests/fixtures/nook-original.webm",
    Buffer.from(videoData, "base64"),
  );
  const playback = await page.evaluate(async (base64) => {
    const v = document.createElement("video");
    v.controls = true;
    v.muted = true;
    v.src = URL.createObjectURL(
      new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], {
        type: "video/webm",
      }),
    );
    document.body.append(v);
    await v.play();
    await new Promise((r) => setTimeout(r, 500));
    v.pause();
    const played = v.currentTime;
    v.currentTime = 0.1;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
    return { played, seek: v.currentTime, width: v.videoWidth };
  }, videoData);
  assert.ok(playback.played > 0);
  assert.equal(playback.seek, 0.1);
  assert.equal(playback.width, 640);
  const seeks = await page.evaluate(async () => {
    const video = document.createElement("video");
    video.muted = true;
    video.src = "/long.webm";
    document.body.append(video);
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    const duration = video.duration;
    const values = [];
    for (const target of [90, 110]) {
      const done = new Promise((resolve) =>
        video.addEventListener("seeked", resolve, { once: true }),
      );
      video.currentTime = Math.min(target, duration);
      await done;
      values.push(video.currentTime);
    }
    return { duration, values };
  });
  assert.ok(seeks.duration >= 119);
  assert.deepEqual(seeks.values, [90, 110]);
  await page.goto("http://localhost:3100");
  await page
    .getByRole("button", { name: "Criar conta", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/access-desktop.png",
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
    path: "docs/screenshots/signup-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  console.log(
    "PASS: real CBZ worker ordering/decode/corruption; original WebM decode/play/pause/seek, real long-video seeks at 90/110s; actual login/signup UI desktop/mobile screenshots. Authenticated end-to-end tests still require test Supabase.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
