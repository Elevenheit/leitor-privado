// Interactive, loopback-only demo. Real application + migrations; simulated HTTP/Auth/Storage.
// No Supabase connection, persistent database, real credentials or production configuration.
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { originalPdf } from "./ui/original-pdf.mjs";

const API = "http://127.0.0.1:54321";
const ORIGIN = "http://127.0.0.1:3100";
const MAX_UPLOAD = 20 * 1024 * 1024;
const db = new PGlite();
const uuid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = uuid(1),
  reader = uuid(2);
const objects = new Map(),
  signed = new Map(),
  uploads = new Map();
const accounts = new Map([
  ["admin@example.test", admin],
  ["leitor@example.test", reader],
]);
await db.exec(`create role authenticated; create role anon; create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,allowed_mime_types text[],file_size_limit bigint);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
create function storage.extension(text) returns text language sql as $$ select reverse(split_part(reverse($1),'.',1)) $$;
insert into auth.users values('${admin}','admin@example.test');`);
for (const path of [
  "supabase/schema.sql",
  "supabase/migrations/002_library_structure.sql",
  "supabase/migrations/004_reader_productivity.sql",
  "supabase/migrations/005_closed_beta.sql",
  "supabase/migrations/006_visible_series_comments.sql",
  "supabase/migrations/007_storage_visibility.sql",
  "supabase/migrations/008_nonnegative_catalog_numbers.sql",
  "supabase/migrations/009_reader_navigation.sql",
  "supabase/migrations/010_comment_report_rate_limit.sql",
  "supabase/migrations/011_profile_storage_privacy.sql",
  "supabase/migrations/012_reading_only.sql",
  "supabase/migrations/013_progress_order.sql",
  "supabase/migrations/014_open_registration.sql",
  "supabase/migrations/015_reader_anchors.sql",
  "supabase/migrations/016_catalog_pagination.sql",
])
  await db.exec(readFileSync(path, "utf8"));
await db.exec(`grant usage on schema public,auth,storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
grant execute on function auth.uid() to authenticated;
update beta_access set role='admin' where user_id='${admin}';
insert into beta_invites(email,expires_at) values('leitor@example.test',now()+interval '7 days'),('convidado@example.test',now()+interval '7 days');
insert into auth.users values('${reader}','leitor@example.test');
update profiles set nickname='bibliotecario',display_name='Meu canto de leitura',bio='Uma biblioteca de demonstração para explorar com calma.',preferences='{"fontSize":22,"lineHeight":1.85,"textWidth":760}' where id='${admin}';
update profiles set nickname='leitor_nook',display_name='Leitor de demonstração' where id='${reader}';`);

function cover(title, n) {
  const safe = title.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const color = ["#735439", "#3e6365", "#665d48", "#705057"][n % 4];
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="460"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#211d19"/></linearGradient></defs><rect width="320" height="460" fill="url(#g)"/><rect x="18" y="18" width="284" height="424" fill="none" stroke="#d6b185" opacity=".5"/><circle cx="160" cy="166" r="70" fill="none" stroke="#d6b185" opacity=".5"/><path d="M70 220 Q160 100 250 220 M70 230 Q160 110 250 230" fill="none" stroke="#d6b185" opacity=".5"/><text x="160" y="318" text-anchor="middle" fill="#eee7dc" font-family="Georgia" font-size="24">nook.</text><text x="160" y="350" text-anchor="middle" fill="#d6b185" font-size="10">DEMONSTRAÇÃO LOCAL · ${n + 1}</text><title>${safe}</title></svg>`,
  );
}
const names = [
  "A biblioteca das estrelas esquecidas",
  "Cartas de outono",
  "A cidade entre páginas",
  "Depois da última estrela",
  "O jardim das palavras",
  "O atlas dos dias",
  "Pequenas constelações",
  "Um inverno inteiro",
  "A casa de papel",
  "Entre rios e montanhas",
];
const pdf = originalPdf({ outline: true }),
  cbz = readFileSync("tests/fixtures/nook-original.cbz");
async function seedObject(bucket, path, bytes, type) {
  objects.set(`${bucket}/${path}`, { bytes, type });
  await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
    bucket,
    path,
  ]);
}
for (let n = 0; n < 30; n++) {
  const id = uuid(100 + n),
    format = ["novel", "manga", "manhwa"][n % 3];
  const title =
    names[n] || `História ${String(n + 1).padStart(2, "0")} — Novos caminhos`;
  const path = n === 1 ? null : `${admin}/${id}/cover.svg`;
  await db.query(
    "insert into series(id,owner_id,title,description,format,cover_path,beta_visible,rights_note,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,now()-($9||' hours')::interval)",
    [
      id,
      admin,
      title,
      "Uma história original de demonstração. Explore volumes, capítulos e ajustes de leitura. Os arquivos são fixtures locais; não representam uma publicação real.",
      format,
      path,
      n < 27,
      "Conteúdo original de teste local",
      String(n),
    ],
  );
  if (path && n !== 2)
    await seedObject("covers", path, cover(title, n), "image/svg+xml");
  const volume = uuid(200 + n);
  await db.query(
    "insert into volumes(id,owner_id,series_id,title,volume_number,sort_order) values($1,$2,$3,'Um novo começo',1,1000)",
    [volume, admin, id],
  );
  const count = n === 0 ? 105 : 3;
  for (let chapter = 0; chapter < count; chapter++) {
    const book = uuid(1000 + n * 200 + chapter),
      isPdf = format === "novel";
    const filePath = `${admin}/${id}/${book}.${isPdf ? "pdf" : "cbz"}`;
    await db.query(
      "insert into books(id,owner_id,series_id,volume_id,title,chapter_number,chapter_title,original_filename,file_path,media_type,size_bytes,total_pages,sort_order) values($1,$2,$3,$4,$5,$6,$5,$7,$8,$9,$10,$11,$12)",
      [
        book,
        admin,
        id,
        volume,
        chapter === 0
          ? "Prólogo — Um lugar para voltar"
          : `Capítulo ${chapter} — Entre livros e novos caminhos`,
        chapter,
        `local-${chapter}.${isPdf ? "pdf" : "cbz"}`,
        filePath,
        isPdf ? "pdf" : "cbz",
        isPdf ? pdf.length : cbz.length,
        isPdf ? 2 : 3,
        chapter * 1000,
      ],
    );
    await seedObject(
      "novels",
      filePath,
      isPdf ? pdf : cbz,
      isPdf ? "application/pdf" : "application/zip",
    );
    if (chapter === 0 && n < 5)
      for (const owner of [admin, reader])
        await db.query(
          "insert into reading_progress(owner_id,book_id,page_number,line_index,scroll_ratio,reading_mode,completed,page_count,updated_at) values($1,$2,1,0,0.2,$3,false,$4,now()-($5||' minutes')::interval)",
          [owner, book, isPdf ? "text" : "page", isPdf ? 2 : 3, String(n * 10)],
        );
  }
}
for (const owner of [admin, reader])
  for (const work of [uuid(100), uuid(101)])
    await db.query("insert into favorites(owner_id,series_id) values($1,$2)", [
      owner,
      work,
    ]);
await db.query(
  "insert into comments(series_id,owner_id,body) values($1,$2,$3)",
  [
    uuid(100),
    reader,
    "Este comentário também é fictício. Você pode testar respostas, spoilers e moderação.",
  ],
);

const tables = new Set([
  "series",
  "books",
  "volumes",
  "profiles",
  "profile_identities",
  "beta_access",
  "reading_progress",
  "favorites",
  "reading_bookmarks",
  "comments",
  "comment_reports",
]);
const columns = new Map();
for (const table of tables)
  columns.set(
    table,
    new Set(
      (
        await db.query(
          "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
          [table],
        )
      ).rows.map((row) => row.column_name),
    ),
  );
const primary = {
  favorites: ["owner_id", "series_id"],
  reading_progress: ["owner_id", "book_id"],
  comment_reports: ["owner_id", "comment_id"],
  beta_access: ["user_id"],
};
const functions = {
  browse_catalog: [
    "search_term",
    "filter_format",
    "reading_state",
    "sort_by",
    "favorites_only",
    "page_index",
  ],
  reader_work_page: ["target_series_id", "page_index"],
  admin_library_page: ["search_term", "favorites_only", "page_index"],
  admin_books_page: ["search_term", "page_index"],
  patch_profile_settings: ["settings", "identity_fields"],
  save_reading_position: [
    "target_book_id",
    "reading_position",
    "expected_updated_at",
  ],
  reader_navigation_neighbors: ["target_book_id"],
  browse_catalog: [
    "page_index",
    "filter_format",
    "favorites_only",
    "search_term",
    "reading_state",
    "sort_by",
    "pending_positions",
  ],
  beta_admin: [],
  beta_member: [],
};
function userRecord(id) {
  const email = [...accounts].find(([, value]) => value === id)?.[0];
  return email
    ? {
        id,
        email,
        aud: "authenticated",
        role: "authenticated",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z",
      }
    : null;
}
function session(id) {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp, demo: true })).toString("base64url")}.local-demo`,
    refresh_token: id,
    expires_in: 86400,
    expires_at: exp,
    token_type: "bearer",
    user: userRecord(id),
  };
}
function requestUser(req) {
  try {
    const payload = JSON.parse(
      Buffer.from((req.headers.authorization || "").split(".")[1], "base64url"),
    );
    return payload.demo && userRecord(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}
async function asUser(id, run) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}
function matches(row, params) {
  for (const [key, expression] of params) {
    if (!(key in row)) continue;
    const dot = expression.indexOf("."),
      op = expression.slice(0, dot),
      value = expression.slice(dot + 1);
    const actual = row[key];
    if (op === "eq" && String(actual) !== value) return false;
    if (op === "neq" && String(actual) === value) return false;
    if (op === "gt" && !(actual > value)) return false;
    if (
      op === "is" &&
      (value === "null" ? actual !== null : String(actual) !== value)
    )
      return false;
    if (
      op === "in" &&
      !value
        .slice(1, -1)
        .split(",")
        .map((v) => v.replaceAll('"', ""))
        .includes(String(actual))
    )
      return false;
    if (
      op === "ilike" &&
      !String(actual || "")
        .toLowerCase()
        .includes(value.replaceAll("%", "").replaceAll("*", "").toLowerCase())
    )
      return false;
  }
  return true;
}
async function rest(req, url, body, send) {
  const table = url.pathname.split("/").at(-1);
  if (!tables.has(table))
    return send({ message: "Recurso fora da demonstração." }, 404);
  let rows = (await db.query(`select * from public.${table}`)).rows;
  if (
    table === "reading_progress" &&
    url.searchParams.get("select")?.includes("books!inner")
  ) {
    const books = (await db.query("select * from books")).rows,
      works = (await db.query("select * from series")).rows,
      volumes = (await db.query("select * from volumes")).rows;
    rows = rows
      .map((row) => {
        const book = books.find((book) => book.id === row.book_id);
        return {
          ...row,
          books: book && {
            ...book,
            series: works.find((work) => work.id === book.series_id),
            volumes:
              volumes.find((volume) => volume.id === book.volume_id) || null,
          },
        };
      })
      .filter(
        (row) =>
          row.books?.series &&
          (!url.searchParams.has("books.series.format") ||
            `eq.${row.books.series.format}` ===
              url.searchParams.get("books.series.format")),
      );
  }
  rows = rows.filter((row) => matches(row, url.searchParams));
  const keys = primary[table] || ["id"];
  if (["PATCH", "DELETE"].includes(req.method)) {
    const changed = [];
    const fields = req.method === "PATCH" ? Object.keys(body) : [];
    if (fields.some((key) => !columns.get(table).has(key)))
      return send({ message: "Campo inválido." }, 400);
    for (const row of rows) {
      const values = fields.map((key) => body[key]);
      const where = keys
        .map((key) => {
          values.push(row[key]);
          return `${key}=$${values.length}`;
        })
        .join(" and ");
      const statement =
        req.method === "DELETE"
          ? `delete from ${table} where ${where} returning *`
          : `update ${table} set ${fields.map((key, n) => `${key}=$${n + 1}`).join(",")} where ${where} returning *`;
      changed.push(...(await db.query(statement, values)).rows);
    }
    rows = changed;
  } else if (req.method === "POST") {
    rows = [];
    for (const item of Array.isArray(body) ? body : [body]) {
      const fields = Object.keys(item);
      if (!fields.length || fields.some((key) => !columns.get(table).has(key)))
        return send({ message: "Campo inválido." }, 400);
      const upsert = req.headers.prefer?.includes("resolution=merge-duplicates")
        ? ` on conflict(${keys.join(",")}) do update set ${fields.map((key) => `${key}=excluded.${key}`).join(",")}`
        : "";
      rows.push(
        ...(
          await db.query(
            `insert into ${table}(${fields.join(",")}) values(${fields.map((_, n) => `$${n + 1}`).join(",")})${upsert} returning *`,
            fields.map((key) => item[key]),
          )
        ).rows,
      );
    }
  }
  const order = (url.searchParams.get("order") || "")
    .split(",")
    .filter(Boolean);
  rows.sort((a, b) => {
    for (const part of order) {
      const [key, direction] = part.split(".");
      const comparison =
        a[key] == null
          ? b[key] == null
            ? 0
            : 1
          : b[key] == null
            ? -1
            : a[key] < b[key]
              ? -1
              : a[key] > b[key]
                ? 1
                : 0;
      if (comparison) return direction === "desc" ? -comparison : comparison;
    }
    return 0;
  });
  const total = rows.length;
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  rows = rows.slice(
    offset,
    offset + Math.min(1000, Number(url.searchParams.get("limit") || 1000)),
  );
  if (req.headers.accept?.includes("vnd.pgrst.object")) {
    if (rows.length !== 1)
      return send(
        {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: `The result contains ${rows.length} rows`,
        },
        406,
      );
    return send(rows[0]);
  }
  return send(rows, 200, {
    "Content-Range": `${offset}-${offset + rows.length - 1}/${total}`,
  });
}
async function storeObject(id, bucket, name, bytes, type) {
  if (
    !["novels", "covers", "profiles"].includes(bucket) ||
    !name.startsWith(`${id}/`)
  )
    throw Error("Destino inválido.");
  await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
    bucket,
    name,
  ]);
  objects.set(`${bucket}/${name}`, { bytes, type });
}
async function storage(req, url, bytes, id, send) {
  const parts = decodeURIComponent(url.pathname).split("/");
  if (parts[3] === "upload" && parts[4] === "resumable") {
    if (req.method === "OPTIONS") return send(null, 204);
    let upload = uploads.get(parts[5]);
    if (req.method === "POST") {
      const metadata = Object.fromEntries(
        (req.headers["upload-metadata"] || "")
          .split(",")
          .filter(Boolean)
          .map((part) => {
            const [key, value] = part.trim().split(" ");
            return [key, Buffer.from(value || "", "base64").toString()];
          }),
      );
      const length = Number(req.headers["upload-length"]);
      if (!Number.isSafeInteger(length) || length <= 0 || length > MAX_UPLOAD)
        return send(
          { message: "A demonstração aceita uploads de até 20 MB." },
          413,
        );
      upload = {
        id: randomUUID(),
        owner: id,
        bucket: metadata.bucketName,
        path: metadata.objectName,
        type: metadata.contentType,
        length,
        chunks: [],
        offset: 0,
      };
      uploads.set(upload.id, upload);
    }
    if (!upload || upload.owner !== id)
      return send({ message: "Upload não encontrado." }, 404);
    if (req.method === "DELETE") {
      uploads.delete(upload.id);
      return send(null, 204);
    }
    if (["POST", "PATCH"].includes(req.method)) {
      if (
        req.method === "PATCH" &&
        Number(req.headers["upload-offset"]) !== upload.offset
      )
        return send({ message: "Offset inválido." }, 409);
      upload.chunks.push(bytes);
      upload.offset += bytes.length;
      if (upload.offset > upload.length)
        return send({ message: "Tamanho inválido." }, 413);
      if (upload.offset === upload.length && !upload.finished) {
        await storeObject(
          id,
          upload.bucket,
          upload.path,
          Buffer.concat(upload.chunks),
          upload.type,
        );
        upload.finished = true;
        upload.chunks = [];
      }
    }
    return send(
      null,
      req.method === "POST" ? 201 : req.method === "PATCH" ? 204 : 200,
      {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(upload.offset),
        "Upload-Length": String(upload.length),
        Location: `${API}/storage/v1/upload/resumable/${upload.id}`,
      },
    );
  }
  const signing = parts[4] === "sign";
  const bucket = parts[signing ? 5 : 4],
    path = parts.slice(signing ? 6 : 5).join("/");
  if (signing) {
    const visible = (
      await db.query(
        "select name from storage.objects where bucket_id=$1 and name=$2",
        [bucket, path],
      )
    ).rows.length;
    const object = objects.get(`${bucket}/${path}`);
    if (!visible || !object)
      return send({ message: "Objeto indisponível." }, 404);
    if (req.method === "POST") {
      const token = randomUUID();
      signed.set(token, { id, bucket, path, expires: Date.now() + 3600000 });
      return send({
        signedURL: `/object/sign/${bucket}/${path}?token=${token}`,
      });
    }
    return send(object.bytes, 200, {
      "Content-Type": object.type,
      "Cache-Control": "no-store",
    });
  }
  if (req.method === "DELETE") {
    const body = JSON.parse(bytes.toString() || "{}");
    for (const name of body.prefixes || []) {
      const removed = await db.query(
        "delete from storage.objects where bucket_id=$1 and name=$2 returning name",
        [bucket, name],
      );
      if (removed.rows.length) objects.delete(`${bucket}/${name}`);
    }
    return send([]);
  }
  if (["POST", "PUT"].includes(req.method)) {
    await storeObject(id, bucket, path, bytes, req.headers["content-type"]);
    return send({ Key: `${bucket}/${path}` });
  }
  return send({ message: "Operação fora da demonstração." }, 501);
}
let queue = Promise.resolve();
const apiServer = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization,apikey,content-type,x-client-info,x-supabase-api-version,accept-profile,content-profile,x-retry-count,prefer,range,range-unit,tus-resumable,upload-length,upload-metadata,upload-offset,x-upsert,cache-control",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Range,Location,Tus-Resumable,Upload-Offset,Upload-Length",
  );
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.headers.origin && req.headers.origin !== ORIGIN) {
    res.writeHead(403);
    res.end();
    return;
  }
  const send = (data, status = 200, headers = {}) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    });
    res.end(
      req.method === "HEAD" || data == null
        ? undefined
        : Buffer.isBuffer(data)
          ? data
          : JSON.stringify(data),
    );
  };
  let bytes;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_UPLOAD)
        throw Error("Upload excede os 20 MB da demonstração.");
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  } catch {
    return send({ message: "Upload excede o limite da demonstração." }, 413);
  }
  queue = queue
    .catch(() => undefined)
    .then(async () => {
      try {
        const url = new URL(req.url, API);
        const body =
          req.headers["content-type"]?.includes("application/json") &&
          bytes.length
            ? JSON.parse(bytes.toString())
            : {};
        let id = requestUser(req);
        if (url.pathname.startsWith("/auth/v1/")) {
          if (url.pathname.endsWith("/logout")) return send({});
          // These acknowledge UI flows only; this local service never sends e-mail.
          if (
            url.pathname.endsWith("/recover") ||
            url.pathname.endsWith("/resend")
          )
            return send({});
          if (url.pathname.endsWith("/signup")) {
            const email = String(body.email || "").toLowerCase();
            if (!email.includes("@") || accounts.has(email))
              return send(
                {
                  message: "Confira o e-mail ou use Entrar.",
                  code: "user_already_exists",
                },
                400,
              );
            id = randomUUID();
            await db.query("insert into auth.users(id,email) values($1,$2)", [
              id,
              email,
            ]);
            accounts.set(email, id);
            return send(session(id));
          }
          if (url.pathname.endsWith("/token")) {
            id =
              accounts.get(String(body.email || "").toLowerCase()) ||
              (userRecord(body.refresh_token) && body.refresh_token);
            return id
              ? send(session(id))
              : send(
                  {
                    message: "Use uma conta fictícia da página /__demo.",
                    code: "invalid_credentials",
                  },
                  400,
                );
          }
          if (url.pathname.endsWith("/user"))
            return id
              ? send(userRecord(id))
              : send({ message: "Sessão fictícia ausente." }, 401);
          return send(
            { message: "Operação de Auth fora da demonstração." },
            501,
          );
        }
        if (url.pathname.includes("/object/sign/") && req.method !== "POST") {
          const grant = signed.get(url.searchParams.get("token"));
          if (
            !grant ||
            grant.expires < Date.now() ||
            !url.pathname.endsWith(`/${grant.bucket}/${grant.path}`)
          )
            return send({ message: "URL fictícia inválida." }, 403);
          id = grant.id;
        }
        if (!id)
          return send(
            { message: "Entre com uma conta fictícia da demonstração." },
            401,
          );
        return await asUser(id, async () => {
          if (url.pathname.startsWith("/rest/v1/rpc/")) {
            const name = url.pathname.split("/").at(-1),
              args = functions[name];
            if (!args)
              return send({ message: "RPC fora da demonstração." }, 404);
            const supplied = args.filter((key) => Object.hasOwn(body, key));
            const call = `public.${name}(${supplied.map((key, n) => `${key} => $${n + 1}`).join(",")})`;
            const result = await db.query(
              name === "reader_navigation_neighbors"
                ? `select * from ${call}`
                : `select ${call} as value`,
              supplied.map((key) => body[key]),
            );
            if (name === "reader_navigation_neighbors")
              return send(result.rows);
            return send(
              result.rows.length === 1
                ? result.rows[0].value
                : result.rows.map((row) => row.value),
            );
          }
          if (url.pathname.startsWith("/rest/v1/"))
            return rest(req, url, body, send);
          if (url.pathname.startsWith("/storage/v1/"))
            return storage(req, url, bytes, id, send);
          return send({ message: "Rota fora da demonstração." }, 404);
        });
      } catch (error) {
        send(
          {
            message: error.message || "Falha local.",
            code: error.code || "DEMO",
          },
          error.code === "42501" ? 403 : 400,
        );
      }
    });
});

const portal = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nook — demonstração local</title><style>body{margin:0;background:#151412;color:#eee7dc;font:16px/1.6 system-ui}main{max-width:800px;margin:auto;padding:40px 24px}h1,h2{font-family:Georgia;font-weight:400}h1{font-size:42px}a,button{color:#d6b185}button{background:#25221e;border:1px solid #65513b;border-radius:6px;padding:14px 18px;font:inherit;cursor:pointer;margin:0 8px 12px 0}code{color:#d6b185}li{margin:9px 0}.note{padding:16px;border:1px solid #65513b;border-radius:8px}a:focus-visible,button:focus-visible{outline:2px solid #d6b185;outline-offset:4px}</style><main><h1>nook. <small style="font:14px system-ui;color:#d6b185">Demonstração local</small></h1><p>Aplicação real com dados fictícios, banco temporário e serviços simulados no computador. As alterações somem ao encerrar o processo.</p><button data-email="admin@example.test">Entrar como administração</button><button data-email="leitor@example.test">Entrar como leitor</button><p id="status" role="status"></p><h2>O que explorar</h2><ol><li><a href="/">Início</a>: leitura atual, busca, filtros, ordenação, capas ausentes/quebradas e paginação (30 obras).</li><li><a href="/series/${uuid(100)}">Obra com 105 capítulos</a>: volumes, início global, continuação e paginação.</li><li><a href="/read/${uuid(1000)}">PDF original local</a>: texto, páginas, fallback sem texto, ajustes, marcadores e retomada.</li><li><a href="/media/${uuid(1200)}">CBZ original local</a>: rolagem vertical, página individual e progresso.</li><li><a href="/profile">Perfil</a> e <a href="/list">lista</a>: preferências, identidade e favoritos por conta.</li><li><a href="/admin">Administração</a>, <a href="/admin/series/${uuid(100)}">obra administrativa</a> e <a href="/manage">gerenciador</a>: criar, editar, organizar, restringir/liberar, excluir e uploads fictícios locais.</li><li>Saia da conta e teste o cadastro usando qualquer e-mail fictício novo.</li></ol><p class="note">Contas fictícias: <code>admin@example.test</code> e <code>leitor@example.test</code>. Na tela de acesso use a senha fictícia <code>nook-local-test</code>. Não use sua senha real. Uploads nesta demonstração têm limite de 20 MB e ficam apenas na memória. A senha não é validada nem armazenada; troca de senha, envio de e-mail e revogação de URLs em Supabase real não são homologados aqui.</p><p><a href="/">Abrir Nook</a> · Volte a <code>/__demo</code> para alternar contas.</p></main><script>document.querySelectorAll('[data-email]').forEach(button=>button.onclick=async()=>{try{const response=await fetch('${API}/auth/v1/token?grant_type=password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:button.dataset.email,password:'nook-local-test'})});if(!response.ok)throw Error('Falha ao abrir a demonstração.');localStorage.setItem('sb-127-auth-token',JSON.stringify(await response.json()));location.href='/';}catch(error){document.querySelector('#status').textContent=error.message;}});</script></html>`;
let next;
const proxy = createServer(async (req, res) => {
  // Keep the app, Auth storage key and strict API CORS on one local origin.
  // Opening localhost used to render the app but fail every sign-in request.
  if (req.headers.host !== new URL(ORIGIN).host) {
    res.writeHead(307, {
      Location: `${ORIGIN}${req.url || "/"}`,
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; connect-src 'self' ${API}; img-src 'self' data: blob: ${API}; worker-src 'self' blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  );
  if (["/__demo", "/__demo/"].includes(new URL(req.url, ORIGIN).pathname)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(portal);
    return;
  }
  try {
    const forwarded = Object.fromEntries(
      Object.entries(req.headers).filter(
        ([key]) =>
          !["host", "connection", "accept-encoding", "content-length"].includes(
            key,
          ),
      ),
    );
    const upstream = await fetch(`http://127.0.0.1:3102${req.url}`, {
      headers: forwarded,
      method: req.method,
      redirect: "manual",
    });
    res.statusCode = upstream.status;
    for (const [key, value] of upstream.headers)
      if (
        ![
          "content-length",
          "content-encoding",
          "transfer-encoding",
          "connection",
          "content-security-policy",
        ].includes(key)
      )
        res.setHeader(key, value);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.statusCode = 503;
    res.end("A demonstração está iniciando. Recarregue em instantes.");
  }
});
function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}
try {
  await listen(apiServer, 54321);
  await listen(proxy, 3100);
  const env = {
    ...process.env,
    NOOK_UI_BUILD: "1",
    NEXT_PUBLIC_SUPABASE_URL: API,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-ui-mock-no-credentials",
  };
  await new Promise((resolve, reject) => {
    const build = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "build"],
      { env, stdio: "inherit" },
    );
    build.on("error", reject);
    build.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`Demo build failed (${code}).`)),
    );
  });
  next = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3102",
    ],
    { env, stdio: "inherit" },
  );
  next.on("exit", () => {
    apiServer.close();
    proxy.close();
  });
  console.log(`DEMO READY: ${ORIGIN}/__demo — temporary local data only.`);
} catch (error) {
  next?.kill();
  apiServer.close();
  proxy.close();
  await db.close();
  if (error.code !== "EADDRINUSE") throw error;
  console.error(
    `Não foi possível iniciar a demo: a porta ${error.port} já está em uso.\n` +
      `Se outra demo estiver aberta, acesse ${ORIGIN}/__demo.\n` +
      "Para carregar as alterações, encerre a demo anterior com Ctrl+C no terminal original e execute npm run demo:local novamente.\n" +
      "Encerrar a demo apaga os dados temporários dessa sessão.",
  );
  process.exitCode = 1;
}
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  next?.kill();
  apiServer.close();
  proxy.close();
  void db.close();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
