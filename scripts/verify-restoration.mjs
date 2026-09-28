import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { verifyBackup } from "./verify-backup.mjs";
import { tableInventory } from "./backup-inventory.mjs";
const env = process.env;
if (!env.NOOK_TEST_URL || !env.NOOK_TEST_SERVICE_KEY || !env.NOOK_TEST_PROJECT_REF || !env.NOOK_PRODUCTION_PROJECT_REF || !process.argv[2]) throw Error("Missing isolated restoration configuration. No network request performed.");
const host = new URL(env.NOOK_TEST_URL).hostname;
if (host !== `${env.NOOK_TEST_PROJECT_REF}.supabase.co` || env.NOOK_TEST_PROJECT_REF === env.NOOK_PRODUCTION_PROJECT_REF) throw Error("Restoration target must be isolated from production.");
const backup = await verifyBackup(process.argv[2]);
const client = createClient(env.NOOK_TEST_URL, env.NOOK_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
assert.deepEqual(await tableInventory(client), backup.metadata.tables, "Restored table counts/content differ");
const expected = new Map(backup.manifest.map(item => [`${item.bucket}/${item.key}`, item]));
let found = 0;
async function walk(bucket, prefix = "") {
  for (let offset = 0; ; offset += 100) {
    const response = await client.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (response.error) throw Error("Cannot inventory restored Storage.");
    for (const item of response.data) {
      const key = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) { await walk(bucket, key); continue; }
      const reference = expected.get(`${bucket}/${key}`);
      assert.ok(reference, "Unexpected restored object");
      const response = await client.storage.from(bucket).download(key);
      if (response.error) throw Error("Cannot read restored object.");
      const bytes = new Uint8Array(await response.data.arrayBuffer());
      assert.equal(bytes.length, reference.bytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), reference.sha256);
      found++;
    }
    if (response.data.length < 100) break;
  }
}
for (const bucket of ["novels", "covers", "profiles"]) await walk(bucket);
assert.equal(found, expected.size);
console.log("PASS: isolated restored database and Storage match the backup. Read-only comparison.");
