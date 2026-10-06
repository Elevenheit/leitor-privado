// Exercise real browser CORS: routing requests here suppresses preflight checks.
// localhost must canonicalize before Auth calls, without widening allowed origins.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const canonical = "http://127.0.0.1:3100";
const browser = await chromium.launch();
try {
  for (const hostname of ["127.0.0.1", "localhost"]) {
    for (const email of ["admin@example.test", "leitor@example.test"]) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      const blocked = [];
      const errors = [];
      try {
        context.on("request", (request) => {
          const origin = new URL(request.url()).origin;
          if (
            ![
              canonical,
              "http://localhost:3100",
              "http://127.0.0.1:54321",
            ].includes(origin)
          )
            blocked.push(origin);
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (
            message.type() === "error" &&
            /CORS|preflight/i.test(message.text())
          ) {
            errors.push(message.text());
          }
        });
        await page.goto(`http://${hostname}:3100/__demo/?source=auth-check`);
        await expect(page).toHaveURL(`${canonical}/__demo/?source=auth-check`);
        await expect(
          page.getByRole("button", { name: "Entrar como leitor", exact: true }),
        ).toBeVisible();
        await page.goto(`http://${hostname}:3100/`);
        await expect(page).toHaveURL(`${canonical}/`);
        await page.getByLabel("E-mail", { exact: true }).fill(email);
        await page.getByLabel("Senha", { exact: true }).fill("nook-local-test");
        await page
          .getByRole("button", { name: "Entrar na biblioteca", exact: true })
          .click();
        await expect(page.locator(".series-card")).toHaveCount(24);
        await page.reload();
        await expect(page.locator(".series-card")).toHaveCount(24);
        assert.deepEqual(errors, []);
        assert.deepEqual(blocked, []);
        console.log(`Local sign-in and reload OK: ${hostname}, ${email}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
