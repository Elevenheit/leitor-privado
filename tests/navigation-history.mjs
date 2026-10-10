// Local UI regression: run against a built Nook at localhost:3100.
// All Supabase responses below are simulated; no remote request is allowed.
import { chromium, firefox, webkit, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const engine = process.env.NOOK_BROWSER_ENGINE || "chromium";
assert.ok(["chromium", "firefox", "webkit"].includes(engine));
const browser = await { chromium, firefox, webkit }[engine].launch();
const failures = [];
const unexpected = [];
async function setup(id, admin = false, device = {}) {
  const context = await browser.newContext(device);
  await context.addInitScript(() => {
    const liveUrls = new Set();
    window.__nookResources = { workers: 0, liveUrls };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        window.__nookResources.workers++;
      }
      terminate() {
        if (!this.closedByAudit) {
          this.closedByAudit = true;
          window.__nookResources.workers--;
        }
        return super.terminate();
      }
    };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      liveUrls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      liveUrls.delete(url);
      revoke(url);
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("Failed to load resource")
    )
      failures.push(message.text());
  });
  const state = {
    empty: false,
    error: false,
    historyRequests: [],
    catalogRequests: [],
    progressWrites: [],
    preferences: { lineHeight: 2.05, textWidth: 820, showIllustrations: false },
    progress: null,
    positions: {},
    failSave: false,
    bookmarks: [],
    delaySigning: false,
    signingStarted: false,
    releaseSigning: null,
    mediaDownloads: 0,
    pdfScan: false,
    pdfOutline: true,
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
      return send([
        {
          previous_id:
            request.postDataJSON().target_book_id === "book-1"
              ? "book-0"
              : null,
          next_id:
            request.postDataJSON().target_book_id === "book-0"
              ? "book-1"
              : null,
        },
      ]);
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
      if (request.method() === "PATCH") {
        state.preferences = request.postDataJSON().preferences;
      }
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
      const params = url.searchParams;
      let rows = Array.from({ length: 104 }, (_, i) => ({
        ...localBook,
        id: `book-${i}`,
        chapter_number: i + 1,
        sort_order: i,
      }));
      if (params.get("select")?.startsWith("id,series_id"))
        rows = series.map((work, i) => ({
          id: `book-${i}`,
          series_id: work.id,
        }));
      const wanted = params.get("id")?.replace(/^eq\./, "");
      if (wanted) rows = rows.filter((row) => row.id === wanted);
      if (wanted === "book-3")
        rows = [
          {
            ...localBook,
            id: "book-3",
            file_path: `${userB}/local.cbz`,
            media_type: "cbz",
            total_pages: 3,
          },
        ];
      if (params.has("series_id"))
        rows = rows.filter(
          (row) =>
            row.series_id === params.get("series_id").replace(/^eq\./, ""),
        );
      const offset = Number(params.get("offset") || 0);
      rows = rows.slice(
        offset,
        offset + Number(params.get("limit") || rows.length),
      );
      return send(
        request.headers().accept?.includes("vnd.pgrst.object") ? rows[0] : rows,
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
      if (request.method() === "POST") {
        const row = request.postDataJSON();
        state.progressWrites.push(row);
        if (state.failSave) {
          state.failSave = false;
          return send({ message: "network failure", code: "FETCH" }, 503);
        }
        state.progress = row;
        state.positions[row.book_id] = row;
        return send(null);
      }
      if (url.searchParams.has("book_id"))
        return send(
          state.positions[url.searchParams.get("book_id").replace(/^eq\./, "")]
            ? [
                state.positions[
                  url.searchParams.get("book_id").replace(/^eq\./, "")
                ],
              ]
            : [],
        );
      const params = url.searchParams;
      assert.equal(params.get("owner_id"), `eq.${id}`);
      if (!params.get("select")?.includes("books!inner"))
        return send(Object.values(state.positions));
      assert.equal(params.get("order"), "updated_at.desc,book_id.asc");
      assert.ok(Number(params.get("limit")) >= 6);
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
        .slice(0, Number(params.get("limit")));
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
      if (request.method() === "POST") {
        if (state.delaySigning) {
          state.signingStarted = true;
          await new Promise((resolve) => {
            state.releaseSigning = resolve;
          });
        }
        return send({
          signedURL: url.pathname.replace("/storage/v1", "") + "?token=local",
        });
      }
      state.mediaDownloads++;
      if (url.pathname.endsWith("local.cbz"))
        return route.fulfill({
          status: 200,
          contentType: "application/zip",
          body: readFileSync("tests/fixtures/nook-original.cbz"),
        });
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: originalPdf({ outline: state.pdfOutline, scan: state.pdfScan }),
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
  if (process.env.NOOK_AUDIT_LIFECYCLE_ONLY) {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Leave while signing is in flight, then deliver its stale response.
    state.delaySigning = true;
    await page.locator('.history-card[href="/read/book-0"]').click();
    await expect.poll(() => state.signingStarted).toBe(true);
    await page.goBack();
    await expect(page.locator(".history-card").first()).toBeVisible();
    state.delaySigning = false;
    state.releaseSigning();
    await page.waitForTimeout(700);
    const cancelledMediaDownloads = state.mediaDownloads;
    const obsoleteWorkersAfterCancel = await page.evaluate(
      () => window.__nookResources.workers,
    );
    if (!process.env.NOOK_AUDIT_MEASURE_ONLY) {
      assert.equal(
        state.mediaDownloads,
        0,
        "Leaving during signing must prevent obsolete PDF downloads",
      );
      await expect
        .poll(() => page.evaluate(() => window.__nookResources.workers))
        .toBe(0);
    }
    // Start normal close-cycle measurements from a clean document in both versions.
    await page.reload();
    await expect(page.locator(".history-card").first()).toBeVisible();
    const cdp =
      engine === "chromium" ? await page.context().newCDPSession(page) : null;
    const heapSamples = [];
    for (let cycle = 0; cycle < 5; cycle++) {
      for (const [href, content] of [
        ["/read/book-0", ".reflow-text"],
        ["/read/book-3", ".cbz-page img"],
      ]) {
        await page.locator(`.history-card[href="${href}"]`).click();
        await expect(page.locator(content).first()).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => window.__nookResources.workers))
          .toBe(1);
        await page.goBack();
        await expect(page.locator(".history-card").first()).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => window.__nookResources.workers))
          .toBe(0);
        await expect
          .poll(() => page.evaluate(() => window.__nookResources.liveUrls.size))
          .toBe(0);
      }
      if (cdp) {
        await cdp.send("HeapProfiler.collectGarbage");
        heapSamples.push((await cdp.send("Runtime.getHeapUsage")).usedSize);
      }
    }
    writeFileSync(
      process.env.NOOK_AUDIT_LIFECYCLE_METRICS ||
        join(output, "lifecycle.json"),
      JSON.stringify(
        {
          cycles: 5,
          engine,
          cancelledMediaDownloads,
          obsoleteWorkersAfterCancel,
          heapSamples,
          workersAfterClose: 0,
          objectUrlsAfterClose: 0,
        },
        null,
        2,
      ),
    );
    assert.deepEqual(failures, []);
    assert.deepEqual(unexpected, []);
    console.log(
      "PASS: cancelled PDF initialization, five PDF/CBZ open-close cycles, workers and object URL disposal.",
    );
    process.exitCode = 0;
  } else {
    const viewports = [
      [320, 720],
      [360, 800],
      [375, 812],
      [390, 844],
      [428, 926],
      [430, 932],
      [768, 1024],
      [820, 1180],
      [900, 900],
      [1024, 768],
      [1366, 768],
      [1440, 900],
      [1920, 1080],
    ];
    const results = [];
    if (process.env.NOOK_AUDIT_METRICS) {
      await page.setViewportSize({ width: 1440, height: 900 });
      state.historyRequests.length = 0;
      await page.goto(origin);
      await expect(
        page.locator(".series-grid .series-card").first(),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      const metrics = await page.evaluate(() => {
        const resources = performance.getEntriesByType("resource");
        const scripts = resources.filter((r) =>
          new URL(r.name).pathname.endsWith(".js"),
        );
        return {
          initialJsDecodedBytes: scripts.reduce(
            (sum, r) => sum + r.decodedBodySize,
            0,
          ),
          initialJsEncodedBytes: scripts.reduce(
            (sum, r) => sum + r.encodedBodySize,
            0,
          ),
          scripts: scripts.map((r) => ({
            path: new URL(r.name).pathname,
            bytes: r.decodedBodySize,
          })),
          pdfWorkerLoaded: resources.some((r) => r.name.includes("pdf.worker")),
          cbzWorkerLoaded: resources.some((r) => r.name.includes("cbz.worker")),
        };
      });
      assert.equal(metrics.pdfWorkerLoaded, false);
      assert.equal(metrics.cbzWorkerLoaded, false);
      writeFileSync(
        process.env.NOOK_AUDIT_METRICS,
        JSON.stringify(
          { ...metrics, homeHistoryRequests: state.historyRequests.length },
          null,
          2,
        ),
      );
    }
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
              (!format || e.books.series.format === format) &&
              !e.completed,
          )
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          .slice(0, 6)
          .map(
            (e) =>
              `${e.books.media_type === "pdf" ? "/read" : "/media"}/${e.book_id}${e.completed ? "?restart=1" : ""}`,
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
          gridTop: document
            .querySelector(".series-grid")
            .getBoundingClientRect().top,
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
        if (!format)
          results.push({ viewport: `${width}x${height}`, ...layout });
        if (
          (width === 390 || width === 1440) &&
          (!format || format === "novel")
        )
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
    await page.locator(".navigation-rail").hover();
    await expect(page.locator(".navigation-shell")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    await expect
      .poll(async () =>
        Math.round(
          (await page.locator(".navigation-rail").boundingBox()).width,
        ),
      )
      .toBe(248);
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.body).paddingLeft),
      "82px",
    );
    const expandedContent = await page.locator(".beta-dashboard").boundingBox();
    assert.equal(
      expandedContent.x,
      before.x,
      "Hover expansion must not move the page",
    );
    assert.equal(expandedContent.width, before.width);
    await page.screenshot({
      path: join(output, "rail-expanded-1440.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.mouse.move(600, 200);
    await expect(page.locator(".navigation-shell")).toHaveAttribute(
      "data-expanded",
      "false",
    );
    await expect
      .poll(async () =>
        Math.round(
          (await page.locator(".navigation-rail").boundingBox()).width,
        ),
      )
      .toBe(82);
    await page.locator(".rail-brand").focus();
    await expect(page.locator(".navigation-shell")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    await page.getByLabel("Busca global de obras").focus();
    await expect(page.locator(".navigation-shell")).toHaveAttribute(
      "data-expanded",
      "false",
    );
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
      page.locator('.history-card[href="/media/book-4?restart=1"]'),
    ).toHaveCount(0);
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
    await expect(page.locator(".continuation-empty")).toBeVisible();
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
    // Deferred internal navigation uses the real PDF.js worker and authored outline.
    const pdfTools = page.getByRole("button", {
      name: "Sumário e busca no PDF",
      exact: true,
    });
    await pdfTools.click();
    const pdfDialog = page.getByRole("dialog", { name: "Navegar no PDF" });
    await expect(
      pdfDialog.getByRole("button", { name: /Inicio do volume/ }),
    ).toBeVisible();
    await pdfDialog.getByLabel("Buscar no documento").fill("quiet library");
    await expect(
      pdfDialog
        .locator('[aria-label="Resultados da busca"]')
        .getByRole("status"),
    ).toHaveText("20 resultados");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      pdfDialog.getByRole("button", { name: "Ler trecho selecionado" }),
    ).toBeInViewport();
    await page.screenshot({
      path: join(output, "pdf-navigation-390.png"),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: join(output, "pdf-navigation-1440.png"),
      animations: "disabled",
    });
    await pdfDialog
      .getByRole("button", { name: "Próximo resultado", exact: true })
      .click();
    await expect(
      pdfDialog.locator(".pdf-result[aria-pressed=true]"),
    ).toHaveCount(1);
    await pdfDialog
      .getByRole("button", { name: "Resultado anterior", exact: true })
      .click();
    await pdfDialog
      .getByRole("button", { name: "Ler trecho selecionado", exact: true })
      .click();
    await expect(pdfDialog).toHaveCount(0);
    await expect(pdfTools).toBeFocused();
    await pdfTools.click();
    await pdfDialog.getByLabel("Buscar no documento").fill("missing phrase");
    await pdfDialog.getByLabel("Buscar no documento").fill("quiet library");
    await expect(
      pdfDialog
        .locator('[aria-label="Resultados da busca"]')
        .getByRole("status"),
    ).toHaveText("20 resultados");
    await pdfDialog.getByRole("button", { name: /Ilustracao final/ }).click();
    await expect(pdfDialog).toHaveCount(0);
    await expect(page.locator(".reader-page-count")).toContainText("p. 2 / 2");
    await pdfTools.click();
    await pdfDialog.getByLabel("Ir à página").fill("3");
    await pdfDialog.getByRole("button", { name: "Ir", exact: true }).click();
    await expect(pdfDialog).toBeVisible();
    await pdfDialog.getByLabel("Ir à página").fill("1");
    await pdfDialog.getByRole("button", { name: "Ir", exact: true }).click();
    await expect(page.locator(".reader-page-count")).toContainText("p. 1 / 2");
    await pdfDialog
      .getByLabel("Buscar no documento")
      .fill("query cancelled on close");
    await page.keyboard.press("Escape");
    await expect(pdfDialog).toHaveCount(0);
    await expect(pdfTools).toBeFocused();
    // Focus never reacts to pointer movement, scrolling, selection or content taps.
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page
        .getByRole("button", { name: "Ativar modo foco", exact: true })
        .click();
      await expect(page.locator(".reader-app")).toHaveClass(/focus-mode/);
      await expect(page.locator("#reader-chrome")).toHaveAttribute("inert", "");
      await page.mouse.move(5, 2);
      await page.mouse.move(width / 2, 1);
      await page.locator(".reader-scroll").evaluate((el) => {
        el.scrollTop += 40;
        el.dispatchEvent(new Event("touchstart", { bubbles: true }));
        const selection = window.getSelection();
        selection.selectAllChildren(document.querySelector(".reflow-text"));
        el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      });
      await page.waitForTimeout(1200);
      await expect(page.locator("#reader-chrome")).toHaveAttribute("inert", "");
      await expect(page.locator(".reader-topbar")).not.toBeVisible();
      const scroll = await page
        .locator(".reader-scroll")
        .evaluate((el) => el.scrollTop);
      await page
        .getByRole("button", {
          name: "Mostrar controles de leitura",
          exact: true,
        })
        .click();
      await expect(page.locator(".reader-topbar")).toBeVisible();
      assert.equal(
        await page.locator(".reader-scroll").evaluate((el) => el.scrollTop),
        scroll,
      );
      await page
        .getByRole("button", {
          name: "Ocultar controles de leitura",
          exact: true,
        })
        .click();
      await expect(page.locator(".reader-topbar")).not.toBeVisible();
      assert.equal(
        await page.locator(".reader-scroll").evaluate((el) => el.scrollTop),
        scroll,
      );
      await page.keyboard.press("Escape");
      await expect(page.locator(".reader-app")).not.toHaveClass(/focus-mode/);
      await page.keyboard.press("f");
      await expect(page.locator(".reader-topbar")).not.toBeVisible();
      await page.keyboard.press("f");
      await expect(page.locator(".reader-topbar")).toBeVisible();
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // Changing reflow typography retains the same text-block anchor.
    // A legacy marker without new columns still restores its saved text line.
    state.bookmarks.push({
      id: "legacy-marker",
      owner_id: userA,
      book_id: "book-0",
      page_number: 1,
      line_index: 0,
      scroll_ratio: 0.25,
      label: "Legacy text marker",
      created_at: "2025-01-01",
    });
    await page.getByRole("button", { name: "Marcadores", exact: true }).click();
    await page.getByRole("button", { name: /^Legacy text marker/ }).click();
    await expect
      .poll(() =>
        page.locator(".reader-scroll").evaluate((root) => root.scrollTop),
      )
      .toBeLessThanOrEqual(48);
    state.bookmarks.pop();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(180);
    await page.locator(".reader-scroll").evaluate((el) => {
      el.scrollTop = 120;
    });
    await page.waitForTimeout(120);
    const textAnchor = await page.locator(".reader-scroll").evaluate((root) => {
      const top = root.getBoundingClientRect().top + 32;
      const block = [...root.querySelectorAll("[data-line]")].find(
        (el) => el.getBoundingClientRect().bottom > top,
      );
      const node = block.firstChild;
      const range = document.createRange();
      let low = 0,
        high = node.textContent.length - 1;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        range.setStart(node, mid);
        range.setEnd(node, mid + 1);
        if (range.getBoundingClientRect().bottom > top) high = mid;
        else low = mid + 1;
      }
      return {
        line: block.dataset.line,
        character: low,
        page: block.closest("[data-page-segment]").dataset.pageSegment,
      };
    });
    const anchorTop = () =>
      page
        .locator(
          `[data-page-segment="${textAnchor.page}"] [data-line="${textAnchor.line}"]`,
        )
        .evaluate((block, index) => {
          const range = document.createRange();
          range.setStart(block.firstChild, index);
          range.setEnd(block.firstChild, index + 1);
          return Math.round(
            range.getBoundingClientRect().top -
              document.querySelector(".reader-scroll").getBoundingClientRect()
                .top,
          );
        }, textAnchor.character);
    await page
      .getByRole("button", { name: "Ajustes de leitura", exact: true })
      .click();
    await page
      .getByLabel("Fonte do texto", { exact: true })
      .selectOption("sans");
    await expect.poll(anchorTop).toBe(32);
    await page
      .getByRole("button", { name: "Aumentar fonte", exact: true })
      .click();
    await expect.poll(anchorTop).toBe(32);
    await page
      .getByRole("button", { name: "Diminuir fonte", exact: true })
      .click();
    await expect.poll(anchorTop).toBe(32);
    await page
      .getByRole("button", { name: "Aumentar fonte", exact: true })
      .click();
    await expect.poll(anchorTop).toBe(32);
    await page.keyboard.press("Escape");
    // An immediate round trip to the original layout preserves the text character.
    const beforeModeChange = await anchorTop();
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await expect(page.locator("canvas").first()).toBeVisible();
    await page.getByRole("button", { name: "Texto", exact: true }).click();
    await expect
      .poll(async () => Math.abs((await anchorTop()) - beforeModeChange))
      .toBeLessThanOrEqual(48);
    // Reload midway through a long extracted paragraph without jumping to its start.
    await page.locator(".reader-scroll").evaluate((root) => {
      root.scrollTop = 120;
    });
    await page.waitForTimeout(1200);
    const textScroll = await page
      .locator(".reader-scroll")
      .evaluate((root) => root.scrollTop);
    await page.reload();
    await expect(page.locator(".reflow-text").first()).toBeVisible();
    await expect
      .poll(() =>
        page.locator(".reader-scroll").evaluate((root) => root.scrollTop),
      )
      .toBeGreaterThan(textScroll - 48);
    await page.setViewportSize({ width: 1440, height: 900 });
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
    // A network failure keeps a durable local position and allows leaving the reader.
    await expect(
      page.getByRole("heading", { name: titles[0], exact: true }),
    ).toBeVisible();
    const cachedPosition = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem(
          "nook-progress:v1:11111111-1111-4111-8111-111111111111:book-0",
        ),
      ),
    );
    assert.equal(cachedPosition.page_number, 2, JSON.stringify(cachedPosition));
    assert.ok(state.progressWrites.length >= 2);
    assert.equal(state.progress.page_number, 2);
    await page.getByRole("link", { name: "Continuar →", exact: true }).click();
    await expect(page.locator(".reader-page-count")).toContainText("p. 2 / 2");
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [390, 844],
      [360, 800],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(
        page.locator("canvas[data-ready='true']").last(),
      ).toBeVisible();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await expect(page.locator(".reader-page-count")).toContainText(
        "p. 2 / 2",
      );
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.reload();
    await expect(
      page.locator("canvas[data-ready='true']").last(),
    ).toBeVisible();
    await expect(page.locator(".reader-page-count")).toContainText("p. 2 / 2");
    await page.getByRole("button", { name: "Marcadores", exact: true }).click();
    await page.getByRole("button", { name: /^Local test position/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Marcadores deste capítulo" }),
    ).toHaveCount(0);
    await expect(page.locator(".reader-page-count")).toContainText("p. 2 / 2");
    await page
      .locator(".reader-quick-nav")
      .getByRole("link", { name: "Próximo capítulo", exact: true })
      .click();
    await expect(page).toHaveURL(/\/read\/book-1$/);
    await expect(page.locator(".reflow-text").first()).toBeVisible();
    await page
      .locator(".reader-quick-nav")
      .getByRole("link", { name: "Capítulo anterior", exact: true })
      .click();
    await expect(page).toHaveURL(/\/read\/book-0$/);
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
    await page.goto(origin + "/library");
    await expect(
      page.getByRole("heading", { name: "Biblioteca", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".bottom-navigation")).toBeVisible();
    await page
      .locator(".bottom-navigation")
      .getByRole("link", { name: "Buscar", exact: true })
      .click();
    await expect(
      page.getByRole("searchbox", { name: "Busca global de obras" }),
    ).toBeFocused();
    await page
      .getByRole("searchbox", { name: "Busca global de obras" })
      .fill("jardim");
    await expect(page.locator(".series-card")).toHaveCount(1);
    await page
      .locator(".bottom-navigation")
      .getByRole("link", { name: "Continuar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Continuar lendo", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Abrir navegação", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Menu do Nook" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Abrir navegação", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: join(output, "cbz-page-390.png"),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin + "/about");
    await expect(page.locator(".navigation-rail")).toBeVisible();
    await expect(
      page
        .locator(".welcome")
        .getByRole("link", { name: "Light Novels", exact: true }),
    ).toHaveAttribute("href", "/category/novel");
    await page.goto(origin + "/this-page-does-not-exist");
    await expect(
      page.getByRole("heading", { name: "Vamos voltar à biblioteca?" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Ir para o início", exact: true })
      .click();
    await expect(page.locator(".history-card").first()).toBeVisible();
    if (engine !== "firefox") {
      const touch = await setup(userA, false, {
        isMobile: true,
        hasTouch: true,
        viewport: { width: 390, height: 844 },
      });
      await touch.page
        .getByRole("button", { name: "Abrir navegação", exact: true })
        .tap();
      await expect(
        touch.page.getByRole("dialog", { name: "Menu do Nook" }),
      ).toBeVisible();
      await touch.page
        .getByRole("button", { name: "Fechar navegação", exact: true })
        .tap();
      await touch.page.goto(origin + "/read/book-0");
      await expect(touch.page.locator(".reflow-text").first()).toBeVisible();
      await touch.page
        .getByRole("button", { name: "Ativar modo foco", exact: true })
        .tap();
      await touch.page
        .locator(".reader-scroll")
        .tap({ position: { x: 150, y: 120 } });
      await expect(touch.page.locator("#reader-chrome")).toHaveAttribute(
        "inert",
        "",
      );
      await touch.page.screenshot({
        path: join(output, "focus-touch-390.png"),
        animations: "disabled",
      });
      await touch.page
        .getByRole("button", {
          name: "Mostrar controles de leitura",
          exact: true,
        })
        .tap();
      await expect(touch.page.locator(".reader-topbar")).toBeVisible();
      await touch.page
        .getByRole("button", { name: "Sair do modo foco", exact: true })
        .tap();
      await touch.page.setViewportSize({ width: 844, height: 390 });
      assert.ok(
        await touch.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await touch.page.goto(origin);
      await touch.page.setViewportSize({ width: 1024, height: 768 });
      await touch.page
        .getByRole("button", { name: "Expandir navegação", exact: true })
        .tap();
      await expect(touch.page.locator(".navigation-shell")).toHaveAttribute(
        "data-expanded",
        "true",
      );
      await touch.page
        .getByRole("button", { name: "Recolher navegação", exact: true })
        .tap();
      await expect(touch.page.locator(".navigation-shell")).toHaveAttribute(
        "data-expanded",
        "false",
      );
      await touch.context.close();
    }
    // A genuinely textless PDF keeps original pages available, including mobile/zoom.
    state.pdfScan = true;
    state.pdfOutline = false;
    state.progress = null;
    state.positions = {};
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage))
        if (key.startsWith("nook-progress:")) localStorage.removeItem(key);
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + "/read/book-0");
    await expect(page.getByText("Página 1 sem texto extraível.")).toBeVisible();
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await expect(page.locator("canvas").first()).toBeVisible();
    await page
      .getByRole("button", { name: "Sumário e busca no PDF", exact: true })
      .click();
    await expect(page.getByText(/não possui sumário interno/)).toBeVisible();
    await page.getByLabel("Buscar no documento").fill("archive");
    await expect(page.getByText(/não tem texto pesquisável/)).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    await expect(
      page.getByRole("button", {
        name: "Fechar navegação do PDF",
        exact: true,
      }),
    ).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Navegar no PDF" }),
    ).toHaveCount(0);
    await page.evaluate(() => {
      document.documentElement.style.zoom = "1";
    });
    await expect(page.locator("canvas").first()).toBeVisible();
    assert.deepEqual(failures, []);
    assert.deepEqual(unexpected, []);
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          viewports: results,
          screenshots: output,
          checks:
            "Personal history, category filtering, account isolation, real Next routing, global work start, real PDF.js/CBZ workers, PDF outline/search/page jump, text/PDF round trip, typography/reload, scan fallback, 200% CSS zoom, focus/Escape/touch, save retry, mobile page mode and resource disposal",
        },
        null,
        2,
      ),
    );
  }
} finally {
  await browser.close();
}
