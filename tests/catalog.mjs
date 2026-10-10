import assert from "node:assert/strict";
import {
  pageWindow,
  catalogPage,
  catalogSearch,
  normalizeSearchText,
} from "../src/lib/catalog.ts";
import {
  catalogSnapshot,
  invalidateCatalogSnapshot,
} from "../src/lib/data/catalog-cache.ts";
for (const count of [0, 1, 24, 25, 101]) {
  const rows = Array.from({ length: count }, (_, id) => ({ id }));
  const visited = [];
  for (let page = 0; ; page++) {
    const { from, to } = pageWindow(page);
    const result = catalogPage(rows.slice(from, to + 1));
    visited.push(...result.items);
    assert.equal(result.hasMore, count > from + 24);
    if (!result.hasMore) break;
  }
  assert.deepEqual(visited, rows);
}
assert.equal(catalogSearch("  %missing_  "), "missing");
assert.equal(
  normalizeSearchText(catalogSearch("  AÇÃO   entre\tPÁGINAS  ")),
  "acao entre paginas",
);
assert.equal(normalizeSearchText("Cafe\u0301"), "cafe");
assert.throws(() => pageWindow(-1));
assert.throws(() => pageWindow(Infinity));
let queries = 0;
const load = async () => {
  queries++;
  return ["catalog", "books", "progress", "favorites"];
};
await Promise.all([
  catalogSnapshot("reader-a", load),
  catalogSnapshot("reader-a", load),
]);
await catalogSnapshot("reader-a", load);
assert.equal(
  queries,
  1,
  "Searching and changing pages reuse one account-scoped query snapshot",
);
await catalogSnapshot("reader-b", load);
assert.equal(
  queries,
  2,
  "Account changes cannot reuse another account's results",
);
invalidateCatalogSnapshot();
await catalogSnapshot("reader-b", load);
assert.equal(queries, 3, "Mutations invalidate the snapshot");
invalidateCatalogSnapshot();
console.log("PASS: catalog empty, 1/24/25/101 items and search normalization.");
