import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { isolatedEnvironment } from "./isolation.mjs";
test.describe.configure({ mode: "serial" });
const config = isolatedEnvironment();
const service = createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomUUID();
const password = `${randomUUID()}aA!9`;
const accounts = {};
const emails = ["admin", "reader", "denied", "signup"].map(role => `${role}-${run}@example.test`);
let seriesId, bookId, path;
const title = `Nook E2E ${run}`;
function checked(result) { if (result.error) throw Error("Isolated fixture operation failed (details withheld)."); return result.data; }
function originalPdf() {
  const text = "BT /F1 18 Tf 40 700 Td (Nook original E2E fixture) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${text.length} >>\nstream\n${text}\nendstream`];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
test.beforeAll(async () => {
  checked(await service.from("beta_invites").insert(emails.map(email => ({ email, expires_at: new Date(Date.now()+86400000).toISOString() }))));
  for (const role of ["admin", "reader", "denied"]) {
    const email = `${role}-${run}@example.test`;
    const data = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }));
    accounts[role] = { id: data.user.id, email };
  }
  checked(await service.from("beta_access").update({ role: "admin" }).eq("user_id", accounts.admin.id));
  checked(await service.from("beta_access").update({ revoked: true }).eq("user_id", accounts.denied.id));
  const series = checked(await service.from("series").insert({ owner_id: accounts.admin.id, title, format: "novel", beta_visible: true, rights_note: "Original isolated test fixture" }).select("id").single());
  seriesId = series.id;
  path = `${accounts.admin.id}/${run}.pdf`;
  const pdf = originalPdf();
  checked(await service.storage.from("novels").upload(path, pdf, { contentType: "application/pdf" }));
  bookId = checked(await service.from("books").insert({ owner_id: accounts.admin.id, series_id: seriesId, title: "Original E2E chapter", original_filename: "original.pdf", file_path: path, size_bytes: pdf.length, media_type: "pdf" }).select("id").single()).id;
});
test.afterAll(async () => {
  if (seriesId) checked(await service.from("comments").delete().eq("series_id", seriesId));
  if (bookId) checked(await service.from("books").delete().eq("id", bookId));
  if (seriesId) checked(await service.from("series").delete().eq("id", seriesId));
  if (path) checked(await service.storage.from("novels").remove([path]));
  const claimed = checked(await service.from("beta_invites").select("claimed_by").in("email", emails));
  checked(await service.from("beta_invites").delete().in("email", emails));
  const ids = new Set([...Object.values(accounts).map(a => a.id), ...claimed.map(r => r.claimed_by).filter(Boolean)]);
  for (const id of ids) checked(await service.auth.admin.deleteUser(id));
});
test.beforeEach(async ({ context }) => {
  await context.route("**/*", route => {
    const host = new URL(route.request().url()).hostname;
    if (host.endsWith(".supabase.co") && host !== config.host) return route.abort();
    return route.continue();
  });
});
async function login(page, role) {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(accounts[role].email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "Entrar", exact: true }).click();
}
test("reader: catalog, favorite, PDF, bookmark, comment, profile, admin denial and logout", async ({ page }) => {
  await login(page, "reader");
  await page.getByLabel("Busca global de obras").fill(title);
  await page.getByRole("button", { name: `Guardar ${title}` }).click();
  await expect(page.getByRole("button", { name: `Guardar ${title}` })).toHaveAttribute("aria-pressed", "true");
  await page.locator(`a.series-title[href="/series/${seriesId}"]`).click();
  await page.locator(`a[href="/read/${bookId}"]`).first().click();
  await expect(page.locator(".reader-toolbar")).toBeVisible();
  await expect(page.locator(".reflow-text")).toContainText("Nook original E2E fixture");
  await page.getByRole("button", { name: "Marcadores", exact: true }).click();
  await page.getByLabel("Nome opcional").fill(`marker-${run}`);
  await page.getByRole("button", { name: /Salvar posi/ }).click();
  await expect(page.locator(".bookmark-list")).toContainText(`marker-${run}`);
  await page.getByRole("button", { name: "Fechar marcadores" }).click();
  await page.goto(`/series/${seriesId}`);
  await page.getByLabel(/Seu coment/).fill(`comment-${run}`);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.locator(".comment")).toContainText(`comment-${run}`);
  await page.goto("/profile");
  await page.getByLabel("Nome exibido").fill("Leitor E2E");
  await page.locator(".profile-fields").getByRole("button", { name: /Salvar altera/ }).click();
  await expect(page.getByText("Perfil salvo.", { exact: true })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Acesso indispon/ })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
});
test("admin: publication, authorization and moderation", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin");
  await page.getByLabel("Obra", { exact: true }).first().selectOption(seriesId);
  await page.getByLabel(/Autoriza.*compartilhamento/).fill("Original fixture authorized only for tests");
  await page.getByRole("button", { name: /Liberar obra autorizada/ }).click();
  await expect(page.getByText("Obra liberada aos convidados.")).toBeVisible();
  await page.goto(`/series/${seriesId}`);
  await expect(page.locator(".comment")).toContainText(`comment-${run}`);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: /Moderar: excluir/ }).click();
  await expect(page.locator(".comment")).toHaveCount(0);
});
test("revoked access denied and mobile library without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "denied");
  await expect(page.getByRole("heading", { name: /Acesso indispon/ })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await login(page, "reader");
  await expect(page.getByLabel("Busca global de obras")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("invited signup and non-invited denial", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(`uninvited-${run}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("E-mail", { exact: true }).fill(`signup-${run}@example.test`);
  await page.locator("form").getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByLabel("Busca global de obras")).toBeVisible();
});
