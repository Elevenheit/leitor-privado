import assert from "node:assert/strict";
import { build } from "esbuild";

async function load(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "existing-schema",
        setup(builder) {
          builder.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({
            path: "mock",
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export function supabase() { return globalThis.fixtureApi; }",
          }));
        },
      },
    ],
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
}

const series = Array.from({ length: 30 }, (_, n) => ({
  id: `series-${String(n).padStart(2, "0")}`,
  owner_id: n === 29 ? "other" : "admin",
  title: `Obra ${String(n).padStart(2, "0")}`,
  format: "novel",
  created_at: "2026-01-01",
  cover_path: null,
  beta_visible: true,
}));
const books = Array.from({ length: 1005 }, (_, n) => ({
  id: `book-${String(n).padStart(4, "0")}`,
  owner_id: "admin",
  series_id: series[0].id,
  volume_id: "volume",
  chapter_number: n,
  sort_order: n,
  title: `Capítulo ${n}`,
  original_filename: `capitulo-${n}.pdf`,
  media_type: "pdf",
  created_at: "2026-01-01",
}));
const database = {
  series,
  books: [
    ...books,
    { ...books[0], id: "foreign", owner_id: "other", series_id: series[29].id },
  ],
  volumes: [
    {
      id: "volume",
      owner_id: "admin",
      series_id: series[0].id,
      sort_order: 0,
      volume_number: 1,
      created_at: "2026-01-01",
    },
  ],
  reading_progress: [
    {
      owner_id: "reader",
      page_number: 9,
      scroll_ratio: 0.4,
      book_id: books[0].id,
      completed: true,
      updated_at: "2026-02-01",
    },
    {
      owner_id: "reader",
      page_number: 9,
      scroll_ratio: 0.4,
      book_id: books[1004].id,
      completed: false,
      updated_at: "2026-03-01",
    },
    {
      owner_id: "other",
      book_id: books[1].id,
      completed: true,
      updated_at: "2026-04-01",
    },
  ],
  favorites: [
    { owner_id: "reader", series_id: series[0].id },
    { owner_id: "other", series_id: series[29].id },
  ],
};
const initial = JSON.stringify(database);
const rpcCalls = [],
  tableCalls = [];
globalThis.fixtureApi = {
  rpc: async (name, args) => {
    assert.equal(name, "browse_catalog");
    rpcCalls.push(args);
    const items = series
      .slice(args.page_index * 24, (args.page_index + 1) * 24)
      .map((s) => ({ ...s, is_favorite: s.id === series[0].id }));
    return {
      data: {
        items,
        totalCount: series.length,
        hasMore: args.page_index === 0,
      },
      error: null,
    };
  },
  from: (table) => {
    tableCalls.push(table);
    assert.ok(Object.hasOwn(database, table), table);
    const conditions = [];
    const orders = [];
    const rows = () =>
      database[table]
        .filter((item) =>
          conditions.every(([key, value]) => item[key] === value),
        )
        .sort((a, b) => {
          for (const [key, ascending] of orders) {
            const comparison = String(a[key] ?? "").localeCompare(
              String(b[key] ?? ""),
            );
            if (comparison) return ascending ? comparison : -comparison;
          }
          return 0;
        });
    const query = {
      select: () => query,
      returns: () => query,
      eq: (key, value) => {
        conditions.push([key, value]);
        return query;
      },
      is: (key, value) => {
        conditions.push([key, value]);
        return query;
      },
      order: (key, options = {}) => {
        orders.push([key, options.ascending !== false]);
        return query;
      },
      range: async (from, to) => ({
        data: rows().slice(from, to + 1),
        error: null,
      }),
      maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
    };
    return query;
  },
};
try {
  const { listCatalogPage, getWorkPage } = await load(
    "src/lib/data/catalog.ts",
  );
  const options = { ownerId: "reader", page: 0 };
  const first = await listCatalogPage(options);
  const second = await listCatalogPage({ ...options, page: 1 });
  assert.equal(first.items.length, 24);
  assert.equal(second.items.length, 6);
  assert.equal(first.totalCount, 30);
  assert.equal(second.hasMore, false);
  assert.equal(
    tableCalls.length,
    0,
    "Catalog must use bounded RPC, not download all books.",
  );
  await listCatalogPage({
    ...options,
    search: "  CAPÍTULO   1004 ",
    favoritesOnly: true,
    readingState: "reading",
    format: "novel",
  });
  assert.equal(rpcCalls.at(-1).search_term, "capitulo 1004");
  assert.equal(rpcCalls.at(-1).favorites_only, true);
  assert.equal(rpcCalls.at(-1).reading_state, "reading");
  assert.equal(rpcCalls.at(-1).filter_format, "novel");
  assert.ok(
    !Object.hasOwn(rpcCalls[0], "owner_id"),
    "Server scopes progress to auth.uid().",
  );
  assert.deepEqual(first.favoriteIds, [series[0].id]);
  const work = await getWorkPage(series[0].id, 10, "reader");
  assert.equal(work.chapterCount, 1005);
  assert.equal(work.books.length, 5);
  assert.equal(work.firstBook.id, books[0].id);
  assert.equal(work.lastRead.id, books[1004].id);
  assert.equal(work.completedCount, 1);
  assert.ok(work.progress.every((item) => item.owner_id === "reader"));
  const { listAdminWorks, listAdminCatalog } = await load(
    "src/lib/data/admin.ts",
  );
  const admin = await listAdminWorks(0, "Capítulo 1004", false, "admin");
  assert.equal(admin.totalCount, 1);
  assert.equal(admin.items[0].chapter_count, 1005);
  assert.equal(admin.fileCount, 1005);
  const files = await listAdminCatalog("admin", 20, "");
  assert.equal(files.totalCount, 1005);
  assert.equal(files.books.length, 5);
  assert.ok(files.books.every((book) => book.owner_id === "admin"));
  assert.equal(
    JSON.stringify(database),
    initial,
    "Browsing must not modify existing content.",
  );
  console.log(
    "PASS: bounded catalog RPC, normalized filters and existing admin/work queries with account-scoped data.",
  );
} finally {
  delete globalThis.fixtureApi;
}
