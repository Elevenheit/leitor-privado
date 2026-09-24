// Local UI regression: run against a built Nook at localhost:3100.
// All Supabase responses below are simulated; no remote request is allowed.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = process.env.NOOK_UI_ORIGIN || "http://localhost:3100";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const output = join(tmpdir(), "nook-rail-review");
mkdirSync(output, { recursive: true });
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const formats = ["novel", "manga", "manhwa", "anime"];
const titles = [
  "O jardim das palavras",
  "Cartas de outono",
  "A cidade entre páginas",
  "Depois da última estrela",
  "O atlas dos dias",
  "O café da esquina",
  "Um inverno inteiro",
  "Pequenas constelações",
  "A casa de papel",
  "Até a próxima lua",
  "Entre rios e montanhas",
  "O som do silêncio",
  "A biblioteca do vento",
  "Um verão distante",
  "Caminhos de tinta",
  "Memórias do amanhã",
];
const series = titles.map((title, i) => ({
  id: `series-${i}`,
  title,
  format: formats[i % 4],
  cover_path: `cover-${i}.svg`,
  created_at: new Date(
    Date.UTC(2026, 8, 24, 0, 0, 0) - i * 60000,
  ).toISOString(),
}));
const entries = series.map((s, i) => ({
  book_id: `book-${i}`,
  owner_id: userA,
  page_number: 12,
  position_seconds: 1207,
  completed: i === 4,
  updated_at: s.created_at,
  books: {
    id: `book-${i}`,
    title: `Capítulo ${i + 1}`,
    media_type:
      s.format === "anime" ? "video" : s.format === "novel" ? "pdf" : "cbz",
    total_pages: s.format === "novel" ? 24 : null,
    chapter_number: i + 1,
    chapter_title: null,
    content_type: "chapter",
    series: s,
    volumes: null,
  },
}));
entries.push({
  ...entries[15],
  owner_id: userB,
  updated_at: "2026-09-25T00:00:00Z",
});
const palettes = [
  ["#655137", "#25211b"],
  ["#68624d", "#252b25"],
  ["#846258", "#2f211e"],
  ["#536266", "#1d282b"],
];
function cover(index) {
  const [light, dark] = palettes[index % 4];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="460"><defs><linearGradient id="g" x2="0.7" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect width="320" height="460" fill="url(#g)"/><rect x="18" y="18" width="284" height="424" rx="3" fill="none" stroke="#ddc8a6" stroke-opacity=".4"/><circle cx="160" cy="150" r="64" fill="none" stroke="#ddc8a6" stroke-opacity=".4"/><path d="M50 230 Q160 80 270 230 M50 240 Q160 90 270 240 M65 250 Q160 110 255 250" fill="none" stroke="#ddc8a6" stroke-opacity=".3"/><text x="160" y="323" text-anchor="middle" fill="#eadbc5" font-family="Georgia" font-size="21">NOOK</text><text x="160" y="350" text-anchor="middle" fill="#eadbc5" font-size="9" letter-spacing="3">EDIÇÃO DE TESTE</text></svg>`;
}
const browser = await chromium.launch();
const failures = [];
async function setup(id, admin = false) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(error.message));
  const state = { empty: false, error: false, historyRequests: [] };
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "ui@example.test",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-09-01T00:00:00Z",
  };
  const session = {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`,
    refresh_token: "fixture",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(origin).origin) return route.continue();
    const send = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.pathname.endsWith("/auth/v1/token")) return send(session);
    if (url.pathname.endsWith("/auth/v1/user")) return send(user);
    if (url.pathname.includes("/rpc/")) throw Error("Unexpected RPC call");
    if (url.pathname.endsWith("/rest/v1/beta_access"))
      return send([
        {
          role: admin ? "admin" : "reader",
          revoked: false,
          expires_at: "infinity",
        },
      ]);
    if (url.pathname.endsWith("/rest/v1/profiles")) {
      const row = {
        nickname: "leitor_nook",
        display_name: "Alex",
        bio: "Entre livros, páginas e novos mundos.",
        avatar: "✦",
        avatar_path: null,
        banner_path: null,
        preferences: { theme: "dark", fontSize: 22, fontFamily: "serif" },
      };
      return send(
        request.headers().accept?.includes("vnd.pgrst.object") ? row : [row],
      );
    }
    if (url.pathname.endsWith("/rest/v1/books"))
      return send({ message: "Local media shell fixture" }, 400);
    if (url.pathname.endsWith("/rest/v1/reading_progress")) {
      if (url.searchParams.has("book_id")) return send([]);
      const params = url.searchParams;
      assert.equal(params.get("owner_id"), `eq.${id}`);
      assert.equal(params.get("order"), "updated_at.desc,book_id.asc");
      assert.equal(params.get("limit"), "6");
      assert.equal(params.has("completed"), false);
      assert.ok(params.get("select").includes("books!inner("));
      assert.ok(params.get("select").includes("series!inner("));
      state.historyRequests.push(Object.fromEntries(params));
      if (state.error) return send({ message: "Local simulated failure" }, 400);
      const format = params.get("books.series.format")?.replace("eq.", "");
      const rows = entries
        .filter(
          (e) =>
            e.owner_id === id && (!format || e.books.series.format === format),
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 6);
      return send(state.empty ? [] : rows);
    }
    if (url.pathname.endsWith("/rest/v1/favorites")) return send([]);
    if (url.pathname.endsWith("/rest/v1/series")) {
      const format = url.searchParams.get("format")?.replace("eq.", "");
      const term = url.searchParams
        .get("title")
        ?.replace(/^ilike\.\*?|%/g, "")
        .toLowerCase();
      return send(
        series.filter(
          (s) =>
            (!format || s.format === format) &&
            (!term || s.title.toLowerCase().includes(term)),
        ),
      );
    }
    if (url.pathname.includes("/storage/v1/object/sign/covers/")) {
      if (request.method() === "POST")
        return send({
          signedURL: url.pathname.replace("/storage/v1", "") + "?token=local",
        });
      const index = Number(/cover-(\d+)/.exec(url.pathname)?.[1] || 0);
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: cover(index),
      });
    }
    return route.abort();
  });
  await page.goto(origin);
  await page.getByLabel("E-mail", { exact: true }).fill("ui@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Entrar na biblioteca" }).click();
  await expect(page.locator(".history-card").first()).toBeVisible();
  return { context, page, state };
}
try {
  const { page, state } = await setup(userA);
  const viewports = [
    [360, 800],
    [390, 844],
    [430, 932],
    [768, 1024],
    [820, 1180],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
  ];
  const results = [];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    for (const format of [null, ...formats]) {
      await page.goto(origin + (format ? `/category/${format}` : "/"));
      await expect(page.locator(".history-card").first()).toBeVisible();
      await expect(
        page.locator(".series-grid .series-card").first(),
      ).toBeVisible();
      await expect(page.locator(".series-cover img").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() =>
          page.evaluate(() => getComputedStyle(document.body).paddingLeft),
        )
        .toBe(width >= 901 ? "76px" : "0px");
      const expected = entries
        .filter(
          (e) =>
            e.owner_id === userA &&
            (!format || e.books.series.format === format),
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 6)
        .map(
          (e) =>
            `${e.books.media_type === "pdf" ? "/read" : "/media"}/${e.book_id}`,
        );
      assert.deepEqual(
        await page
          .locator(".history-card")
          .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href"))),
        expected,
      );
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        gridTop: document.querySelector(".series-grid").getBoundingClientRect()
          .top,
        columns: getComputedStyle(
          document.querySelector(".series-grid"),
        ).gridTemplateColumns.split(" ").length,
        rail: getComputedStyle(document.querySelector(".navigation-rail"))
          .display,
      }));
      assert.equal(
        layout.scrollWidth,
        width,
        `Overflow on ${format || "home"} at ${width}`,
      );
      if (width >= 901) assert.notEqual(layout.rail, "none");
      else assert.equal(layout.rail, "none");
      if (width <= 430) assert.equal(layout.columns, 2);
      if (width === 1440 && !format) assert.ok(layout.gridTop < height);
      if (!format) results.push({ viewport: `${width}x${height}`, ...layout });
      if ((width === 390 || width === 1440) && (!format || format === "novel"))
        await page.screenshot({
          path: join(output, `${format || "home"}-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
    }
    await page.goto(origin + "/profile");
    await expect(
      page.getByRole("heading", { name: "Uma página com a sua cara." }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    if (width === 390)
      await page.screenshot({
        path: join(output, "profile-390.png"),
        fullPage: true,
        animations: "disabled",
      });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin);
  await expect(page.locator(".history-card").first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).paddingLeft),
    )
    .toBe("76px");
  const before = await page.locator(".beta-dashboard").boundingBox();
  await page
    .getByRole("button", { name: "Expandir navegação", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Recolher navegação", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(async () =>
      Math.round((await page.locator(".navigation-rail").boundingBox()).width),
    )
    .toBe(236);
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).paddingLeft),
    )
    .toBe("236px");
  const expandedContent = await page.locator(".beta-dashboard").boundingBox();
  assert.ok(expandedContent.x > before.x);
  assert.ok(expandedContent.x >= 236 + 24);
  await page.screenshot({
    path: join(output, "rail-expanded-1440.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Recolher navegação", exact: true })
    .click();
  await expect
    .poll(async () =>
      Math.round((await page.locator(".navigation-rail").boundingBox()).width),
    )
    .toBe(76);
  await page.locator(".navigation-rail summary").click();
  await expect(
    page.getByRole("link", { name: "Administrar acervo" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".navigation-rail details")).not.toHaveAttribute(
    "open",
    "",
  );
  // Known totals get percentages; video has only saved time, never a made-up duration.
  await expect(
    page.locator('.history-card[href="/read/book-0"] [role=progressbar]'),
  ).toHaveAttribute("aria-valuenow", "50");
  await expect(
    page.locator('.history-card[href="/read/book-4"]'),
  ).toContainText("Concluído");
  await expect(
    page.locator('.history-card[href="/media/book-3"]'),
  ).toContainText("20:07 assistidos");
  await expect(
    page.locator('.history-card[href="/media/book-3"] [role=progressbar]'),
  ).toHaveCount(0);
  await expect(
    page.locator('.history-card[href="/media/book-1"] [role=progressbar]'),
  ).toHaveCount(0);
  const historyCount = state.historyRequests.length;
  await page
    .getByRole("textbox", { name: "Busca global de obras" })
    .fill("jardim");
  await expect(page.locator(".series-grid .series-card")).toHaveCount(1);
  assert.equal(state.historyRequests.length, historyCount);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Abrir navegação", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Menu do Nook" }),
  ).toBeVisible();
  await page.screenshot({
    path: join(output, "drawer-390.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.locator("dialog summary").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir navegação", exact: true }),
  ).toBeFocused();
  state.empty = true;
  await page.goto(origin + "/category/manga");
  await expect(page.locator(".series-card").first()).toBeVisible();
  await expect(page.locator(".recent-section")).toHaveCount(0);
  state.empty = false;
  state.error = true;
  await page.goto(origin);
  await expect(page.locator(".history-error")).toBeVisible();
  state.error = false;
  await page.locator(".history-error button").click();
  await expect(page.locator(".history-card").first()).toBeVisible();
  const second = await setup(userB, true);
  await second.page.setViewportSize({ width: 1440, height: 900 });
  await expect(second.page.locator(".history-card")).toHaveCount(1);
  await expect(second.page.locator(".history-card")).toHaveAttribute(
    "href",
    "/media/book-15",
  );
  await second.page.locator(".navigation-rail summary").click();
  await expect(
    second.page.getByRole("link", { name: "Administrar acervo" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/media/book-3");
  await expect(page.locator(".navigation-shell")).toHaveAttribute(
    "data-immersive",
    "true",
  );
  await expect(page.locator(".rail-toggle")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).paddingLeft),
    )
    .toBe("76px");
  await page.goto(origin + "/about");
  await expect(page.locator(".navigation-rail")).toBeVisible();
  assert.deepEqual(failures, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        viewports: results,
        screenshots: output,
        checks:
          "Personal history, category filtering before limit, order, completed and unknown totals, search independence, rail, drawer/Escape, admin visibility, empty/error/retry, UTF-8 content",
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
