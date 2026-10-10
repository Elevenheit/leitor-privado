import { PGlite } from "@electric-sql/pglite";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
const admin = randomUUID(),
  a = randomUUID(),
  b = randomUUID();
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
assert.equal(
  (await db.query(`select * from public.beta_access where user_id='${admin}'`))
    .rows.length,
  0,
);
await db.exec(
  `insert into public.beta_access(user_id,role,expires_at) values('${admin}','admin','infinity');`,
);
await db.exec(
  readFileSync("supabase/migrations/006_visible_series_comments.sql", "utf8"),
);
await db.exec(
  readFileSync("supabase/migrations/007_storage_visibility.sql", "utf8"),
);
await db.exec(
  readFileSync(
    "supabase/migrations/008_nonnegative_catalog_numbers.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync("supabase/migrations/009_reader_navigation.sql", "utf8"),
);
await db.exec(
  readFileSync("supabase/migrations/010_comment_report_rate_limit.sql", "utf8"),
);
await db.exec(
  readFileSync("supabase/migrations/011_profile_storage_privacy.sql", "utf8"),
);
await db.exec(readFileSync("supabase/migrations/012_reading_only.sql", "utf8"));
const progressGuard = readFileSync(
  "supabase/migrations/013_progress_order.sql",
  "utf8",
);
await db.exec(progressGuard);
await db.exec(progressGuard); // Rerunning the migration must preserve all positions.
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
async function asAnon(sql) {
  await db.exec("set role anon");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
assert.deepEqual(
  (
    await db.query(
      "select allowed_mime_types from storage.buckets where id='novels'",
    )
  ).rows[0].allowed_mime_types,
  ["application/pdf", "application/zip", "application/vnd.comicbook+zip"],
);
await as(
  admin,
  `insert into storage.objects(bucket_id,name) values('novels','${admin}/sample.cbz')`,
);
await assert.rejects(
  as(
    admin,
    `insert into storage.objects(bucket_id,name) values('novels','${admin}/sample.mp4')`,
  ),
);
await assert.rejects(
  as(
    admin,
    `insert into storage.objects(bucket_id,name) values('novels','${admin}/sample.exe')`,
  ),
);
await assert.rejects(
  as(
    admin,
    `insert into storage.objects(bucket_id,name) values('novels','${admin}/sample.js')`,
  ),
);
await assert.rejects(
  as(
    admin,
    `insert into storage.objects(bucket_id,name) values('novels','${admin}/sample.html')`,
  ),
);
await assert.rejects(
  as(
    a,
    `insert into storage.objects(bucket_id,name) values('novels','${a}/sample.cbz')`,
  ),
);
await assert.rejects(
  as(
    admin,
    `insert into public.series(owner_id,title) values('${a}','Wrong owner')`,
  ),
);
await assert.rejects(
  as(
    admin,
    `insert into public.books(owner_id,title,original_filename,file_path,size_bytes) values('${a}','Wrong owner','wrong.pdf','${a}/wrong.pdf',1)`,
  ),
);
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
await db.exec(`insert into public.volumes(id,owner_id,series_id,volume_number,title) values('77777777-7777-4777-8777-777777777777','${admin}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,'Zero volume');
insert into public.books(id,owner_id,title,original_filename,file_path,size_bytes,series_id,volume_id,chapter_number,sort_order) values('66666666-6666-4666-8666-666666666666','${admin}','Zero chapter','zero.pdf','${admin}/zero.pdf',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','77777777-7777-4777-8777-777777777777',0,0),('55555555-5555-4555-8555-555555555555','${admin}','Fractional chapter','fraction.pdf','${admin}/fraction.pdf',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','77777777-7777-4777-8777-777777777777',12.5,12500)`);
assert.deepEqual(
  (
    await db.query(
      "select chapter_number from public.books where id in ('66666666-6666-4666-8666-666666666666','55555555-5555-4555-8555-555555555555') order by chapter_number",
    )
  ).rows.map((row) => Number(row.chapter_number)),
  [0, 12.5],
);
await assert.rejects(
  db.exec(
    `insert into public.volumes(owner_id,series_id,volume_number) values('${admin}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',-1)`,
  ),
);
await assert.rejects(
  db.exec(
    `insert into public.books(owner_id,title,original_filename,file_path,size_bytes,series_id,chapter_number) values('${admin}','Negative chapter','negative.pdf','${admin}/negative.pdf',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',-0.5)`,
  ),
);
await db.exec(`insert into public.series(id,owner_id,title,beta_visible) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${admin}','Hidden series',false);
insert into public.volumes(id,owner_id,series_id,volume_number,title) values('99999999-9999-4999-8999-999999999999','${admin}','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',1,'Hidden volume');
insert into public.books(id,owner_id,title,original_filename,file_path,size_bytes,series_id,volume_id) values('88888888-8888-4888-8888-888888888888','${admin}','Hidden chapter','hidden.pdf','${admin}/hidden.pdf',1,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','99999999-9999-4999-8999-999999999999');
insert into public.comments(id,series_id,owner_id,body) values('ffffffff-ffff-4fff-8fff-ffffffffffff','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${admin}','Private moderation note');
insert into storage.objects(bucket_id,name) values('novels','${admin}/hidden.pdf'),('novels','${admin}/orphan.pdf')`);
assert.equal(
  (
    await as(
      a,
      `select * from series where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'`,
    )
  ).rows.length,
  0,
);
assert.equal(
  (
    await as(
      a,
      `select * from volumes where id='99999999-9999-4999-8999-999999999999'`,
    )
  ).rows.length,
  0,
);
assert.equal(
  (
    await as(
      a,
      `select * from books where id='88888888-8888-4888-8888-888888888888'`,
    )
  ).rows.length,
  0,
);
const hiddenNeighbors = await as(
  a,
  `select * from public.reader_navigation_neighbors('88888888-8888-4888-8888-888888888888')`,
);
assert.equal(hiddenNeighbors.rows[0].previous_id, null);
assert.equal(hiddenNeighbors.rows[0].next_id, null);
assert.equal(
  (
    await as(
      a,
      `select * from comments where series_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'`,
    )
  ).rows.length,
  0,
);
await assert.rejects(
  as(
    a,
    `insert into comments(series_id,owner_id,body) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${a}','Attempt')`,
  ),
);
await assert.rejects(
  as(
    a,
    `insert into comment_reports(comment_id,owner_id,reason) values('ffffffff-ffff-4fff-8fff-ffffffffffff','${a}','Hidden comment')`,
  ),
);
await as(
  admin,
  `update series set beta_visible=true,rights_note='Original test fixture, authorized' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`,
);
const readerNeighbors = await as(
  a,
  `select * from public.reader_navigation_neighbors('66666666-6666-4666-8666-666666666666')`,
);
assert.equal(readerNeighbors.rows[0].previous_id, null);
assert.equal(
  readerNeighbors.rows[0].next_id,
  "55555555-5555-4555-8555-555555555555",
);
assert.equal((await as(a, "select * from books")).rows.length, 3);
assert.equal((await as(a, "select * from storage.objects")).rows.length, 1);
assert.equal(
  (
    await as(
      a,
      `select * from storage.objects where name='${admin}/hidden.pdf'`,
    )
  ).rows.length,
  0,
);
assert.equal(
  (
    await as(
      a,
      `select * from storage.objects where name='${admin}/orphan.pdf'`,
    )
  ).rows.length,
  0,
);
assert.equal(
  (await db.query("select public from storage.buckets where id='novels'"))
    .rows[0].public,
  false,
);
await assert.rejects(asAnon("select * from storage.objects"));
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
      `update series set beta_visible=true where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning id`,
    )
  ).rows.length,
  0,
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
assert.equal(
  (await as(a, `select * from profiles where id='${b}'`)).rows.length,
  0,
);
await assert.rejects(as(a, `update profiles set id='${b}' where id='${a}'`));
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
assert.equal(
  (await as(a, `select * from reading_progress where owner_id='${b}'`)).rows
    .length,
  0,
);
await as(
  a,
  `update reading_progress set page_number=20, completed=true, updated_at=now()+interval '1 minute' where owner_id='${a}'`,
);
await assert.rejects(
  as(
    a,
    `update reading_progress set page_number=3, updated_at=now() where owner_id='${a}'`,
  ),
  { code: "40001" },
);
assert.equal(
  (await as(a, "select * from reading_progress")).rows[0].page_number,
  20,
);
await as(
  a,
  `update reading_progress set completed=false, updated_at=now()+interval '2 minutes' where owner_id='${a}'`,
);
assert.equal(
  (await as(a, "select * from reading_progress")).rows[0].completed,
  true,
);
await assert.rejects(
  as(
    a,
    `insert into reading_progress(owner_id,book_id) values('${b}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') on conflict(owner_id,book_id) do update set page_number=50`,
  ),
);
await assert.rejects(
  as(a, `update reading_progress set owner_id='${b}' where owner_id='${a}'`),
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
assert.equal(
  (await as(a, `select * from comment_reports where owner_id='${b}'`)).rows
    .length,
  0,
);
await assert.rejects(
  as(
    b,
    `update comment_reports set reason='Changed report' where owner_id='${b}'`,
  ),
);
await assert.rejects(
  as(b, `delete from comment_reports where owner_id='${b}'`),
);
await assert.rejects(
  as(
    b,
    `insert into comment_reports(comment_id,owner_id,reason) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${b}','Second report')`,
  ),
);
await as(
  admin,
  `delete from comments where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'`,
);
assert.equal(
  (
    await as(
      a,
      `select * from comments where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'`,
    )
  ).rows.length,
  0,
);
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
  b,
  `insert into favorites(owner_id,series_id) values('${b}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')`,
);
assert.equal(
  (await as(a, `select * from favorites where owner_id='${b}'`)).rows.length,
  0,
);
assert.equal(
  (
    await as(
      a,
      `update favorites set series_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where owner_id='${b}' returning owner_id`,
    )
  ).rows.length,
  0,
);
await assert.rejects(
  as(
    a,
    `insert into favorites(owner_id,series_id) values('${b}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')`,
  ),
);
await as(
  b,
  `insert into reading_bookmarks(owner_id,book_id,page_number,label) values('${b}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',3,'Reader B bookmark')`,
);
assert.equal(
  (await as(a, `select * from reading_bookmarks where owner_id='${b}'`)).rows
    .length,
  0,
);
assert.equal(
  (
    await as(
      a,
      `update reading_bookmarks set label='Hacked' where owner_id='${b}' returning id`,
    )
  ).rows.length,
  0,
);
await as(
  a,
  `insert into comments(id,series_id,owner_id,body) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${a}','Parent')`,
);
await as(
  a,
  `update comments set body='Owner edit' where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'`,
);
await assert.rejects(
  as(
    a,
    `update comments set owner_id='${b}' where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'`,
  ),
);
await assert.rejects(
  as(
    a,
    `update comments set series_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'`,
  ),
);
await assert.rejects(
  as(
    a,
    `insert into comments(series_id,owner_id,body) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${a}',repeat('x',2001))`,
  ),
);
assert.equal(
  (
    await as(
      a,
      `select body from comments where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'`,
    )
  ).rows[0].body,
  "Owner edit",
);
assert.equal(
  (
    await as(
      b,
      `update comments set body='Non-owner edit' where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' returning id`,
    )
  ).rows.length,
  0,
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
assert.equal((await as(b, "select * from storage.objects")).rows.length, 1);
await db.exec(`insert into storage.objects(bucket_id,name) values ('profiles','${a}/avatar.png'),('profiles','${a}/banner.png'),('profiles','${a}/orphan.png');
update public.profiles set avatar_path='${a}/avatar.png',banner_path='${a}/banner.png' where id='${a}'`);
assert.equal(
  (await as(b, "select * from storage.objects where bucket_id='profiles'")).rows
    .length,
  1,
);
assert.equal(
  (await as(a, "select * from storage.objects where bucket_id='profiles'")).rows
    .length,
  3,
);
await db.exec("delete from storage.objects where bucket_id='profiles'");
await db.exec(
  `update public.beta_access set revoked=true where user_id='${b}'`,
);
assert.equal(
  (await as(b, "select public.beta_member() as active")).rows[0].active,
  false,
);
assert.equal((await as(b, "select * from books")).rows.length, 0);
assert.equal((await as(b, "select * from storage.objects")).rows.length, 0);
assert.equal((await as(b, "select * from reading_progress")).rows.length, 0);
// Historical beta tests above remain intact. Verify the forward upgrade too.
const legacy = randomUUID(),
  newcomer = randomUUID();
await db.exec(`alter table auth.users disable trigger enroll_beta;
  insert into auth.users values('${legacy}','legacy-no-access@example.test');
  alter table auth.users enable trigger enroll_beta;
  update beta_access set expires_at=now()-interval '1 day' where user_id in ('${admin}','${a}');`);
const openMigration = readFileSync(
  "supabase/migrations/014_open_registration.sql",
  "utf8",
);
await db.exec(openMigration);
await db.exec(openMigration);
assert.equal(
  (await as(a, "select public.beta_member() as ok")).rows[0].ok,
  true,
);
assert.equal(
  (await as(admin, "select public.beta_admin() as ok")).rows[0].ok,
  true,
);
assert.equal(
  (await as(b, "select public.beta_member() as ok")).rows[0].ok,
  false,
);
assert.equal(
  (await as(legacy, "select public.beta_member() as ok")).rows[0].ok,
  true,
);
await db.exec(
  `insert into auth.users values('${newcomer}','no-invitation@example.test');`,
);
assert.equal(
  (await as(newcomer, "select public.beta_member() as ok")).rows[0].ok,
  true,
);
assert.equal(
  (await as(newcomer, "select public.beta_admin() as ok")).rows[0].ok,
  false,
);
assert.equal((await as(newcomer, "select * from profiles")).rows.length, 1);
assert.equal(
  (await as(newcomer, "select * from books")).rows.length,
  (await as(a, "select * from books")).rows.length,
);
assert.equal(
  (
    await as(
      newcomer,
      "select * from series where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'",
    )
  ).rows.length,
  0,
);
assert.equal(
  (await as(newcomer, "select * from storage.objects")).rows.length,
  1,
);
assert.equal((await as(b, "select * from books")).rows.length, 0);
assert.equal((await as(b, "select * from storage.objects")).rows.length, 0);
assert.equal(
  (await as(newcomer, "select * from reading_progress")).rows.length,
  0,
);
await assert.rejects(
  as(
    newcomer,
    `update beta_access set role='admin' where user_id='${newcomer}'`,
  ),
);
assert.equal(
  (await as(newcomer, "update books set title='hack' returning id")).rows
    .length,
  0,
);
assert.equal(
  (
    await as(
      newcomer,
      `update profiles set display_name='hack' where id='${a}' returning id`,
    )
  ).rows.length,
  0,
);
await db.exec(
  readFileSync("supabase/migrations/015_reader_anchors.sql", "utf8"),
);
await as(
  newcomer,
  `insert into reading_progress(owner_id,book_id,page_number,line_index,scroll_ratio,page_offset,text_offset)
  values('${newcomer}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,2,0.2,0.42,145)`,
);
assert.equal(
  (await as(newcomer, "select text_offset,page_offset from reading_progress"))
    .rows[0].text_offset,
  145,
);
assert.equal(
  (await as(a, `select * from reading_progress where owner_id='${newcomer}'`))
    .rows.length,
  0,
);
await assert.rejects(
  as(newcomer, "update reading_progress set page_offset=1.1"),
);
await assert.rejects(
  as(newcomer, "update reading_progress set text_offset=-1"),
);
await as(
  newcomer,
  `insert into reading_bookmarks(owner_id,book_id,page_number,text_offset,page_offset)
  values('${newcomer}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,145,0.42)`,
);
await db.exec(
  readFileSync("supabase/migrations/016_catalog_pagination.sql", "utf8"),
);
const browse = async (user, args = "") =>
  (await as(user, `select public.browse_catalog(${args}) as page`)).rows[0]
    .page;
const publishedCount = (await as(newcomer, "select * from series")).rows.length;
assert.equal((await browse(newcomer)).totalCount, publishedCount);
assert.equal(
  (await browse(newcomer, "search_term => 'Existing novel'")).items[0]
    .reading_state,
  "reading",
);
assert.equal((await browse(b)).totalCount, 0);
await assert.rejects(asAnon("select public.browse_catalog()"));
assert.equal(
  (await browse(newcomer, "search_term => 'EXISTING   NOVEL'")).totalCount,
  1,
);
assert.equal(
  (
    await browse(
      newcomer,
      "reading_state => 'unread', search_term => 'Existing novel'",
    )
  ).totalCount,
  0,
);
assert.equal((await browse(newcomer, "favorites_only => true")).totalCount, 0);
await db.exec(`insert into series(owner_id,title,beta_visible,format)
  select '${admin}', 'História ' || n, true, 'novel' from generate_series(1,1000) n;`);
const firstPage = await browse(newcomer),
  secondPage = await browse(newcomer, "page_index => 1");
assert.equal(firstPage.items.length, 24);
assert.equal(secondPage.items.length, 24);
assert.equal(firstPage.totalCount, 1000 + publishedCount);
assert.equal(
  new Set([...firstPage.items, ...secondPage.items].map((s) => s.id)).size,
  48,
);
assert.equal(
  (await browse(newcomer, "search_term => 'historia 999'")).totalCount,
  1,
);
assert.equal((await browse(newcomer, "page_index => 1000000")).items.length, 0);
// Pending positions affect only this reader's view and respect the newer remote timestamp.
const pending = (updated_at, completed) =>
  `pending_positions => '${JSON.stringify([
    {
      book_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      page_number: 1,
      scroll_ratio: 1,
      page_count: 2,
      completed,
      updated_at,
    },
  ])}'::jsonb, search_term => 'Existing novel'`;
const otherReaderPage = await browse(a, "search_term => 'Existing novel'");
assert.equal(
  (await browse(newcomer, pending("2099-01-01", true))).items[0]
    .completed_count,
  1,
);
assert.equal(
  (await browse(newcomer, pending("2000-01-01", false))).items[0].reading_state,
  "reading",
);
assert.deepEqual(
  await browse(a, "search_term => 'Existing novel'"),
  otherReaderPage,
);
if (process.env.NOOK_CATALOG_BENCH === "1") {
  await db.exec(`insert into books(owner_id,series_id,title,original_filename,file_path,size_bytes,total_pages,chapter_number,media_type)
    select '${admin}', s.id, 'Capítulo ' || n, 'local.pdf', '${admin}/bench/' || s.id || '/' || n || '.pdf',4096,100,n,'pdf'
    from series s cross join generate_series(1,10) n where s.title like 'História %';`);
  const tables = [
    ["series", "*"],
    [
      "books",
      "books.id,books.series_id,books.title,chapter_number,chapter_title,content_type,media_type,total_pages,case when v.id is null then null else jsonb_build_object('volume_number',v.volume_number,'title',v.title) end as volumes",
    ],
    [
      "reading_progress",
      "owner_id,book_id,reading_mode,page_number,page_count,line_index,scroll_ratio,completed,updated_at",
    ],
    ["favorites", "series_id"],
  ];
  async function baseline() {
    let requests = 0,
      bytes = 0,
      rows = 0;
    for (const [table, columns] of tables) {
      for (let offset = 0; ; offset += 500) {
        const query =
          table === "books"
            ? `select ${columns} from books left join volumes v on v.id=books.volume_id order by books.id`
            : `select ${columns} from ${table} ${["favorites", "reading_progress"].includes(table) ? `where owner_id='${newcomer}'` : ""} order by ${table === "favorites" ? "series_id" : table === "reading_progress" ? "book_id" : "id"}`;
        const batch = (
          await as(newcomer, `${query} limit 500 offset ${offset}`)
        ).rows;
        bytes += Buffer.byteLength(JSON.stringify(batch));
        rows += batch.length;
        requests++;
        if (batch.length < 500) break;
      }
    }
    return { requests, bytes, rows };
  }
  async function paginated() {
    const page = await browse(newcomer);
    return {
      requests: 1,
      bytes: Buffer.byteLength(JSON.stringify(page)),
      rows: page.items.length,
    };
  }
  const measured = async (run) => {
    await run(); // Warm the same local database for both methods.
    const timings = [];
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      const start = performance.now();
      result = await run();
      timings.push(performance.now() - start);
    }
    return {
      ...result,
      medianMs: +timings.sort((a, b) => a - b)[1].toFixed(2),
      runs: 3,
    };
  };
  const counts = (
    await as(
      newcomer,
      "select (select count(*) from series) as works, (select count(*) from books) as chapters",
    )
  ).rows[0];
  const metrics = {
    scenario: `${counts.works} accessible works, ${counts.chapters} chapters, one progress row, no favorites; first page, cache miss`,
    method:
      "PGlite/PostgreSQL with reader RLS; local serial SQL and JSON serialization; 500-row legacy batches versus one 24-item RPC; warm median of 3; no HTTP or client rendering",
    before: await measured(baseline),
    after: await measured(paginated),
  };
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/catalog-benchmark.json",
    JSON.stringify(metrics, null, 2) + "\n",
  );
  console.log("CATALOG BENCHMARK:", JSON.stringify(metrics));
}
console.log(
  "PASS: open registration upgrade, legacy profiles, permanent admin/readers, suspensions, private data/Storage, remote anchors and paginated catalog under RLS.",
);
// Reproduce the permissive policy discovered on the deployed database.
await db.exec(`create policy usuarios_logados_podem_ver_biblioteca on public.books
  for select to authenticated using (true);`);
assert.equal(
  (
    await as(
      a,
      "select * from books where id='88888888-8888-4888-8888-888888888888'",
    )
  ).rows.length,
  1,
);
await db.exec(
  readFileSync(
    "supabase/migrations/20261010001650_deployment_security.sql",
    "utf8",
  ),
);
assert.equal(
  (
    await as(
      a,
      "select * from books where id='88888888-8888-4888-8888-888888888888'",
    )
  ).rows.length,
  0,
);
const safeIdentities = (await as(a, "select * from profile_identities")).rows;
assert(safeIdentities.length >= 3);
assert.deepEqual(Object.keys(safeIdentities[0]).sort(), [
  "avatar",
  "avatar_path",
  "id",
  "nickname",
]);
assert.equal(
  (await as(a, `select * from profiles where id='${admin}'`)).rows.length,
  0,
);
assert.equal(
  (
    await db.query(
      "select has_function_privilege('anon', 'public.beta_member()', 'execute') as allowed",
    )
  ).rows[0].allowed,
  false,
);
assert.equal(
  (
    await db.query(
      "select has_function_privilege('authenticated', 'public.enroll_beta()', 'execute') as allowed",
    )
  ).rows[0].allowed,
  false,
);
await db.exec(`update beta_access set revoked=true where user_id='${b}'`);
assert.equal((await as(b, "select * from books")).rows.length, 0);
assert.equal((await as(b, "select * from profile_identities")).rows.length, 0);
console.log(
  "PASS: deployed permissive-policy removal, private community projection, suspended access and restricted trigger functions.",
);
await db.close();
