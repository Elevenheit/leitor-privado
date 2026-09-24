// Run ONLY against the isolated beta project, with three pre-created test accounts.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
const env = process.env;
const required = [
  "NOOK_TEST_URL",
  "NOOK_TEST_ANON_KEY",
  "NOOK_TEST_PROJECT_REF",
  "NOOK_TEST_ADMIN_EMAIL",
  "NOOK_TEST_ADMIN_PASSWORD",
  "NOOK_TEST_READER_A_EMAIL",
  "NOOK_TEST_READER_A_PASSWORD",
  "NOOK_TEST_READER_B_EMAIL",
  "NOOK_TEST_READER_B_PASSWORD",
];
if (required.some((k) => !env[k]))
  throw Error(
    "Missing isolated test configuration; see docs/BETA.md. No network request performed.",
  );
if (
  new URL(env.NOOK_TEST_URL).hostname !==
  `${env.NOOK_TEST_PROJECT_REF}.supabase.co`
)
  throw Error("Test project reference does not match URL.");
if (env.NOOK_ALLOW_TEST_WRITES !== "isolated-beta-only")
  throw Error("Explicit isolated test-write acknowledgement required.");
async function login(name) {
  const client = createClient(env.NOOK_TEST_URL, env.NOOK_TEST_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const r = await client.auth.signInWithPassword({
    email: env[`NOOK_TEST_${name}_EMAIL`],
    password: env[`NOOK_TEST_${name}_PASSWORD`],
  });
  if (r.error)
    throw Error(`Test ${name} sign-in failed (credentials not logged).`);
  return { client, id: r.data.user.id };
}
const accounts = await Promise.all(
  ["ADMIN", "READER_A", "READER_B"].map(login),
);
const [admin, a, b] = accounts;
assert.equal(new Set(accounts.map((x) => x.id)).size, 3);
let seriesId, bookId;
try {
  assert.equal((await admin.client.rpc("beta_admin")).data, true);
  assert.equal((await a.client.rpc("beta_admin")).data, false);
  const s = await admin.client
    .from("series")
    .insert({
      owner_id: admin.id,
      title: `RLS test ${Date.now()}`,
      format: "novel",
      beta_visible: true,
      rights_note: "Empty metadata for authorized security test",
    })
    .select("id")
    .single();
  assert.ifError(s.error);
  seriesId = s.data.id;
  const book = await admin.client
    .from("books")
    .insert({
      owner_id: admin.id,
      series_id: seriesId,
      title: "RLS isolation",
      original_filename: "security-test.pdf",
      file_path: `${admin.id}/test-${crypto.randomUUID()}.pdf`,
      size_bytes: 1,
    })
    .select("id")
    .single();
  assert.ifError(book.error);
  bookId = book.data.id;
  for (const [account, page] of [
    [a, 2],
    [b, 10],
  ]) {
    const r = await account.client
      .from("reading_progress")
      .upsert(
        { owner_id: account.id, book_id: bookId, page_number: page },
        { onConflict: "owner_id,book_id" },
      );
    assert.ifError(r.error);
  }
  const hack = await a.client
    .from("books")
    .update({ title: "unauthorized" })
    .eq("id", bookId)
    .select("id");
  assert.equal(hack.data?.length || 0, 0);
  const profile = await a.client
    .from("profiles")
    .update({ nickname: "unauthorized_change" })
    .eq("id", b.id)
    .select("id");
  assert.equal(profile.data?.length || 0, 0);
  const progress = await a.client
    .from("reading_progress")
    .update({ page_number: 100 })
    .eq("owner_id", b.id)
    .eq("book_id", bookId)
    .select("book_id");
  assert.equal(progress.data?.length || 0, 0);
  const saved = await b.client
    .from("reading_progress")
    .select("page_number")
    .eq("book_id", bookId)
    .single();
  assert.ifError(saved.error);
  assert.equal(saved.data.page_number, 10);
  console.log(
    "PASS: direct Supabase API isolation with three independent authenticated accounts.",
  );
} finally {
  if (bookId) await admin.client.from("books").delete().eq("id", bookId);
  if (seriesId) await admin.client.from("series").delete().eq("id", seriesId);
  await Promise.all(accounts.map((a) => a.client.auth.signOut()));
}
