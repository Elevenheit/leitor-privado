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
import { securityHeaders } from "../src/lib/security-headers.ts";

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
    "/chapter.cbz": ["application/zip", archive],
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
  const visit = async (screen, extra = "") => {
    await page.goto(`${base}/?screen=${screen}${extra}`);
    await expect(page.locator("main")).toBeVisible();
  };
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const screen of [
      "auth",
      "catalog",
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
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${screen}: horizontal overflow at ${width}px`,
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
        await expect(
          covers.nth(2).locator(".cover-fallback-title"),
        ).toBeVisible();
        await expect(covers.nth(3).locator("img")).toBeVisible();
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
  await expect(page.locator(".history-cover img")).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await expect(
    page.getByRole("dialog", { name: "Menu do Nook" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Abrir navegação" }),
  ).toBeFocused();
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
  const profilePatch = await page.evaluate(() =>
    window.__nookTest.calls.find(
      (call) => call.name === "patch_profile_settings",
    ),
  );
  assert.deepEqual(profilePatch.args.settings, {});
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
  await expect(page.locator(".reader-save-feedback")).toBeVisible();
  await page.getByRole("button", { name: "Tentar salvar novamente" }).click();
  await expect(page.locator(".reader-save-feedback")).toHaveCount(0);
  await visit("cbz", "&state=save-error&conflict=1");
  await expect(
    page.getByRole("img", { name: "Página 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Próxima →", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Carregar posição recente" }),
  ).toBeVisible();
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
  console.log(
    "PASS: real UI components at 1440/768/390/320px; missing/broken covers; keyboard focus and mobile menu; search/empty/error/retry/pagination/favorites; profile/admin; PDF toolbar themes; real CBZ reader; reduced motion. All data and network traffic stayed local.",
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
