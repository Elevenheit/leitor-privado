// Local UI regression: run against a built Nook at localhost:3100.
// All Supabase responses below are simulated; no remote request is allowed.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { originalPdf } from "./ui/original-pdf.mjs";

const origin = process.env.NOOK_UI_ORIGIN || "http://localhost:3100";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const output = join(process.cwd(), "artifacts", "next-browser");
mkdirSync(output, { recursive: true });
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const formats = ["novel", "manga", "manhwa"];
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
  format: formats[i % 3],
  cover_path: `cover-${i}.svg`,
  created_at: new Date(
    Date.UTC(2026, 8, 24, 0, 0, 0) - i * 60000,
  ).toISOString(),
}));
const entries = series.map((s, i) => ({
  book_id: `book-${i}`,
  owner_id: userA,
  page_number: 12,
  scroll_ratio: 0.5,
  completed: i === 4,
  updated_at: s.created_at,
  books: {
    id: `book-${i}`,
    title: `Capítulo ${i + 1}`,
    media_type: s.format === "novel" ? "pdf" : "cbz",
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
const localBook = {
  id: "book-0",
  owner_id: userB,
  title: "Original local chapter",
  original_filename: "local.pdf",
  file_path: `${userB}/local.pdf`,
  size_bytes: 3000,
  total_pages: 2,
  series_id: "series-0",
  volume_id: null,
  chapter_number: 1,
  chapter_title: null,
  sort_order: 0,
  content_type: "chapter",
  media_type: "pdf",
  created_at: "2026-01-01",
};
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
const unexpected = [];
async function setup(id, admin = false) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(error.message));
  const state = {
    empty: false,
    error: false,
    historyRequests: [],
    catalogRequests: [],
    progressWrites: [],
    preferences: { lineHeight: 2.05, textWidth: 820, showIllustrations: false },
    progress: null,
    failSave: false,
    bookmarks: [],
  };
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
    if (url.origin !== "http://127.0.0.1:54321") {
      unexpected.push(url.origin);
      return route.abort();
    }
    const send = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.pathname.endsWith("/auth/v1/token")) return send(session);
    if (url.pathname.endsWith("/auth/v1/user")) return send(user);
    if (url.pathname.endsWith("/rpc/browse_catalog")) {
      const args = request.postDataJSON();
      state.catalogRequests.push(args);
      const rows = series.filter(
        (s) =>
          (!args.filter_format || args.filter_format === s.format) &&
          (!args.search_term ||
            s.title.toLowerCase().includes(args.search_term.toLowerCase())),
      );
      return send({
        items: rows
          .slice(args.page_index * 24, (args.page_index + 1) * 24)
          .map((s) => ({
            ...s,
            reading_state: "reading",
            chapter_count: 1,
            completed_count: 0,
          })),
        totalCount: rows.length,
        hasMore: rows.length > (args.page_index + 1) * 24,
      });
    }
    if (url.pathname.endsWith("/rpc/reader_work_page"))
      return send({
        series: {
          ...series[0],
          description: "An original local work.",
          owner_id: userB,
        },
        books:
          request.postDataJSON().page_index === 0
            ? [localBook]
            : [{ ...localBook, id: "book-100", chapter_number: 101 }],
        volumes: [],
        progress: [],
        firstBook: localBook,
        lastRead: state.progress ? localBook : null,
        chapterCount: 101,
        completedCount: 0,
        volumeCount: 0,
        hasMore: request.postDataJSON().page_index === 0,
      });
    if (url.pathname.endsWith("/rpc/reader_navigation_neighbors"))
      return send([{ previous_id: null, next_id: null }]);
    if (url.pathname.endsWith("/rpc/save_reading_position")) {
      const args = request.postDataJSON();
      state.progressWrites.push(args);
      if (state.failSave) {
        state.failSave = false;
        return send({ message: "network failure", code: "FETCH" }, 503);
      }
      const stamp = new Date().toISOString();
      state.progress = {
        ...args.reading_position,
        updated_at: stamp,
        owner_id: id,
        book_id: "book-0",
      };
      return send(stamp);
    }
    if (url.pathname.endsWith("/rpc/patch_profile_settings")) {
      state.preferences = {
        ...state.preferences,
        ...request.postDataJSON().settings,
      };
      return send(state.preferences);
    }
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
        preferences: {
          ...state.preferences,
          theme: "dark",
          fontSize: 22,
          fontFamily: "serif",
        },
      };
      return send(
        request.headers().accept?.includes("vnd.pgrst.object") ? row : [row],
      );
    }
    if (url.pathname.endsWith("/rest/v1/books")) {
      const row =
        url.searchParams.get("id") === "eq.book-3"
          ? {
              ...localBook,
              id: "book-3",
              file_path: `${userB}/local.cbz`,
              media_type: "cbz",
              total_pages: 3,
            }
          : localBook;
      return send(
        request.headers().accept?.includes("vnd.pgrst.object") ? row : [row],
      );
    }
    if (url.pathname.endsWith("/rest/v1/reading_bookmarks")) {
      if (request.method() === "POST") {
        const row = {
          ...request.postDataJSON(),
          id: "bookmark-local",
          created_at: "2026-01-01",
        };
        state.bookmarks.push(row);
        return send(
          request.headers().accept?.includes("vnd.pgrst.object") ? row : [row],
        );
      }
      return send(state.bookmarks);
    }
    if (
      ["volumes", "comments", "profile_identities"].some((table) =>
        url.pathname.endsWith(`/rest/v1/${table}`),
      )
    )
      return send([]);
    if (url.pathname.endsWith("/rest/v1/reading_progress")) {
      if (url.searchParams.has("book_id"))
        return send(
          state.progress && url.searchParams.get("book_id") === "eq.book-0"
            ? [state.progress]
            : [],
        );
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
      const seriesId = url.searchParams.get("id")?.replace("eq.", "");
      const term = url.searchParams
        .get("title")
        ?.replace(/^ilike\.\*?|%/g, "")
        .toLowerCase();
      return send(
        series.filter(
          (s) =>
            (!format || s.format === format) &&
            (!seriesId || s.id === seriesId) &&
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
    if (url.pathname.includes("/storage/v1/object/sign/novels/")) {
      if (request.method() === "POST")
        return send({
          signedURL: url.pathname.replace("/storage/v1", "") + "?token=local",
        });
      if (url.pathname.endsWith("local.cbz"))
        return route.fulfill({
          status: 200,
          contentType: "application/zip",
          body: readFileSync("tests/fixtures/nook-original.cbz"),
        });
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: originalPdf(),
      });
    }
    unexpected.push(url.pathname);
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
    [320, 720],
    [360, 800],
    [375, 812],
    [390, 844],
    [430, 932],
    [768, 1024],
    [820, 1180],
    [1024, 768],
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
        .toBe(width >= 901 ? "82px" : "0px");
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
    .toBe("82px");
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
    .toBe(248);
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).paddingLeft),
    )
    .toBe("248px");
  const expandedContent = await page.locator(".beta-dashboard").boundingBox();
  assert.ok(expandedContent.x > before.x);
  assert.ok(expandedContent.x >= 248 + 24);
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
    .toBe(82);
  await page.locator(".navigation-rail summary").click();
  await expect(
    page.getByRole("link", { name: "Administrar acervo" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".navigation-rail details")).not.toHaveAttribute(
    "open",
    "",
  );
  // Known totals get percentages; unknown totals still show the current page.
  await expect(
    page.locator('.history-card[href="/read/book-0"] [role=progressbar]'),
  ).toHaveAttribute("aria-valuenow", "50");
  await expect(
    page.locator('.history-card[href="/media/book-4"]'),
  ).toContainText("Concluído");
  await expect(
    page.locator('.history-card[href="/media/book-1"] [role=progressbar]'),
  ).toHaveCount(0);
  const historyCount = state.historyRequests.length;
  await page
    .getByRole("searchbox", { name: "Busca global de obras" })
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
  await page.goto(origin);
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.locator(".history-card").first()).toBeVisible();
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
    "/read/book-15",
  );
  await second.page.locator(".navigation-rail summary").click();
  await expect(
    second.page.getByRole("link", { name: "Administrar acervo" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  // Client routing, real PDF.js worker/rendering, fallback and save recovery in Next.
  await page.goto(origin);
  await page.locator('.series-title[href="/series/series-0"]').click();
  await expect(
    page.getByRole("heading", { name: titles[0], exact: true }),
  ).toBeVisible();
  const start = page.getByRole("link", { name: "Começar →", exact: true });
  await expect(start).toHaveAttribute("href", "/read/book-0");
  await page.getByRole("button", { name: "Mais capítulos" }).click();
  await expect(page.getByText("Página 2", { exact: true })).toBeVisible();
  await expect(start).toHaveAttribute("href", "/read/book-0");
  await start.click();
  await expect(page.locator(".reflow-text").first()).toContainText(
    "Original local paragraph",
  );
  await expect(page.getByText("Página 2 sem texto extraível.")).toBeVisible();
  await page.getByRole("button", { name: "Ver no PDF", exact: true }).click();
  await expect(page.locator("canvas").first()).toBeVisible();
  assert.ok(
    await page
      .locator("canvas")
      .first()
      .evaluate((canvas) => canvas.width > 0 && canvas.height > 0),
  );
  await page.screenshot({
    path: join(output, "pdf-original-1440.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Marcadores", exact: true }).click();
  await page.getByLabel("Nome opcional").fill("Local test position");
  await page.getByRole("button", { name: "Salvar posição atual" }).click();
  await expect(
    page.getByRole("button", { name: /^Local test position/ }),
  ).toBeVisible();
  assert.equal(state.bookmarks[0].page_number, 2);
  await page.getByRole("button", { name: "Fechar marcadores" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .first()
        .evaluate((canvas) =>
          Math.abs(
            canvas.getBoundingClientRect().width /
              canvas.getBoundingClientRect().height -
              612 / 792,
          ),
        ),
    )
    .toBeLessThan(0.02);
  await page.screenshot({
    path: join(output, "pdf-original-390.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1100); // Finish the reader's scroll-save debounce before injecting one failure.
  state.failSave = true;
  await page
    .getByRole("button", { name: "Voltar à biblioteca", exact: true })
    .click();
  await expect(page.locator(".reader-save-feedback")).toContainText(
    "Falha de conexão",
  );
  assert.ok(page.url().includes("/read/book-0"));
  await page.getByRole("button", { name: "Tentar salvar novamente" }).click();
  await expect(
    page.getByRole("heading", { name: titles[0], exact: true }),
  ).toBeVisible();
  assert.ok(state.progressWrites.length >= 2);
  assert.equal(state.progress.page_number, 2);
  await page.getByRole("link", { name: "Continuar →", exact: true }).click();
  await expect(page.locator(".reader-page-count")).toContainText("p. 2 / 2");
  await page.getByRole("button", { name: "Marcadores", exact: true }).click();
  await page.getByRole("button", { name: /^Local test position/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Marcadores deste capítulo" }),
  ).toHaveCount(0);
  await expect(page.locator(".reader-page-count")).toContainText("p. 2 / 2");
  await page
    .getByRole("button", { name: "Voltar à biblioteca", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: titles[0], exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Nook, voltar à biblioteca", exact: true })
    .click();
  await expect(page.locator(".series-card").first()).toBeVisible();
  await page.goto(origin + "/media/book-3");
  await expect(
    page.getByRole("img", { name: "Página 1", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".navigation-shell")).toHaveAttribute(
    "data-immersive",
    "true",
  );
  await expect(page.locator(".rail-toggle")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).paddingLeft),
    )
    .toBe("82px");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Uma página por vez" }).click();
  await expect(page.locator(".cbz-page:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Próxima →", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Página 2", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Math.round((await page.locator(".mobile-navigation").boundingBox()).y),
    )
    .toBe(0);
  const comicControls = await page.locator(".cbz-controls").boundingBox();
  const comicImage = await page
    .getByRole("img", { name: "Página 2", exact: true })
    .boundingBox();
  assert.ok(
    comicControls.y >= 59 && comicControls.y + comicControls.height < 844,
    "Page controls remain visible on mobile.",
  );
  assert.ok(
    comicImage.y >= comicControls.y + comicControls.height - 2,
    "The comic page is not covered by its controls.",
  );
  await page.screenshot({
    path: join(output, "cbz-page-390.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/about");
  await expect(page.locator(".navigation-rail")).toBeVisible();
  assert.deepEqual(failures, []);
  assert.deepEqual(unexpected, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        viewports: results,
        screenshots: output,
        checks:
          "Personal history, category filtering, rail, drawer/Escape, account isolation, real Next navigation/hydration, global work start after pagination, real PDF.js/CBZ workers, original PDF fallback, save failure/retry, return to catalog and mobile page mode",
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
