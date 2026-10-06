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
        name: "isolated-supabase",
        setup(builder) {
          builder.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({
            path: "mock",
            namespace: "test",
          }));
          builder.onResolve({ filter: /^tus-js-client$/ }, () => ({
            path: "tus",
            namespace: "test",
          }));
          builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
            contents:
              path === "tus"
                ? "export class Upload {}"
                : 'export const BUCKET = "novels"; export function supabase() { return globalThis.testApi; }',
          }));
        },
      },
    ],
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
}
const { sortBooks, sortVolumes } = await load("src/lib/reader-navigation.ts");
const base = {
  created_at: "2026-01-01",
  volume_id: null,
  sort_order: 0,
  chapter_title: null,
  title: "Chapter",
};
const books = [12.5, 0, 2, 1].map((n) => ({
  ...base,
  id: String(n),
  chapter_number: n,
}));
assert.deepEqual(
  sortBooks(books, []).map((b) => b.chapter_number),
  [0, 1, 2, 12.5],
);
assert.equal(books[0].chapter_number, 12.5);
assert.deepEqual(
  sortVolumes(
    [2, 0, 1].map((n) => ({
      id: String(n),
      sort_order: 0,
      volume_number: n,
      created_at: base.created_at,
    })),
  ).map((v) => v.volume_number),
  [0, 1, 2],
);
const { extractReadingBlocks } = await load("src/lib/reader-text.ts");
const item = (str, y) => ({
  str,
  hasEOL: true,
  transform: [12, 0, 0, 12, 30, y],
  height: 12,
  width: 100,
});
const blocks = extractReadingBlocks(
  [
    item("Chapter 1", 760),
    item("An extraordinary journey", 720),
    item("continued across the valley.", 700),
    item("Page 1", 30),
  ],
  [0, 0, 600, 800],
);
assert.equal(blocks[0].kind, "heading");
assert.match(blocks[1].text, /journey continued/);
assert.ok(
  blocks.every(
    (b) => !b.text.includes("Page 1") && b.position >= 0 && b.position <= 1,
  ),
);
assert.deepEqual(
  extractReadingBlocks([null, { foo: 1 }], [0, 0, 600, 800]),
  [],
);
const urls = await load("src/lib/private-media-url.ts");
globalThis.testApi = {
  storage: {
    from: () => ({
      createSignedUrl: async (_, ttl) => ({
        data: { signedUrl: `https://example.invalid/media?ttl=${ttl}` },
        error: null,
      }),
    }),
  },
};
const before = Date.now();
const signed = await urls.createPrivateMediaUrl("novels", "test.pdf", 60);
assert.ok(
  signed.expiresAt >= before + 60000 && signed.expiresAt <= Date.now() + 60000,
);
assert.equal(urls.isPrivateMediaAuthorizationError({ status: 403 }), true);
assert.equal(urls.isPrivateMediaAuthorizationError({ status: 500 }), false);
globalThis.testApi.storage.from = () => ({
  createSignedUrl: async () => ({ data: null, error: { status: 403 } }),
});
await assert.rejects(urls.createPrivateMediaUrl("novels", "test.pdf"));
const { saveReadingProgress, ProgressConflictError } = await load(
  "src/lib/data/progress.ts",
);
const writes = [],
  releases = [];
globalThis.testApi = {
  from: (table) => ({
    upsert: (value) => {
      assert.equal(table, "reading_progress");
      assert.equal(value.owner_id, "a");
      assert.equal(value.book_id, "book");
      writes.push(value.page_number);
      return new Promise((resolve) => releases.push(resolve));
    },
  }),
};
const first = saveReadingProgress("a", "book", { page_number: 1 });
const second = saveReadingProgress("a", "book", { page_number: 2 });
await new Promise(setImmediate);
assert.deepEqual(writes, [1]);
releases.shift()({ data: "stamp-1", error: null });
await first;
await new Promise(setImmediate);
assert.deepEqual(writes, [1, 2]);
releases.shift()({ data: "stamp-2", error: null });
await second;
const failed = saveReadingProgress("a", "book", { page_number: 3 });
const rejected = assert.rejects(failed);
const recovery = saveReadingProgress("a", "book", { page_number: 4 });
await new Promise(setImmediate);
releases.shift()({ data: null, error: { message: "network" } });
await rejected;
await new Promise(setImmediate);
releases.shift()({ data: "stamp-4", error: null });
await recovery;
assert.deepEqual(writes, [1, 2, 3, 4]);
const stale = saveReadingProgress("a", "book", { page_number: 1 });
const conflict = assert.rejects(stale, ProgressConflictError);
await new Promise(setImmediate);
releases.shift()({ data: null, error: { code: "40001", message: "changed" } });
await conflict;

const { normalizeReaderPreferences } = await load(
  "src/lib/reader-preferences.ts",
);
assert.equal(normalizeReaderPreferences({ fontSize: 1000 }).fontSize, 32);
assert.equal(normalizeReaderPreferences({ fontSize: 1 }).fontSize, 16);
assert.equal(normalizeReaderPreferences({ fontSize: Number.NaN }).fontSize, 22);
assert.equal(
  normalizeReaderPreferences({ theme: "unknown", textWidth: 1, lineHeight: 0 })
    .textWidth,
  760,
);
const { patchProfileSettings } = await load("src/lib/data/preferences.ts");
let profile = {
  lineHeight: 2.05,
  textWidth: 820,
  comicMode: "page",
  futureSetting: "untouched",
};
const patches = [];
globalThis.testApi = {
  from: (table) => {
    assert.equal(table, "profiles");
    let update;
    const query = {
      select: () => query,
      eq: (column, value) => {
        assert.equal(column, "id");
        assert.equal(value, "a");
        return query;
      },
      update: (value) => {
        update = value;
        return query;
      },
      single: async () => {
        await new Promise(setImmediate);
        if (update) {
          patches.push(update.preferences);
          profile = update.preferences;
        }
        return { data: { preferences: profile }, error: null };
      },
    };
    return query;
  },
};
await Promise.all([
  patchProfileSettings("a", { fontSize: 25 }),
  patchProfileSettings("a", { theme: "sepia" }),
]);
assert.equal(patches[0].fontSize, 25);
assert.equal(patches[1].fontSize, 25);
assert.equal(patches[1].theme, "sepia");
assert.equal(profile.lineHeight, 2.05);
assert.equal(profile.futureSetting, "untouched");
const { parseCatalogContext, catalogContextKey } = await load(
  "src/lib/catalog-context.ts",
);
assert.notEqual(catalogContextKey("a", "/"), catalogContextKey("b", "/"));
assert.equal(
  parseCatalogContext('{"page":-1,"scroll":-20,"order":"bad"}').page,
  0,
);
assert.equal(parseCatalogContext("broken").order, "recent");
const { updateOwnedBooks } = await load("src/lib/data/admin.ts");
let affected = [];
globalThis.testApi = {
  from: () => {
    const query = {
      update: () => query,
      eq: () => query,
      in: () => query,
      select: async () => ({ data: affected, error: null }),
    };
    return query;
  },
};
await assert.rejects(
  updateOwnedBooks("a", ["one", "two"], { content_type: "chapter" }),
  /Alguns arquivos/,
);
affected = [{ id: "one" }];
await assert.rejects(
  updateOwnedBooks("a", ["one", "two"], { content_type: "chapter" }),
  /Alguns arquivos/,
);
affected = [{ id: "one" }, { id: "two" }];
await updateOwnedBooks("a", ["one", "two"], { content_type: "chapter" });

const { deleteSeriesAndMedia } = await load("src/lib/data/uploads.ts");
const media = Array.from({ length: 1005 }, (_, n) => ({
  id: String(n).padStart(5, "0"),
  file_path: `local/${n}.pdf`,
}));
const cleanupBatches = [];
let listingFailure = false,
  deleted = false;
globalThis.testApi = {
  from: (table) => {
    let after = "",
      deleting = false;
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      gt: (_, value) => {
        after = value;
        return query;
      },
      delete: () => {
        deleting = true;
        return query;
      },
      maybeSingle: async () => {
        assert.equal(deleting, true);
        deleted = true;
        return { data: { id: "work" }, error: null };
      },
      then: (resolve, reject) =>
        Promise.resolve({
          data: media.filter((book) => book.id > after).slice(0, 250),
          error: listingFailure ? { message: "local failure" } : null,
        }).then(resolve, reject),
    };
    assert.ok(["books", "series"].includes(table));
    return query;
  },
  storage: {
    from: (bucket) => ({
      remove: async (paths) => {
        assert.equal(deleted, true);
        cleanupBatches.push({ bucket, paths });
        return { error: null };
      },
    }),
  },
};
await deleteSeriesAndMedia("a", {
  id: "work",
  title: "Local",
  cover_path: "local/cover.png",
});
const removed = cleanupBatches
  .filter((batch) => batch.bucket === "novels")
  .flatMap((batch) => batch.paths);
assert.equal(removed.length, 1005);
assert.equal(new Set(removed).size, 1005);
assert.ok(cleanupBatches.every((batch) => batch.paths.length <= 100));
listingFailure = true;
deleted = false;
await assert.rejects(
  deleteSeriesAndMedia("a", { id: "work", title: "Local", cover_path: null }),
);
assert.equal(
  deleted,
  false,
  "Do not delete cascading records when the media listing fails.",
);

delete globalThis.testApi;
console.log(
  "PASS: navigation ordering, PDF text, private URL expiry/revocation and serialized progress recovery.",
);
