/** Exports the Article view to PDF and saves it for bookmark checks. */
import { chromium } from "playwright";
const baseUrl = process.env.KUUSI_E2E_URL ?? "http://127.0.0.1:18889";
const token = process.env.KUUSI_E2E_TOKEN ?? "kuusi-e2e-token";
const out = process.env.KUUSI_E2E_OUT ?? "/tmp/kuusi-outline.pdf";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
try {
  await page.goto(`${baseUrl}/lab/tree/pdf-outline.md?reset&token=${token}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("#jupyterlab-splash", { state: "hidden", timeout: 120000 }).catch(() => {});
  await page.waitForSelector(".jp-FileEditor", { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.locator(".jp-Toolbar").getByText("Kuusi View").first().click();
  await page.waitForSelector(".jp-KuusiArticle-header", { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.locator(".jp-KuusiRenderExport-trigger").first().click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120000 }),
    page.locator(".jp-KuusiRenderExport-menu [role=menuitem]").first().click(),
  ]);
  await download.saveAs(out);
  console.log("saved", out);
} finally { await browser.close(); }
