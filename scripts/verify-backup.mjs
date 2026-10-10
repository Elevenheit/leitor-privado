import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { fileDigest } from "./backup-inventory.mjs";
export async function verifyBackup(directory) {
  const root = await realpath(resolve(directory));
  const metadata = JSON.parse(await readFile(resolve(root, "backup.json"), "utf8"));
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  assert.equal(metadata.version, 1);
  const dump = resolve(root, "database.dump");
  assert.ok((await stat(dump)).size > 5, "Empty database dump");
  assert.deepEqual(await fileDigest(dump), metadata.database, "Database dump checksum mismatch");
  const seen = new Set();
  let bytes = 0;
  for (const object of manifest) {
    assert.ok(["novels", "covers", "profiles"].includes(object.bucket), "Unknown bucket");
    assert.ok(typeof object.key === "string" && !object.key.split(/[\\/]/).some(p => p === "..") && !/^[\\/]|:/.test(object.key), "Unsafe object path");
    const key = `${object.bucket}/${object.key}`;
    assert.ok(!seen.has(key), "Duplicate manifest object"); seen.add(key);
    const file = await realpath(resolve(root, "storage", object.bucket, object.key));
    assert.ok(file.startsWith(root + sep), "Object escapes backup directory");
    const actual = await fileDigest(file);
    assert.deepEqual(actual, { bytes: object.bytes, sha256: object.sha256 }, "Object checksum mismatch");
    bytes += actual.bytes;
  }
  assert.equal(manifest.length, metadata.objectCount);
  assert.equal(bytes, metadata.objectBytes);
  return { root, metadata, manifest };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw Error("Usage: node scripts/verify-backup.mjs <backup-directory>");
  const verified = await verifyBackup(process.argv[2]);
  const parsed = spawnSync("pg_restore", ["--list", resolve(verified.root, "database.dump")], { stdio: ["ignore", "ignore", "pipe"] });
  if (parsed.error || parsed.status !== 0) throw Error("pg_restore could not parse the dump. Install compatible PostgreSQL tools and verify the archive.");
  console.log(`PASS: readable dump, ${verified.manifest.length} objects, sizes and SHA-256 checksums.`);
}
