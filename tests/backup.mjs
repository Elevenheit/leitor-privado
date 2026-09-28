import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { fileDigest } from "../scripts/backup-inventory.mjs";
import { verifyBackup } from "../scripts/verify-backup.mjs";
const root = await mkdtemp(join(tmpdir(), "nook-backup-test-"));
try {
  await mkdir(join(root, "storage", "novels"), { recursive: true });
  await writeFile(join(root, "database.dump"), "unit-test-file-only-not-real-pg-dump");
  const file = join(root, "storage", "novels", "fixture.pdf");
  await writeFile(file, "%PDF-test-fixture");
  const digest = await fileDigest(file);
  await writeFile(join(root, "manifest.json"), JSON.stringify([{ bucket: "novels", key: "fixture.pdf", ...digest }]));
  await writeFile(join(root, "backup.json"), JSON.stringify({ version: 1, database: await fileDigest(join(root, "database.dump")), objectCount: 1, objectBytes: digest.bytes }));
  await verifyBackup(root);
  await writeFile(file, "corrupted");
  await assert.rejects(verifyBackup(root));
  await rm(file);
  await assert.rejects(verifyBackup(root));
} finally { assert.ok(root.startsWith(join(tmpdir(), "nook-backup-test-"))); await rm(root, { recursive: true, force: true }); }
console.log("PASS: local backup file integrity and missing/corrupted object rejection; not a restore rehearsal.");
