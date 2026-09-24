// Read-only backup; credentials supplied only through the shell environment.
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
const env = process.env;
if (!env.NOOK_BACKUP_URL || !env.NOOK_BACKUP_SERVICE_KEY || !env.PGSERVICE)
  throw Error(
    "Set NOOK_BACKUP_URL, NOOK_BACKUP_SERVICE_KEY and PGSERVICE (pg_service.conf + pgpass), never NEXT_PUBLIC service keys.",
  );
const root = resolve("backups", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(root, { recursive: true });
const dump = spawnSync(
  "pg_dump",
  ["--format=custom", "--no-owner", "--file", resolve(root, "database.dump")],
  { stdio: ["ignore", "ignore", "pipe"], env },
);
if (dump.error || dump.status !== 0)
  throw Error(
    "Database backup failed. Inspect connection privately; no credentials logged.",
  );
const client = createClient(env.NOOK_BACKUP_URL, env.NOOK_BACKUP_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const manifest = [];
async function walk(bucket, prefix = "") {
  for (let offset = 0; ; offset += 100) {
    const r = await client.storage
      .from(bucket)
      .list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
    if (r.error) throw Error(`Cannot list backup bucket ${bucket}`);
    for (const item of r.data) {
      const key = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) {
        await walk(bucket, key);
        continue;
      }
      const target = resolve(root, "storage", bucket, key);
      const base = resolve(root, "storage", bucket) + sep;
      if (!target.startsWith(base)) throw Error("Unsafe storage object path");
      const f = await client.storage.from(bucket).download(key);
      if (f.error) throw Error(`Object backup failed in ${bucket}`);
      await mkdir(resolve(target, ".."), { recursive: true });
      const bytes = Buffer.from(await f.data.arrayBuffer());
      await writeFile(target, bytes);
      const { createHash } = await import("node:crypto");
      manifest.push({
        bucket,
        key,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    if (r.data.length < 100) break;
  }
}
for (const bucket of ["novels", "covers"]) await walk(bucket);
const buckets = await client.storage.listBuckets();
if (buckets.data?.some((b) => b.id === "profiles")) await walk("profiles");
await writeFile(
  resolve(root, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(
  `Read-only backup completed: ${manifest.length} objects. Keep the backups folder encrypted and outside Git.`,
);
