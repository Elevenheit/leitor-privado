// A temporary extension controls actual browser zoom, rather than CSS zoom or DPR emulation.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function checkNativeZoom(origin) {
  assert.equal(new URL(origin).hostname, "127.0.0.1");
  const directory = mkdtempSync(join(tmpdir(), "nook-zoom-"));
  const extension = join(directory, "extension");
  mkdirSync(extension);
  writeFileSync(
    join(extension, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Nook local zoom check",
      version: "1.0",
      permissions: ["tabs"],
      background: { service_worker: "background.js" },
    }),
  );
  writeFileSync(
    join(extension, "background.js"),
    "chrome.runtime.onInstalled.addListener(() => {});",
  );
  let context;
  try {
    context = await chromium.launchPersistentContext(
      join(directory, "profile"),
      {
        channel: "chromium",
        headless: true,
        viewport: null,
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
          "--window-size=640,960",
        ],
      },
    );
    await context.route("**/*", (route) => {
      assert.equal(
        new URL(route.request().url()).origin,
        origin,
        "Zoom check attempted a nonlocal request.",
      );
      return route.continue();
    });
    const page = context.pages()[0];
    await page.goto(`${origin}/?screen=catalog`);
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const zoom = await worker.evaluate(async (localOrigin) => {
      const tab = (await chrome.tabs.query({})).find((entry) =>
        entry.url?.startsWith(localOrigin),
      );
      await chrome.tabs.setZoom(tab.id, 2);
      return chrome.tabs.getZoom(tab.id);
    }, origin);
    assert.equal(zoom, 2);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(320);
    assert.equal(await page.evaluate(() => devicePixelRatio), 2);
    for (const screen of [
      "auth",
      "confirmation",
      "recovery",
      "catalog",
      "library",
      "search",
      "continue",
      "list",
      "category",
      "work",
      "profile",
      "admin",
      "manager",
      "admin-work",
      "about",
      "not-found",
      "page-error",
      "reader",
    ]) {
      await page.goto(`${origin}/?screen=${screen}`);
      await expect(page.locator("main")).toBeVisible();
      if (
        ["catalog", "library", "search", "category", "admin"].includes(screen)
      )
        await expect(page.locator(".series-card").first()).toBeVisible();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        320,
        `Native zoom overflow: ${screen}`,
      );
    }
    for (const theme of ["dark", "sepia", "light"]) {
      await page.goto(`${origin}/?screen=pdf-navigation&theme=${theme}`);
      await page
        .getByRole("button", { name: "Abrir navegação", exact: true })
        .click();
      const close = page.getByRole("button", {
        name: "Fechar navegação do PDF",
      });
      await expect(close).toBeVisible();
      const bounds = await close.boundingBox();
      const height = await page.evaluate(() => innerHeight);
      assert.ok(
        bounds.y >= 0 && bounds.y + bounds.height <= height,
        `Close control clipped in ${theme}`,
      );
      await page.getByLabel("Buscar no documento").fill("archive");
      await expect(page.locator(".pdf-result")).toHaveCount(200);
      const readSelection = page.getByRole("button", {
        name: "Ler trecho selecionado",
        exact: true,
      });
      await readSelection.scrollIntoViewIfNeeded();
      await expect(readSelection).toBeInViewport();
      await expect(close).toBeInViewport();
      // Finish finite sheet animations before capturing the actual browser surface.
      await page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity,
            )
            .map((animation) => animation.finished),
        );
      });
      const capture = await context.newCDPSession(page);
      const screenshot = await capture.send("Page.captureScreenshot", {
        fromSurface: true,
        captureBeyondViewport: false,
      });
      writeFileSync(
        `artifacts/browser/native-zoom-${theme}-320.png`,
        Buffer.from(screenshot.data, "base64"),
      );
      await capture.detach();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Abrir navegação", exact: true }),
      ).toBeFocused();
    }
    console.log(
      "PASS: native Chromium zoom 200%, 320 CSS px, 18 screens and PDF navigation in three themes; no remote traffic.",
    );
  } finally {
    await context?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
