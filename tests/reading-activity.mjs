import assert from "node:assert/strict";
import { build } from "esbuild";
const bundled = await build({
  entryPoints: ["src/lib/reading-activity.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { continuingWorks, readingActivity } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
const entry = (id, seriesId, stamp, patch = {}) => ({
  book_id: id,
  updated_at: stamp,
  page_number: 9,
  page_count: 20,
  scroll_ratio: 0.4,
  completed: false,
  books: {
    media_type: "pdf",
    total_pages: 20,
    series: { id: seriesId, title: "Same title" },
  },
  ...patch,
});
const active = entry("chapter-new", "series-a", "2026-10-02");
const previous = entry("chapter-old", "series-a", "2026-10-01");
const completed = entry("finished", "series-a", "2026-10-03", {
  completed: true,
});
const other = entry("other", "series-b", "2026-09-30");
const openedOnly = entry("opened-only", "series-c", "2026-10-04", {
  page_number: 1,
  scroll_ratio: 0,
});
const finishedRatio = entry("at-end", "series-d", "2026-10-05", {
  scroll_ratio: 1,
});
const entries = [previous, completed, active, other, openedOnly, finishedRatio];
assert.deepEqual(
  continuingWorks(entries).map((x) => x.book_id),
  ["chapter-new", "other"],
);
assert.equal(
  entries[0],
  previous,
  "Grouping must not mutate the stored history",
);
assert.equal(continuingWorks([completed]).length, 0);
assert.equal(
  continuingWorks([previous, { ...active, completed: true }])[0].book_id,
  "chapter-old",
);
const crowdedHistory = Array.from({ length: 1200 }, (_, i) => ({
  ...completed,
  book_id: `completed-${i}`,
}));
assert.deepEqual(
  continuingWorks([...crowdedHistory, other]).map((x) => x.book_id),
  ["other"],
);
assert.equal(readingActivity(active, active.books).percent, 40);
assert.equal(
  readingActivity(
    { ...active, page_count: null, scroll_ratio: 1 },
    { media_type: "pdf" },
  ).inProgress,
  false,
  "A full-document end position is completed even without a known page count",
);
assert.equal(
  readingActivity({ ...active, page_count: null }, { media_type: "pdf" })
    .percent,
  null,
);
assert.equal(
  readingActivity(
    { ...active, page_number: 9, scroll_ratio: 0.5 },
    { media_type: "cbz", total_pages: 20 },
  ).percent,
  43,
);
assert.equal(
  readingActivity({ ...active, completed: true, scroll_ratio: 0 }, active.books)
    .inProgress,
  false,
  "Completion history survives rereading",
);
assert.equal(
  readingActivity(
    { ...active, page_number: 20, scroll_ratio: 1 },
    { media_type: "cbz", total_pages: 20 },
  ).completed,
  true,
);
console.log(
  "PASS: one pending chapter per series, latest position, completion exclusion, real progress, no invented totals, and history preservation.",
);
