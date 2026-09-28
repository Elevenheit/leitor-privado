import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
const { NOOK_BACKUP_URL: url, NOOK_BACKUP_SERVICE_KEY: key } = process.env;
if (!url || !key) throw Error("Configure server-side backup credentials; no request performed.");
const api = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const referenced = new Set();
for (let offset = 0; ; offset += 500) {
  const r = await api.from("profiles").select("id,avatar_path,banner_path").order("id").range(offset, offset + 499);
  if (r.error) throw Error("Could not read profile references; no cleanup performed.");
  for (const row of r.data) for (const path of [row.avatar_path, row.banner_path]) if (path) referenced.add(path);
  if (r.data.length < 500) break;
}
const candidates = [];
async function walk(prefix = "") {
  for (let offset = 0; ; offset += 100) {
    const r = await api.storage.from("profiles").list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (r.error) throw Error("Could not list profile objects; no cleanup performed.");
    for (const item of r.data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) { await walk(path); continue; }
      const updated = Date.parse(item.updated_at || item.created_at);
      if (!referenced.has(path) && Number.isFinite(updated) && updated < Date.now() - 86400000) candidates.push({ path, updatedAt: item.updated_at, bytes: item.metadata?.size });
    }
    if (r.data.length < 100) break;
  }
}
await walk();
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/profile-orphans.json", JSON.stringify({ generatedAt: new Date().toISOString(), project: new URL(url).hostname, candidates }, null, 2));
console.log(`Read-only report: ${candidates.length} unreferenced profile objects older than 24h. No objects deleted.`);
