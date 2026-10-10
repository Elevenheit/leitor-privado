import assert from "node:assert/strict";
import { build } from "esbuild";

const storage = new Map();
globalThis.localStorage = {
  get length() {
    return storage.size;
  },
  key: (index) => [...storage.keys()][index] || null,
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
let remote = null,
  failure = null;
let reading = async () => {};
let writing = async () => {};
let enforceOrder = false;
const writes = [];
globalThis.progressTestApi = {
  from: () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => {
        const result = { data: remote, error: failure };
        await reading();
        return result;
      },
      upsert: async (row) => {
        writes.push(row);
        const result = { data: null, error: failure };
        await writing();
        if (enforceOrder && remote && row.updated_at < remote.updated_at)
          return {
            data: null,
            error: { code: "40001", message: "newer position" },
          };
        if (!result.error) remote = row;
        return result;
      },
    };
    return query;
  },
};
const bundled = await build({
  entryPoints: ["src/lib/data/progress.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "local-progress-only",
      setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({
          path: "mock",
          namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: "export const supabase = () => globalThis.progressTestApi;",
        }));
      },
    },
  ],
});
const {
  saveReadingProgress,
  loadReadingProgress,
  syncPendingProgress,
  ProgressConflictError,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
failure = { message: "Failed to fetch", code: "FETCH" };
assert.deepEqual(
  await saveReadingProgress("reader-a", "chapter", {
    page_number: 15,
    scroll_ratio: 0.4,
    page_count: 150,
    page_offset: 0.2,
    text_offset: 145,
  }),
  { synced: false },
);
assert.equal(
  (await loadReadingProgress("reader-a", "chapter")).page_number,
  15,
);
await assert.rejects(loadReadingProgress("reader-b", "chapter"));
const localKey = "nook-progress:v1:reader-a:chapter";
assert.equal(JSON.parse(storage.get(localKey)).pending, true);
failure = null;
await syncPendingProgress("reader-a");
assert.equal(remote.page_number, 15);
assert.equal(remote.text_offset, 145);
assert.equal(
  remote.page_offset,
  0.2,
  "Precision must survive a replay and another device",
);
assert.equal("pending" in remote, false);
assert.equal("text_offset" in remote, true);
assert.equal(JSON.parse(storage.get(localKey)).text_offset, 145);
// A second browser with no local cache receives the precise remote anchor.
storage.delete(localKey);
const remoteResume = await loadReadingProgress("reader-a", "chapter");
assert.equal(remoteResume.page_offset, 0.2);
assert.equal(remoteResume.text_offset, 145);
assert.equal(remoteResume.page_number, 15);
assert.equal(JSON.parse(storage.get(localKey)).pending, false);

await saveReadingProgress("reader-a", "chapter", {
  completed: true,
  page_number: 150,
  scroll_ratio: 1,
});
await saveReadingProgress("reader-a", "chapter", {
  completed: false,
  page_number: 1,
  scroll_ratio: 0,
});
assert.equal(remote.completed, true, "Rereading retains completion history");

failure = { message: "network", code: "FETCH" };
await saveReadingProgress("reader-a", "chapter", { page_number: 2 });
remote = {
  ...remote,
  page_number: 20,
  updated_at: new Date(Date.now() + 60000).toISOString(),
};
failure = null;
const count = writes.length;
await syncPendingProgress("reader-a");
assert.equal(
  writes.length,
  count,
  "An older outbox entry must not overwrite a newer device",
);
assert.equal(
  (await loadReadingProgress("reader-a", "chapter")).page_number,
  20,
);

failure = { message: "changed", code: "40001" };
await assert.rejects(
  saveReadingProgress("reader-a", "chapter", { page_number: 1 }),
  ProgressConflictError,
);
assert.equal(
  storage.has(localKey),
  false,
  "Conflict recovery must fetch the remote position",
);
failure = { message: "forbidden", code: "42501" };
await assert.rejects(
  saveReadingProgress("reader-a", "chapter", { page_number: 3 }),
  /autorização/,
);

storage.set(localKey, "not json");
failure = null;
remote = null;
assert.equal(await loadReadingProgress("reader-a", "chapter"), null);

// A delayed GET must not replace a position saved while it was in flight.
await saveReadingProgress("reader-a", "chapter", { page_number: 10 });
storage.delete(localKey);
let releaseRead;
reading = () =>
  new Promise((resolve) => {
    releaseRead = resolve;
  });
const delayedLoad = loadReadingProgress("reader-a", "chapter");
await saveReadingProgress("reader-a", "chapter", { page_number: 29 });
releaseRead();
assert.equal((await delayedLoad).page_number, 29);
assert.equal(JSON.parse(storage.get(localKey)).page_number, 29);
reading = async () => {};

failure = { message: "network", code: "FETCH" };
await saveReadingProgress("reader-a", "chapter", { page_number: 30 });
failure = null;
const beforeReplay = writes.length;
await Promise.all([
  syncPendingProgress("reader-a"),
  syncPendingProgress("reader-a"),
]);
assert.equal(
  writes.length - beforeReplay,
  1,
  "Concurrent online/mount events share one outbox replay",
);

// A second device can save after the replay's GET but before its UPSERT.
failure = { message: "network", code: "FETCH" };
await saveReadingProgress("reader-a", "chapter", { page_number: 31 });
const offlinePosition = JSON.parse(storage.get(localKey));
failure = null;
await new Promise((resolve) => setTimeout(resolve, 10));
reading = async () => {
  remote = {
    ...remote,
    page_number: 45,
    updated_at: new Date(
      Date.parse(offlinePosition.updated_at) + 1,
    ).toISOString(),
  };
};
enforceOrder = true;
await assert.rejects(syncPendingProgress("reader-a"), ProgressConflictError);
assert.equal(
  remote.page_number,
  45,
  "Replay must retain the original reading timestamp so the DB rejects stale offline positions",
);
assert.equal(writes.at(-1).updated_at, offlinePosition.updated_at);
reading = async () => {};
enforceOrder = false;

// An older queued conflict must not remove newer reading from the local outbox.
let releaseWrite;
writing = () =>
  new Promise((resolve) => {
    releaseWrite = resolve;
  });
failure = { message: "changed", code: "40001" };
const olderWrite = saveReadingProgress("reader-a", "chapter", {
  page_number: 46,
});
const olderConflict = assert.rejects(olderWrite, ProgressConflictError);
await new Promise(setImmediate);
failure = null;
const newerWrite = saveReadingProgress("reader-a", "chapter", {
  page_number: 47,
});
writing = async () => {};
releaseWrite();
await olderConflict;
await newerWrite;
assert.equal(JSON.parse(storage.get(localKey)).page_number, 47);
assert.equal(remote.page_number, 47);
console.log(
  "PASS: durable offline progress, account isolation, replay timestamp/races, newer-device protection, remote precision, completion and queued conflict recovery.",
);
delete globalThis.localStorage;
delete globalThis.progressTestApi;
