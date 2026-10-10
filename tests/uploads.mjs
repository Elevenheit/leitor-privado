import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/data/uploads.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "upload-boundaries",
      setup(builder) {
        builder.onResolve(
          { filter: /^(@\/lib\/supabase|tus-js-client)$/ },
          ({ path }) => ({ path, namespace: "mock" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
          contents:
            path === "tus-js-client"
              ? "export const Upload = globalThis.MockUpload;"
              : 'export const BUCKET = "novels"; export const supabase = () => globalThis.uploadApi;',
        }));
      },
    },
  ],
});
let options,
  started = 0,
  aborts = 0,
  abortFails = false,
  uploadFailure = null,
  inserts = 0;
const removed = [];
let sessionHook = () => {};
globalThis.MockUpload = class {
  constructor(file, config) {
    this.file = file;
    options = config;
  }
  async findPreviousUploads() {
    return [];
  }
  start() {
    started++;
  }
  async abort() {
    aborts++;
    if (abortFails) throw Error("termination offline");
  }
};
globalThis.uploadApi = {
  auth: {
    getSession: async () => {
      sessionHook();
      return { data: { session: { access_token: "fixture" } }, error: null };
    },
  },
  storage: {
    from: () => ({
      upload: async () => ({ error: uploadFailure }),
      remove: async (paths) => {
        removed.push(...paths);
        return { error: null };
      },
    }),
  },
  from: () => ({
    insert: async () => {
      inserts++;
      return { error: null };
    },
  }),
};
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
const { uploadStorageObject, uploadAndRegisterBook } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const file = new File(["%PDF-1.7\n"], "local.pdf", { lastModified: 123 });
uploadFailure = { status: 409, message: "The resource already exists" };
await assert.rejects(
  uploadStorageObject("novels", "existing.pdf", file, "application/pdf"),
);
assert.deepEqual(
  removed,
  [],
  "A failed non-upsert upload must never delete an existing object",
);
uploadFailure = null;

// Abort during session validation must prevent starting the transport.
const early = new AbortController();
sessionHook = () => early.abort();
await assert.rejects(
  uploadStorageObject("novels", "cancelled.pdf", file, "application/pdf", {
    resumable: true,
    signal: early.signal,
  }),
  { name: "AbortError" },
);
assert.equal(started, 0);
sessionHook = () => {};

// A failed TUS termination still settles cancellation, with no unhandled rejection.
abortFails = true;
const active = new AbortController();
const cancelled = uploadStorageObject(
  "novels",
  "active.pdf",
  file,
  "application/pdf",
  { resumable: true, signal: active.signal },
);
const cancellation = assert.rejects(cancelled, { name: "AbortError" });
await new Promise(setImmediate);
active.abort();
await cancellation;
await new Promise(setImmediate);
assert.equal(aborts, 1);
assert.deepEqual(removed, []);

abortFails = false;
const book = { owner_id: "admin", file_path: "new.pdf", title: "Local" };
const registering = uploadAndRegisterBook(book, file, "application/pdf", {
  resumable: true,
});
await new Promise(setImmediate);
assert.equal(
  inserts,
  0,
  "Catalog registration waits for real storage confirmation",
);
const firstFingerprint = await options.fingerprint(file, options);
options.onSuccess();
await registering;
assert.equal(inserts, 1);
const other = uploadStorageObject(
  "novels",
  "other.pdf",
  file,
  "application/pdf",
  { resumable: true },
);
await new Promise(setImmediate);
assert.notEqual(
  await options.fingerprint(file, options),
  firstFingerprint,
  "TUS resume must be scoped to the destination, not just the source file",
);
options.onSuccess();
await other;
delete globalThis.MockUpload;
delete globalThis.uploadApi;
console.log(
  "PASS: upload confirmation, safe conflict handling, destination-scoped resume and cancellation races.",
);
