import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const admin = "43caebf0-0851-4939-978d-196aa05e80f2",
  a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
await db.exec(`create role authenticated; create role anon; create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,allowed_mime_types text[],file_size_limit bigint);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
create function storage.extension(text) returns text language sql as $$select reverse(split_part(reverse($1),'.',1))$$;
insert into auth.users values ('${admin}','admin@example.test');`);
for (const f of [
  "supabase/schema.sql",
  "supabase/migrations/002_library_structure.sql",
  "supabase/migrations/004_reader_productivity.sql",
])
  await db.exec(readFileSync(f, "utf8"));
await db.exec(`insert into public.series(id,owner_id,title,is_favorite) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${admin}','Existing novel',true);
insert into public.books(id,owner_id,title,original_filename,file_path,size_bytes,series_id) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${admin}','Existing chapter','old.pdf','${admin}/old.pdf',100,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.reading_progress(book_id,owner_id,page_number) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${admin}',7);
insert into public.reading_bookmarks(owner_id,book_id,page_number,label) values('${admin}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',7,'Preserve me');
insert into storage.objects(bucket_id,name) values('novels','${admin}/old.pdf');`);
await db.exec(readFileSync("supabase/migrations/005_closed_beta.sql", "utf8"));
await db.exec(
  `grant usage on schema public,auth,storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated; grant execute on function auth.uid() to authenticated;`,
);
await assert.rejects(
  db.exec(`insert into auth.users values('${a}','not-invited@example.test')`),
);
await db.exec(`insert into public.beta_invites(email,expires_at) values('reader-a@example.test',now()+interval '7 days'),('reader-b@example.test',now()+interval '7 days');
insert into auth.users values('${a}','reader-a@example.test'),('${b}','reader-b@example.test');`);
async function as(user, sql) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
assert.equal(
  (await as(admin, "select * from reading_progress")).rows[0].page_number,
  7,
);
assert.equal(
  (await as(admin, "select * from reading_bookmarks")).rows[0].label,
  "Preserve me",
);
assert.equal((await as(admin, "select * from favorites")).rows.length, 1);
assert.equal((await as(a, "select * from books")).rows.length, 0);
await as(
  admin,
  `update series set beta_visible=true,rights_note='Original test fixture, authorized'`,
);
assert.equal((await as(a, "select * from books")).rows.length, 1);
assert.equal((await as(a, "select * from storage.objects")).rows.length, 1);
assert.equal((await as(a, "select * from reading_progress")).rows.length, 0);
assert.equal(
  (await as(a, `update books set title='Hacked' returning id`)).rows.length,
  0,
);
await assert.rejects(
  as(
    a,
    `insert into books(owner_id,title,original_filename,file_path,size_bytes) values('${a}','Hacked','x.pdf','x.pdf',1)`,
  ),
);
assert.equal(
  (
    await as(
      a,
      `update profiles set nickname='hacked' where id='${b}' returning id`,
    )
  ).rows.length,
  0,
);
await assert.rejects(
  as(
    a,
    `update beta_access set role='admin' where user_id='${a}' returning user_id`,
  ),
);
for (const [user, page] of [
  [a, 2],
  [b, 10],
])
  await as(
    user,
    `insert into reading_progress(owner_id,book_id,page_number) values('${user}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',${page}) on conflict(owner_id,book_id) do update set page_number=excluded.page_number`,
  );
assert.equal(
  (await as(a, "select * from reading_progress")).rows[0].page_number,
  2,
);
assert.equal(
  (await as(b, "select * from reading_progress")).rows[0].page_number,
  10,
);
await assert.rejects(
  as(
    a,
    `insert into reading_progress(owner_id,book_id) values('${b}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') on conflict(owner_id,book_id) do update set page_number=50`,
  ),
);
await as(
  a,
  `insert into comments(id,series_id,owner_id,body) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${a}','A real conversation')`,
);
await assert.rejects(
  as(
    a,
    `insert into comments(series_id,owner_id,body) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${a}','Spam')`,
  ),
);
assert.equal(
  (await as(b, `update comments set body='Hacked' returning id`)).rows.length,
  0,
);
await as(
  b,
  `insert into comment_reports(comment_id,owner_id,reason) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${b}','Teste de denúncia')`,
);
assert.equal((await as(admin, "select * from comment_reports")).rows.length, 1);
await as(
  admin,
  `delete from comments where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'`,
);
assert.equal((await as(a, "select * from comments")).rows.length, 0);
await db.exec(
  `update beta_access set expires_at=now()-interval '1 second' where user_id='${b}'`,
);
assert.equal((await as(b, "select * from books")).rows.length, 0);
assert.equal((await as(b, "select * from storage.objects")).rows.length, 0);
assert.equal((await as(b, "select * from reading_progress")).rows.length, 0);
console.log(
  "PASS: PostgreSQL migration, preservation, invited signup, admin + two readers, RLS isolation, storage, comments, spam, reports, expiration.",
);
assert.equal(
  (await as(a, `select * from profiles where id='${admin}'`)).rows.length,
  0,
);
const identities = await as(a, "select * from profile_identities");
assert.equal(identities.rows.length, 3);
assert.equal("email" in identities.rows[0], false);
assert.equal("bio" in identities.rows[0], false);
await assert.rejects(as(admin, `update series set format='anime'`));
await as(
  a,
  `insert into favorites(owner_id,series_id) values('${a}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')`,
);
assert.equal((await as(a, "select * from favorites")).rows.length, 1);
assert.equal((await as(admin, "select * from favorites")).rows.length, 1);
await as(
  a,
  `insert into reading_bookmarks(owner_id,book_id,page_number,label) values('${a}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2,'Private bookmark')`,
);
assert.equal(
  (await as(admin, "select * from reading_bookmarks")).rows[0].label,
  "Preserve me",
);
await db.exec(
  `update beta_access set expires_at=now()+interval '7 days' where user_id='${b}'`,
);
await as(
  a,
  `insert into comments(id,series_id,owner_id,body) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${a}','Parent')`,
);
await as(
  b,
  `insert into comments(series_id,owner_id,body,parent_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${b}','Reply preserved','dddddddd-dddd-4ddd-8ddd-dddddddddddd')`,
);
await as(
  a,
  `delete from comments where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'`,
);
assert.equal(
  (await as(b, `select body,parent_id from comments where owner_id='${b}'`))
    .rows[0].body,
  "Reply preserved",
);
await db.close();
