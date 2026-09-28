import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
export const tables = { series: ["id"], volumes: ["id"], books: ["id"], reading_progress: ["owner_id", "book_id"], reading_bookmarks: ["id"], favorites: ["owner_id", "series_id"], comments: ["id"], profiles: ["id"] };
export async function fileDigest(path) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes += chunk.length; }
  return { bytes, sha256: hash.digest("hex") };
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export async function tableInventory(client) {
  const result = {};
  for (const [table, keys] of Object.entries(tables)) {
    const hash = createHash("sha256");
    let count = 0;
    for (let offset = 0; ; offset += 500) {
      let query = client.from(table).select("*");
      for (const key of keys) query = query.order(key);
      const response = await query.range(offset, offset + 499);
      if (response.error) throw Error(`Cannot inventory ${table}.`);
      for (const row of response.data) { hash.update(JSON.stringify(stable(row)) + "\n"); count++; }
      if (response.data.length < 500) break;
    }
    result[table] = { count, sha256: hash.digest("hex") };
  }
  return result;
}
