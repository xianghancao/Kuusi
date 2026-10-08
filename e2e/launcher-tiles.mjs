/**
 * Checks which Kuusi tiles the Launcher shows (Book / Slides are off by default).
 *   KUUSI_E2E_URL=http://127.0.0.1:18889 node e2e/launcher-tiles.mjs
 */
import { chromium } from "playwright";

const baseUrl = process.env.KUUSI_E2E_URL ?? "http://127.0.0.1:18889";
const token = process.env.KUUSI_E2E_TOKEN ?? "kuusi-e2e-token";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

try {
  await page.goto(`${baseUrl}/lab?reset&token=${token}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page
    .waitForSelector("#jupyterlab-splash", { state: "hidden", timeout: 120000 })
    .catch(() => {});
  await page.waitForSelector('.jp-LauncherCard[data-category="Kuusi"]', {
    state: "attached",
    timeout: 60000,
  });
  await page.waitForTimeout(1500);

  const tiles = await page
    .locator('.jp-LauncherCard[data-category="Kuusi"] .jp-LauncherCard-label')
    .allInnerTexts();
  console.log(`Kuusi tiles: ${tiles.map((t) => t.trim()).join(" | ")}`);
} finally {
  await browser.close();
}
