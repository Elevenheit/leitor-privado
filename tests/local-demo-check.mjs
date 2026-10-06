// Smoke-check the running interactive demo, without contacting external services.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { originalPdf } from "./ui/original-pdf.mjs";

const browser = await chromium.launch();
const context = await browser.newContext({ serviceWorkers: "block" });
const errors = [];
const blocked = [];
// Observe without routing so the browser enforces genuine CORS preflights.
// The demo's CSP restricts connections and resources to the local servers.
context.on("request", (request) => {
  if (
    !["http://127.0.0.1:3100", "http://127.0.0.1:54321"].includes(
      new URL(request.url()).origin,
    )
  )
    blocked.push(new URL(request.url()).origin);
});
const page = await context.newPage();
const demoTitle = `Obra criada na demonstração ${Date.now()}`;
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto("http://127.0.0.1:3100/__demo");
  await page.getByRole("button", { name: "Entrar como administração" }).click();
  await expect(page.locator(".series-card")).toHaveCount(24);
  await page.getByLabel("Situação da leitura").selectOption("reading");
  await expect(page.locator(".series-card")).toHaveCount(5);
  await page.goto(
    "http://127.0.0.1:3100/series/10000000-0000-4000-8000-000000000100",
  );
  await expect(page.locator(".chapter-row")).toHaveCount(100);
  const start = page.locator(".series-hero-copy .primary-button");
  await expect(start).toHaveAttribute(
    "href",
    "/read/10000000-0000-4000-8000-000000001000",
  );
  await page.getByRole("button", { name: "Mais capítulos" }).click();
  await expect(page.locator(".chapter-row")).toHaveCount(5);
  await expect(start).toHaveAttribute(
    "href",
    "/read/10000000-0000-4000-8000-000000001000",
  );
  await start.click();
  await expect(page.locator(".reflow-text").first()).toContainText(
    "Original local paragraph",
  );
  await page.getByRole("button", { name: "Marcadores", exact: true }).click();
  await page.getByLabel("Nome opcional").fill("Marcador temporário");
  await page.getByRole("button", { name: "Salvar posição atual" }).click();
  await expect(
    page.getByRole("button", { name: /^Marcador temporário/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar marcadores" }).click();
  await page
    .getByRole("button", { name: "Voltar à biblioteca", exact: true })
    .click();
  await expect(page.locator(".series-hero-copy h1")).toBeVisible();
  await page.goto(
    "http://127.0.0.1:3100/media/10000000-0000-4000-8000-000000001200",
  );
  await expect(
    page.getByRole("img", { name: "Página 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Uma página por vez" }).click();
  await page.getByRole("button", { name: "Próxima →", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Página 2", exact: true }),
  ).toBeVisible();
  await page.goto("http://127.0.0.1:3100/profile");
  await page
    .getByRole("textbox", { name: "Bio", exact: true })
    .fill("Alteração apenas na demonstração.");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(page.getByText("Perfil salvo.")).toBeVisible();
  await page.goto("http://127.0.0.1:3100/admin");
  await expect(page.locator(".series-card")).toHaveCount(24);
  await page.locator(".add-menu summary").click();
  await page.getByRole("button", { name: "Nova obra", exact: true }).click();
  await page.getByLabel("Nome da obra", { exact: true }).fill(demoTitle);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Criar obra", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Buscar obras e capítulos" })
    .fill(demoTitle);
  await expect(page.locator(".series-card")).toHaveCount(1);
  await expect(page.locator(".visibility-badge").last()).toContainText(
    "Restrita",
  );
  // Upload a tiny original PDF through the same TUS client used by the application.
  await page.locator(".add-menu summary").click();
  await page
    .getByRole("button", { name: "Adicionar capítulo", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Buscar obra para selecionar" })
    .fill(demoTitle);
  await expect(
    page.getByLabel("Obra", { exact: true }).locator("option"),
  ).toHaveCount(2);
  const workId = await page
    .getByLabel("Obra", { exact: true })
    .locator("option")
    .last()
    .getAttribute("value");
  await page.getByLabel("Obra", { exact: true }).selectOption(workId);
  await page.locator('input[type="file"]').last().setInputFiles({
    name: "original-demo.pdf",
    mimeType: "application/pdf",
    buffer: originalPdf(),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enviar PDF", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15000 });
  await page.goto(`http://127.0.0.1:3100/admin/series/${workId}`);
  await expect(page.locator(".chapter-row")).toHaveCount(1);
  await page.goto("http://127.0.0.1:3100/__demo");
  await page
    .getByRole("button", { name: "Entrar como leitor", exact: true })
    .click();
  await expect(page.locator(".series-card")).toHaveCount(24);
  await page.getByLabel("Busca global de obras").fill(demoTitle);
  await expect(page.getByText("Nenhuma obra encontrada.")).toBeVisible();
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  console.log(
    "PASS: interactive local demo login, catalog/RLS, pagination/global start, real PDF/CBZ, bookmark/progress, profile, restricted work creation and local TUS upload. No external requests.",
  );
} finally {
  await browser.close();
}
