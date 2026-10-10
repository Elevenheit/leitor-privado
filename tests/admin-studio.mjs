// Run against npm run demo:local. All writes use its temporary, fictitious data.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { originalPdf } from "./ui/original-pdf.mjs";

const origin = "http://127.0.0.1:3100";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("artifacts/admin-redesign", { recursive: true });
async function fits() {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "No horizontal overflow",
  );
  if (await page.getByRole("dialog").count()) {
    const dialog = await page.getByRole("dialog").boundingBox();
    const footer = await page.locator(".batch-footer").boundingBox();
    assert.ok(
      dialog.y >= 0 && dialog.y + dialog.height <= page.viewportSize().height,
    );
    assert.ok(
      footer.y >= dialog.y &&
        footer.y + footer.height <= dialog.y + dialog.height,
    );
  }
}
try {
  await page.goto(`${origin}/__demo`);
  await page.getByRole("button", { name: "Entrar como administração" }).click();
  await expect(page.locator(".series-card")).toHaveCount(24);
  await page.goto(`${origin}/admin`);
  await expect(page.locator(".series-card")).toHaveCount(24);
  await fits();
  await page.screenshot({ path: "artifacts/admin-redesign/desktop.png" });
  await page
    .getByRole("button", { name: "Enviar arquivos", exact: false })
    .click();
  await page
    .getByLabel("Obra", { exact: true })
    .selectOption("10000000-0000-4000-8000-000000000100");
  await expect(
    page
      .getByRole("dialog")
      .getByLabel("Volume", { exact: true })
      .locator("option"),
  ).toHaveCount(2);
  await expect(
    page.locator(".library-picker").last().locator(".picker-pages"),
  ).toHaveCount(0);
  const checkbox = await page
    .getByLabel("Criar novo volume", { exact: true })
    .boundingBox();
  assert.ok(
    checkbox.width <= 20 && checkbox.height <= 20,
    "Checkbox keeps its intended size",
  );
  await fits();
  await page.screenshot({ path: "artifacts/admin-redesign/batch-desktop.png" });
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();

  // Create an isolated work through the UI, then upload two files into a new volume.
  const title = `Estúdio ${Date.now()}`;
  const firstTitle = `${title} · Primeiro capítulo`;
  const secondTitle = `${title} · Segundo capítulo`;
  await page
    .getByRole("button", { name: "Criar uma obra", exact: false })
    .click();
  await page.getByLabel("Nome da obra", { exact: true }).fill(title);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Criar obra", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Buscar obras e capítulos" })
    .fill(title);
  await expect(page.locator(".series-card")).toHaveCount(1);
  await page
    .getByRole("link", { name: "Gerenciar obra", exact: false })
    .click();
  await expect(page.locator(".series-hero-copy h1")).toHaveText(title);
  const workUrl = page.url();
  await page
    .getByRole("button", { name: "Adicionar arquivos", exact: true })
    .click();
  await expect(
    page.getByLabel("Obra", { exact: true }).locator("option:checked"),
  ).toHaveText(title);
  await page.getByLabel("Criar novo volume", { exact: true }).check();
  await expect(
    page.getByRole("dialog").getByLabel("Volume", { exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Número do novo volume", { exact: true }).fill("2");
  await page.locator('.batch-dropzone input[type="file"]').setInputFiles([
    {
      name: "capitulo-02.pdf",
      mimeType: "application/pdf",
      buffer: originalPdf(),
    },
    {
      name: "capitulo-01.pdf",
      mimeType: "application/pdf",
      buffer: originalPdf(),
    },
  ]);
  await expect(page.locator(".batch-item")).toHaveCount(2);
  await expect(
    page.locator(".batch-item").first().locator("header strong"),
  ).toContainText("capitulo-01.pdf");
  await page
    .locator(".batch-item")
    .first()
    .getByLabel("Título", { exact: true })
    .fill(firstTitle);
  await page
    .locator(".batch-item")
    .last()
    .getByLabel("Título", { exact: true })
    .fill(secondTitle);
  await page
    .getByRole("button", { name: "Adicionar 2 arquivos", exact: true })
    .click();
  await expect(page.locator(".status-done")).toHaveCount(2, { timeout: 20000 });
  await expect(page.locator(".batch-summary")).toContainText(
    "2 de 2 arquivos adicionados com sucesso",
  );
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.locator(".chapter-row")).toHaveCount(2);
  await expect(page.locator(".volume-heading h3")).toHaveText("Volume 2");
  await page.screenshot({ path: "artifacts/admin-redesign/work-desktop.png" });

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${origin}/admin`);
    await expect(page.locator(".series-card").first()).toBeVisible();
    await fits();
    if (width === 390)
      await page.screenshot({ path: "artifacts/admin-redesign/mobile.png" });
    await page
      .getByRole("button", { name: "Enviar arquivos", exact: false })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await fits();
    if (width === 390)
      await page.screenshot({
        path: "artifacts/admin-redesign/batch-mobile.png",
      });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(workUrl);
  await expect(page.locator(".chapter-row")).toHaveCount(2);
  await fits();
  await page.screenshot({ path: "artifacts/admin-redesign/work-mobile.png" });
  await page.goto(`${origin}/manage`);
  await page.getByRole("textbox", { name: "Buscar arquivos" }).fill(firstTitle);
  await expect(page.locator(".manager-row")).toHaveCount(1);
  await fits();
  await page.locator('.manager-row input[type="checkbox"]').check();
  await expect(page.locator(".manager-actions h2")).toHaveText(
    "1 arquivo selecionado",
  );
  await page.getByRole("combobox", { name: /^Ação/ }).selectOption("type");
  await page.getByRole("combobox", { name: /^Tipo/ }).selectOption("volume");
  await page
    .getByRole("button", { name: "Aplicar a 1 arquivo", exact: true })
    .click();
  await expect(page.locator(".manager-message")).toContainText(
    "1 tipo(s) atualizados.",
  );
  await page.screenshot({
    path: "artifacts/admin-redesign/manager-mobile.png",
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: responsive administration at 320/390/768/1440px, compact checkbox/pagination, keyboard dismissal, preselected work, ordered batch upload + new volume, success feedback and file organization. No page errors.",
  );
} finally {
  await browser.close();
}
