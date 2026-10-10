// Run real UI components with a test-only Supabase module and local media.
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { tallImage } from "./ui/tall-image.mjs";
import { securityHeaders } from "../src/lib/security-headers.ts";
import { checkNativeZoom } from "./native-zoom.mjs";

const bundle = await build({
  entryPoints: ["tests/ui/fixture.jsx"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  alias: {
    "@/lib/supabase": resolve("tests/ui/supabase.mjs"),
    "next/link": resolve("tests/ui/next-link.jsx"),
    "next/navigation": resolve("tests/ui/next-navigation.mjs"),
  },
});
const worker = await build({
  entryPoints: ["src/lib/cbz.worker.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
});
const css = await postcss([tailwindcss()]).process(
  readFileSync("src/app/globals.css", "utf8"),
  { from: resolve("src/app/globals.css") },
);
const png = readFileSync("tests/fixtures/nook-frame.png");
const archive = zipSync({ "1.png": png, "2.png": png, "3.png": png });
const tall = tallImage();
const longArchive = zipSync(
  Object.fromEntries(
    Array.from({ length: 150 }, (_, i) => [`${i + 1}.png`, tall]),
  ),
);
const server = createServer((req, res) => {
  for (const { key, value } of securityHeaders(undefined, true))
    res.setHeader(key, value);
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  const assets = {
    "/fixture.js": ["application/javascript", bundle.outputFiles[0].text],
    "/styles.css": ["text/css", css.css],
    "/lib/cbz.worker.ts": [
      "application/javascript",
      worker.outputFiles[0].text,
    ],
    "/cover.png": ["image/png", png],
    "/chapter.cbz": [
      "application/zip",
      req.url.includes("long=1") ? longArchive : archive,
    ],
  };
  if (path === "/missing.png") {
    res.writeHead(404);
    res.end();
    return;
  }
  const asset = assets[path];
  res.setHeader("Content-Type", asset?.[0] || "text/html; charset=utf-8");
  res.end(
    asset?.[1] ||
      '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nook — local UI validation</title><link rel="stylesheet" href="/styles.css"><style>:root{--font-ui-loaded:Arial;--font-literary-loaded:Georgia}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
mkdirSync("artifacts/browser", { recursive: true });
let browser;
try {
  // Retain the existing worker, HTTP-header, login and dialog-focus checks.
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["tests/browser.mjs"], {
      stdio: "inherit",
      env: { ...process.env, NOOK_BROWSER_BASE_URL: base },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error(`Existing browser checks failed (${code}).`)),
    );
  });
  browser = await chromium.launch();
  const context = await browser.newContext();
  const blocked = [];
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("Failed to load resource")
    )
      errors.push(message.text());
  });
  const visit = async (screen, extra = "") => {
    if (screen === "cbz")
      await page
        .evaluate(() => {
          for (const key of Object.keys(localStorage))
            if (key.startsWith("nook-progress:")) localStorage.removeItem(key);
        })
        .catch(() => {});
    await page.goto(`${base}/?screen=${screen}${extra}`);
    await expect(page.locator("main")).toBeVisible();
  };
  await page.goto(`${base}/?screen=auth&state=auth-race`);
  await expect
    .poll(() => page.evaluate(() => typeof window.__nookTest.resolveUser))
    .toBe("function");
  await page.evaluate(() => {
    window.__nookTest.emitAuth("SIGNED_OUT", null);
    window.__nookTest.resolveUser();
  });
  await expect(page.locator(".auth-card")).toBeVisible();
  await visit("auth");
  await page
    .getByRole("button", { name: "Criar conta", exact: true })
    .first()
    .click();
  await page.getByLabel("E-mail", { exact: true }).fill("novo@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fictional-pass-123");
  await page
    .locator("form")
    .getByRole("button", { name: "Criar conta", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Confira seu e-mail");
  assert.ok(
    (
      await page.evaluate(() =>
        window.__nookTest.calls.find((c) => c.auth === "signup"),
      )
    ).credentials.options.emailRedirectTo.endsWith("/auth/confirm"),
  );
  await page
    .getByRole("button", { name: "Esqueci minha senha", exact: true })
    .click();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Enviar link de recuperação", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Se houver uma conta");
  assert.ok(
    (
      await page.evaluate(() =>
        window.__nookTest.calls.find((c) => c.auth === "recover"),
      )
    ).options.redirectTo.endsWith("/auth/recovery"),
  );
  await visit("recovery");
  await page
    .getByLabel("Nova senha", { exact: true })
    .fill("new-fictional-pass");
  await page
    .getByLabel("Confirmar nova senha", { exact: true })
    .fill("different-fictional-pass");
  await page
    .getByRole("button", { name: "Salvar nova senha", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("iguais");
  await page
    .getByLabel("Confirmar nova senha", { exact: true })
    .fill("new-fictional-pass");
  await page
    .getByRole("button", { name: "Salvar nova senha", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Senha atualizada");
  await visit("recovery", "&error=access_denied");
  await expect(page.getByRole("alert")).toContainText("inválido ou expirou");
  await visit("confirmation");
  await expect(page.getByRole("status")).toContainText("E-mail confirmado");
  // Large-document searches stay bounded; closing discards an in-flight extraction.
  await visit("pdf-navigation", "&state=slow");
  assert.deepEqual(
    await page.evaluate(() => window.__nookTest.pdfNavigation.pages),
    [],
  );
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByLabel("Buscar no documento").fill("archive");
  await expect
    .poll(() =>
      page.evaluate(() => typeof window.__nookTest.pdfNavigation.release),
    )
    .toBe("function");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__nookTest.pdfNavigation.release());
  await page.waitForTimeout(400);
  assert.deepEqual(
    await page.evaluate(() => window.__nookTest.pdfNavigation.pages),
    [1],
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await visit("pdf-navigation");
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await expect(page.getByText(/não possui sumário interno/)).toBeVisible();
  await page.getByLabel("Buscar no documento").fill("archive");
  await expect(page.getByRole("status")).toHaveText("Até 200 resultados");
  assert.deepEqual(
    await page.evaluate(() => window.__nookTest.pdfNavigation.pages),
    [1],
  );
  await page.getByRole("button", { name: "Ler trecho selecionado" }).click();
  assert.equal(
    (await page.evaluate(() => window.__nookTest.pdfNavigation.jumps))[0].page,
    1,
  );
  await visit("pdf-navigation", "&state=scan");
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByLabel("Buscar no documento").fill("archive");
  await expect(page.getByText(/não tem texto pesquisável/)).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("0 resultados");
  for (const theme of ["dark", "sepia", "light"]) {
    await visit("pdf-navigation", `&theme=${theme}`);
    await page.getByRole("button", { name: "Abrir navegação" }).click();
    await expect(page.getByText(/não possui sumário interno/)).toBeVisible();
    const ratios = await page.getByRole("dialog").evaluate((dialog) => {
      const luminance = (color) => {
        const channels = color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((c) => {
            c /= 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
        return (
          channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        );
      };
      const background = getComputedStyle(dialog).backgroundColor;
      return [
        ...dialog.querySelectorAll(
          "h2, .secondary-button, header button, input",
        ),
      ].map((node) => {
        const style = getComputedStyle(node);
        const foreground = luminance(style.color);
        const surface = luminance(
          style.backgroundColor === "rgba(0, 0, 0, 0)"
            ? background
            : style.backgroundColor,
        );
        return (
          (Math.max(foreground, surface) + 0.05) /
          (Math.min(foreground, surface) + 0.05)
        );
      });
    });
    assert.ok(
      ratios.every((ratio) => ratio >= 4.5),
      `${theme}: ${ratios}`,
    );
  }
  // Refreshing the conversation while its first request is slow keeps the newer response.
  await visit("comments", "&state=comment-race");
  await expect
    .poll(() =>
      page.evaluate(() => typeof window.__nookTest.releaseCommentRead),
    )
    .toBe("function");
  await page
    .getByRole("button", { name: "Atualizar conversa", exact: true })
    .click();
  await expect(
    page.getByText("Conversa carregada 2", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.__nookTest.releaseCommentRead());
  await page.waitForTimeout(150);
  await expect(
    page.getByText("Conversa carregada 2", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Conversa carregada 1", { exact: true }),
  ).toHaveCount(0);
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [1440, 900],
    [768, 900],
    [900, 900],
    [1024, 768],
    [430, 932],
    [844, 390],
    [390, 844],
    [360, 800],
    [320, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const screen of [
      "auth",
      "confirmation",
      "recovery",
      "catalog",
      "library",
      "search",
      "continue",
      "about",
      "not-found",
      "page-error",
      "category",
      "list",
      "work",
      "profile",
      "admin",
      "manager",
      "admin-work",
      "reader",
      "cbz",
    ]) {
      await visit(screen);
      if (["catalog", "category"].includes(screen))
        await expect(page.locator(".series-card").first()).toBeVisible();
      if (screen === "profile")
        await expect(
          page.getByRole("textbox", { name: "Nickname", exact: true }),
        ).toHaveValue("leitor_nook");
      if (screen === "admin")
        await expect(page.locator(".series-card").first()).toBeVisible();
      if (screen === "manager")
        await expect(page.locator(".manager-row")).toHaveCount(4);
      if (screen === "admin-work")
        await expect(page.locator(".chapter-row")).toHaveCount(4);
      if (screen === "cbz")
        await expect(
          page.getByRole("img", { name: "Página 1", exact: true }),
        ).toBeVisible();
      if (screen === "about") {
        await expect(
          page
            .locator(".welcome")
            .getByRole("link", { name: "Light Novels", exact: true }),
        ).toHaveAttribute("href", "/category/novel");
      }
      if (screen === "not-found") {
        await expect(
          page.getByRole("link", { name: "Ir para o início", exact: true }),
        ).toHaveAttribute("href", "/");
      }
      if (screen === "page-error") {
        await page
          .getByRole("button", { name: "Tentar novamente", exact: true })
          .click();
        assert.equal(
          await page.evaluate(() => window.__nookTest.resetClicks),
          1,
        );
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${screen}: horizontal overflow at ${width}px`,
      );
      const smallTargets = await page
        .locator(
          ".primary-button, .secondary-button, .favorite-button, .choice-row button, .reader-settings-button, .reader-quick-nav button, .mode-toggle button",
        )
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getClientRects().length && !node.disabled)
            .map((node) => {
              const rect = node.getBoundingClientRect();
              return {
                label:
                  node.getAttribute("aria-label") || node.textContent.trim(),
                width: rect.width,
                height: rect.height,
              };
            })
            .filter((target) => target.width < 43.5 || target.height < 43.5),
        );
      assert.deepEqual(
        smallTargets,
        [],
        `${screen}: controls smaller than 44px at ${width}px`,
      );
      if ([1440, 390].includes(width))
        await page.screenshot({
          path: `artifacts/browser/${screen}-${width}.png`,
          fullPage: !["admin", "cbz", "catalog", "category"].includes(screen),
        });
      if (screen === "catalog") {
        const covers = page.locator(".series-cover");
        if (width <= 620)
          assert.ok(
            await page
              .locator(".recent-grid")
              .evaluate(
                (el) =>
                  el.firstElementChild.getBoundingClientRect().width >=
                  el.clientWidth * 0.8,
              ),
            "Mobile history cards must remain readable, with horizontal scrolling.",
          );
        await expect(
          covers.nth(0).locator(".cover-fallback-title"),
        ).toBeVisible();
        await expect(
          covers.nth(1).locator(".cover-fallback-title"),
        ).toBeVisible();
        const brokenCover = page.locator(
          '.series-cover[href="/series/work-2"]',
        );
        await brokenCover.scrollIntoViewIfNeeded();
        await expect(
          brokenCover.locator(".cover-fallback-title"),
        ).toBeVisible();
        const validCover = page.locator('.series-cover[href="/series/work-3"]');
        await validCover.scrollIntoViewIfNeeded();
        await expect(validCover.locator("img")).toBeVisible();
        await expect(covers.nth(0)).toHaveAccessibleName(
          "Abrir A biblioteca das estrelas esquecidas",
        );
        await covers.first().focus();
        assert.equal(
          await covers
            .first()
            .evaluate((el) => getComputedStyle(el).outlineStyle),
          "solid",
        );
        assert.ok(
          await covers
            .first()
            .locator("strong")
            .evaluate((el) => {
              const text = el.getBoundingClientRect();
              const card = el.parentElement.getBoundingClientRect();
              return text.width <= card.width && text.height <= card.height;
            }),
        );
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await visit("catalog");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Pular para o conteúdo" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(
    page.locator(".history-featured .history-cover img"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await expect(
    page.getByRole("dialog", { name: "Menu do Nook" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Abrir navegação" }),
  ).toBeFocused();
  // Category, pending state and chapter search combine without navigation.
  await page.getByRole("button", { name: "Mangá", exact: true }).click();
  await expect(page.locator(".series-card")).toHaveCount(9);
  await page.getByRole("button", { name: "Em andamento", exact: true }).click();
  await expect(page.locator(".series-card")).toHaveCount(1);
  await page.getByLabel("Busca global de obras").fill("capítulo 2");
  await expect(page.locator(".series-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(page.locator(".series-card")).toHaveCount(24);
  // Completion updates the mounted home immediately, without deleting history.
  await page.evaluate(() => {
    window.__nookTest.history[0].completed = true;
    window.dispatchEvent(new Event("nook-progress-changed"));
  });
  await expect(page.locator('.history-card[href="/read/book-0"]')).toHaveCount(
    0,
  );
  assert.equal(await page.evaluate(() => window.__nookTest.history.length), 4);
  await page.evaluate(() => {
    window.__nookTest.history[0].completed = false;
    window.dispatchEvent(new Event("nook-progress-changed"));
  });
  await expect(
    page.locator('.history-card[href="/read/book-0"]'),
  ).toBeVisible();
  await page.getByLabel("Busca global de obras").fill("nada-encontrado");
  await expect(page.getByText("Nenhuma obra encontrada.")).toBeVisible();
  await page
    .getByRole("button", { name: "Limpar busca", exact: true })
    .last()
    .click();
  await expect(page.locator(".series-card").first()).toBeVisible();
  const favorite = page.getByRole("button", {
    name: "Guardar A biblioteca das estrelas esquecidas",
    exact: true,
  });
  await favorite.click();
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  await favorite.click();
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(page.getByText("Página 2", { exact: true })).toBeVisible();
  await expect(page.locator(".series-card")).toHaveCount(2);
  // Context survives a route visit, including page and scroll, without storing books.
  await page.evaluate(() => scrollTo(0, 300));
  const savedScroll = await page.evaluate(() => scrollY);
  await visit("work");
  await visit("catalog");
  await expect(page.getByText("Página 2", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(savedScroll);
  await page.getByLabel("Situação da leitura").selectOption("reading");
  await expect(page.locator(".series-card")).toHaveCount(3);
  await expect(page.locator(".recent-section")).toHaveCount(0);
  await page.getByLabel("Situação da leitura").selectOption("completed");
  await expect(page.locator(".series-card")).toHaveCount(1);
  await expect(page.locator(".series-state")).toHaveText("Concluída");
  await page.getByLabel("Ordenar obras").selectOption("title");
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.locator(".series-card")).toHaveCount(24);
  await visit("catalog", "&state=error");
  await expect(page.locator(".catalog-error")).toBeVisible();
  await expect(page.getByText("Nenhuma obra por aqui ainda.")).toHaveCount(0);
  await page
    .locator(".catalog-error")
    .getByRole("button", { name: "Tentar novamente" })
    .click();
  await expect(page.locator(".series-card").first()).toBeVisible();
  await visit("catalog", "&state=empty");
  await expect(page.getByText("Nenhuma obra por aqui ainda.")).toBeVisible();
  await visit("catalog");
  await expect(page.locator(".series-card").first()).toBeVisible();
  await visit("work");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "nook-catalog:local-reader:/",
      JSON.stringify({ page: 100, readingState: "all", order: "recent" }),
    ),
  );
  await visit("catalog");
  await expect(page.getByText("Página 2", { exact: true })).toBeVisible();
  await expect(page.locator(".series-card")).toHaveCount(2);
  await visit("catalog", "&state=loading");
  await expect(page.locator(".catalog-skeleton").first()).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".catalog-skeleton")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await visit("work", "&cover=1");
  assert.equal(
    await page.locator(".series-hero-cover img").evaluate((el) => {
      const a = el.getBoundingClientRect(),
        b = el.parentElement.getBoundingClientRect();
      return (
        Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2
      );
    }),
    true,
  );
  await visit("profile");
  await page
    .getByRole("textbox", { name: "Bio", exact: true })
    .fill("Perfil alterado localmente.");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(page.getByText("Perfil salvo.")).toBeVisible();
  await page.getByRole("checkbox", { name: /^Som de boas-vindas/ }).check();
  await page.getByRole("checkbox", { name: /^Reduzir animações/ }).check();
  await page
    .getByRole("button", { name: "Salvar preferências", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__nookTest.profile.preferences.welcomeSound),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.dataset.reduceMotion),
    )
    .toBe("true");
  // No autoplay: preference save does not play; the next trusted gesture unlocks audio.
  assert.equal(
    await page.evaluate(() =>
      sessionStorage.getItem("nook-welcome-played:local-reader"),
    ),
    null,
  );
  await page.getByRole("textbox", { name: "Nickname", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("nook-welcome-played:local-reader"),
      ),
    )
    .toBe("1");

  const profilePatch = await page.evaluate(() =>
    window.__nookTest.calls.find(
      (call) => call.table === "profiles" && call.update,
    ),
  );
  assert.equal(profilePatch.update.preferences.futureSetting, "preserved");
  assert.equal(
    await page.evaluate(() => window.__nookTest.profile.preferences.lineHeight),
    2.05,
  );
  assert.equal(
    await page.evaluate(
      () => window.__nookTest.profile.preferences.futureSetting,
    ),
    "preserved",
  );
  await page.getByRole("textbox", { name: "Nickname", exact: true }).focus();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Nickname", exact: true })
      .evaluate((el) => getComputedStyle(el).outlineStyle),
    "solid",
  );
  await visit("reader");
  await expect(
    page.getByRole("link", { name: "Capítulo anterior" }),
  ).toHaveAttribute("tabindex", "-1");
  await page.getByRole("button", { name: "Ajustes de leitura" }).click();
  await expect(page.getByLabel("Tema do leitor")).toBeVisible();
  for (const theme of ["light", "sepia", "dark"]) {
    await page.getByLabel("Tema do leitor").selectOption(theme);
    await page.getByLabel("Tema do leitor").focus();
    assert.equal(
      await page
        .getByLabel("Tema do leitor")
        .evaluate((el) => getComputedStyle(el).outlineStyle),
      "solid",
    );
  }
  for (let i = 0; i < 6; i++)
    await page.getByRole("button", { name: "Diminuir fonte" }).click();
  await expect(
    page.getByRole("button", { name: "Diminuir fonte" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Ajustes de leitura" }),
  ).toBeFocused();
  await expect(page.locator("#reader-settings")).toHaveCount(0);
  await visit("admin");
  await expect(page.locator(".series-card").first()).toBeVisible();
  await page.locator(".add-menu summary").click();
  await page.getByRole("button", { name: "Nova obra", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  assert.equal(
    await page.getByRole("dialog").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.left >= 0 && rect.right <= innerWidth && rect.height <= innerHeight
      );
    }),
    true,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".add-menu summary").click();
  await page.getByRole("button", { name: "Nova obra", exact: true }).click();
  await page
    .getByLabel("Nome da obra", { exact: true })
    .fill("Obra de teste restrita");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Criar obra", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(
    await page.evaluate(
      () =>
        window.__nookTest.calls.find(
          (call) => call.table === "series" && call.insert,
        )?.insert.beta_visible,
    ),
    false,
  );
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(page.getByText("Página 2", { exact: true })).toBeVisible();
  await expect(page.locator(".series-card")).toHaveCount(3);
  // A paginated selector finds destinations outside the current admin page.
  await page.locator(".publisher summary").click();
  await page
    .getByRole("searchbox", { name: "Buscar obra para selecionar" })
    .fill("Obra de teste restrita");
  await page.getByLabel("Obra", { exact: true }).selectOption("created-work");
  await expect(page.locator(".publication-state")).toContainText(
    "Restrita à administração",
  );
  await expect(
    page.getByRole("button", { name: "Liberar obra autorizada" }),
  ).toBeDisabled();
  await visit("manager", "&state=write-denied");
  await expect(page.locator(".manager-row")).toHaveCount(4);
  await page.getByRole("button", { name: "Selecionar página" }).click();
  await page.getByRole("combobox", { name: /^Ação/ }).selectOption("type");
  await page.getByRole("button", { name: "Aplicar a 4 arquivos" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Alguns arquivos não puderam ser atualizados",
  );
  await expect(page.getByText("4 selecionados", { exact: true })).toBeVisible();
  await visit("cbz");
  await expect(
    page.getByRole("img", { name: "Página 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Uma página por vez" }).click();
  await expect(page.locator(".cbz-page:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Próxima →", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Página 2", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cbz-page:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Rolagem vertical" }).click();
  await expect(page.locator(".cbz-page:visible")).toHaveCount(3);
  await visit("cbz", "&state=save-error");
  await expect(
    page.getByRole("img", { name: "Página 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Próxima →", exact: true }).click();
  await expect(page.getByRole("status").last()).toContainText(
    "Salvo neste dispositivo",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status").last()).toContainText(
    "Progresso salvo",
  );
  await expect(page.locator(".reader-save-feedback")).toHaveCount(0);
  await visit("cbz", "&state=save-error&conflict=1");
  await expect(
    page.getByRole("img", { name: "Página 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Próxima →", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Carregar posição recente" }),
  ).toBeVisible();
  // Large chapter: bounded extraction, tall image ratio and refresh restoration.
  await page.setViewportSize({ width: 390, height: 844 });
  await visit("cbz", "&archive=long");
  await expect(
    page.getByRole("img", { name: "Página 1", exact: true }),
  ).toBeVisible();
  assert.ok((await page.locator(".cbz-page img").count()) <= 5);
  await page.locator(".cbz-controls select").selectOption("74");
  const longPage = page.getByRole("img", { name: "Página 75", exact: true });
  await expect(longPage).toBeVisible();
  await expect
    .poll(() =>
      longPage.evaluate((el) => el.complete && el.naturalHeight === 2400),
    )
    .toBe(true);
  await page.locator('[data-page-index="74"]').evaluate((el) => {
    window.scrollTo({
      top:
        window.scrollY +
        el.getBoundingClientRect().top -
        76 +
        el.getBoundingClientRect().height * 0.42,
      behavior: "instant",
    });
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("nook-progress:v1:local-reader:book-0") ||
                "null",
            )?.page_number,
        ),
      { timeout: 10000 },
    )
    .toBe(75);
  const savedPosition = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nook-progress:v1:local-reader:book-0")),
  );
  assert.ok(
    Math.abs(savedPosition.scroll_ratio - 0.42) < 0.025,
    JSON.stringify(savedPosition),
  );
  assert.ok((await page.locator(".cbz-page img").count()) <= 11);
  await page.reload();
  await expect(longPage).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('[data-page-index="74"]')
        .evaluate(
          (el) =>
            (76 - el.getBoundingClientRect().top) /
            el.getBoundingClientRect().height,
        ),
    )
    .toBeCloseTo(0.42, 1);
  await page.locator('[data-page-index="74"]').evaluate((el) => {
    window.scrollBy({ top: 123, behavior: "instant" });
    window.dispatchEvent(new Event("pagehide"));
    return (
      (76 - el.getBoundingClientRect().top) / el.getBoundingClientRect().height
    );
  });
  await page.screenshot({ path: "artifacts/browser/cbz-tall-resume-390.png" });
  const coverReduction = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 2400;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#c6a87f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    const file = await window.__nookTest.prepareCoverImage(
      new File([blob], "cover.png", { type: "image/png" }),
    );
    const bitmap = await createImageBitmap(file);
    const result = {
      width: bitmap.width,
      height: bitmap.height,
      type: file.type,
      before: blob.size,
      after: file.size,
    };
    bitmap.close();
    return result;
  });
  assert.equal(coverReduction.width, 720);
  assert.equal(coverReduction.height, 1080);
  assert.equal(coverReduction.type, "image/png");
  assert.ok(coverReduction.after < coverReduction.before);
  // Preserve the complete cascade in the regression checks, including token ownership.
  const sourceSheets = [
    "base",
    "library-reader",
    "catalog-admin",
    "profile-community",
    "navigation",
    "catalog",
  ];
  const roots = sourceSheets.flatMap((name) => {
    const rules = [];
    postcss
      .parse(readFileSync(`src/app/styles/${name}.css`, "utf8"))
      .walkRules(":root", (rule) => rules.push(rule));
    return rules;
  });
  assert.equal(roots.length, 1, "Global tokens must have a single owner.");
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(blocked.length, 0, "Fixture attempted a nonlocal request.");
  await checkNativeZoom(base);
  console.log(
    "PASS: all UI routes and account/error states at 320–1920px and landscape; missing/broken covers; keyboard focus and mobile menu; search/empty/error/retry/pagination/favorites; profile/admin; PDF toolbar themes; real CBZ reader; reduced motion. All data and network traffic stayed local.",
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
