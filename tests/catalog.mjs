import assert from "node:assert/strict";
import { pageWindow, catalogPage, catalogSearch } from "../src/lib/catalog.ts";
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
assert.throws(() => pageWindow(-1));
assert.throws(() => pageWindow(Infinity));
console.log("PASS: catalog empty, 1/24/25/101 items and search normalization.");
