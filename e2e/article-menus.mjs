/**
 * Opens a Markdown file in Kuusi Article and screenshots the capsule menus, to
 * check legends and hints in the real JupyterLab UI.
 *
 *   KUUSI_E2E_URL=http://127.0.0.1:18889 KUUSI_E2E_TOKEN=... \
 *   KUUSI_E2E_FILE=article-test.md node e2e/article-menus.mjs
 *
 * Shots land in e2e/screenshots/ (git-ignored).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.KUUSI_E2E_URL ?? "http://127.0.0.1:18889";
const token = process.env.KUUSI_E2E_TOKEN ?? "kuusi-e2e-token";
const file = process.env.KUUSI_E2E_FILE ?? "article-test.md";
const outDir = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1500, height: 950 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

const shot = async (name) => {
  await page.screenshot({ path: `${outDir}${name}.png` });
  console.log(`shot ${name}`);
};

try {
  await page.goto(`${baseUrl}/lab/tree/${file}?reset&token=${token}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page
    .waitForSelector("#jupyterlab-splash", { state: "hidden", timeout: 120000 })
    .catch(() => {});

  await page.waitForSelector(".jp-FileEditor, .jp-MarkdownViewer", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot("editor-open");

  // The editor's "Kuusi View" button opens the render pane (Article by default).
  const open = page.locator(".jp-Toolbar").getByText("Kuusi View").first();
  if (await open.isVisible().catch(() => false)) {
    await open.click();
  }

  const article = page
    .locator('.jp-KuusiRenderViewSwitcher-button[data-view-id="article"]')
    .first();
  await article.waitFor({ state: "visible", timeout: 30000 }).catch(async (error) => {
    await shot("debug-no-switcher");
    throw error;
  });
  if ((await article.getAttribute("aria-pressed")) !== "true") {
    await article.click();
  }
  await page.waitForSelector(".jp-KuusiArticle-header", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot("article-open");

  // Page menu: walk the tabs that now carry legends or hints.
  await page.locator(".jp-KuusiArticlePageDropdown-trigger").click();
  await page.waitForTimeout(400);

  for (const tab of [
    "Layout",
    "Paper",
    "Columns",
    "Measure",
    "Padding",
    "Header",
    "Footer",
    "Page numbers",
  ]) {
    const tabButton = page
      .locator(".jp-KuusiFormatDropdown-menu.is-open .jp-KuusiSecondaryMenu-tab")
      .filter({ hasText: new RegExp(`^\\s*${tab}`) })
      .first();

    if ((await tabButton.count()) === 0) {
      console.log(`tab not found: ${tab}`);
      continue;
    }

    await tabButton.hover();
    await page.waitForTimeout(450);
    const menu = page.locator(".jp-KuusiFormatDropdown-menu.is-open").first();
    await menu.screenshot({ path: `${outDir}page-${tab.toLowerCase().replace(/\s+/g, "-")}.png` });
    console.log(`shot page-${tab}`);
  }

  await page.keyboard.press("Escape");

  // Text and Elements menus.
  for (const [trigger, tabs] of [
    [".jp-KuusiArticleTextDropdown-trigger", ["Body", "H1"]],
    [".jp-KuusiArticleParagraphDropdown-trigger", ["Alignment"]],
    [".jp-KuusiArticleElementsDropdown-trigger", ["Image", "Table", "List", "Quote", "Links"]],
  ]) {
    await page.locator(trigger).click();
    await page.waitForTimeout(400);

    for (const tab of tabs) {
      const tabButton = page
        .locator(".jp-KuusiFormatDropdown-menu.is-open .jp-KuusiSecondaryMenu-tab")
        .filter({ hasText: new RegExp(`^\\s*${tab}`) })
        .first();

      if ((await tabButton.count()) === 0) {
        console.log(`tab not found: ${tab}`);
        continue;
      }

      await tabButton.hover();
      await page.waitForTimeout(450);
      await page
        .locator(".jp-KuusiFormatDropdown-menu.is-open")
        .first()
        .screenshot({ path: `${outDir}${trigger.replace(/[^a-z]/gi, "").slice(0, 24)}-${tab.toLowerCase()}.png` });
      console.log(`shot ${tab}`);
    }

    await page.keyboard.press("Escape");
  }

  if (errors.length > 0) {
    console.log(`page errors: ${errors.slice(0, 3).join(" | ")}`);
  }
} finally {
  await browser.close();
}
