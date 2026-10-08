/**
 * After Kuusi interactions, does the page itself end up scrolled so that the
 * JupyterLab top bar (File / Edit / View …) is pushed out of view?
 * Prints any ancestor of the menu bar with a non-zero scroll offset, plus the
 * menu bar's own position, after each step.
 */
import { chromium } from "playwright";

const baseUrl = process.env.KUUSI_E2E_URL ?? "http://127.0.0.1:18889";
const token = process.env.KUUSI_E2E_TOKEN ?? "kuusi-e2e-token";
const file = process.env.KUUSI_E2E_FILE ?? "article-test.md";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

const audit = async (label) => {
  const result = await page.evaluate(() => {
    const bar = document.querySelector("#jp-MainMenu, .lm-MenuBar");
    if (!bar) return { bar: null };
    const scrolled = [];
    for (let el = bar; el; el = el.parentElement) {
      if (el.scrollTop || el.scrollLeft) {
        scrolled.push(`${el.tagName}#${el.id}.${el.className.toString().slice(0, 30)} top=${el.scrollTop} left=${el.scrollLeft}`);
      }
    }
    const root = document.scrollingElement;
    if (root && (root.scrollTop || root.scrollLeft)) {
      scrolled.push(`scrollingElement top=${root.scrollTop} left=${root.scrollLeft}`);
    }
    const r = bar.getBoundingClientRect();
    return { barTop: Math.round(r.top), barLeft: Math.round(r.left), scrolled };
  });
  const flag = result.scrolled?.length || result.barTop !== 0 ? "  <-- MOVED" : "";
  console.log(label.padEnd(36), JSON.stringify(result), flag);
};

const hoverEach = async (selector, count = 12) => {
  const items = page.locator(selector);
  const total = Math.min(await items.count(), count);
  for (let i = 0; i < total; i += 1) {
    await items.nth(i).hover().catch(() => {});
    await page.waitForTimeout(160);
  }
};

try {
  await page.goto(`${baseUrl}/lab/tree/${file}?reset&token=${token}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("#jupyterlab-splash", { state: "hidden", timeout: 120000 }).catch(() => {});
  await page.waitForSelector(".jp-FileEditor, .jp-MarkdownViewer", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await audit("editor open");

  await page.locator(".jp-Toolbar").getByText("Kuusi View").first().click();
  await page.locator('.jp-KuusiRenderViewSwitcher-button[data-view-id="article"]').first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(1500);
  await audit("article open");

  for (const trigger of [
    ".jp-KuusiArticleThemeDropdown-trigger",
    ".jp-KuusiArticlePageDropdown-trigger",
    ".jp-KuusiArticleTextDropdown-trigger",
    ".jp-KuusiArticleParagraphDropdown-trigger",
    ".jp-KuusiArticleElementsDropdown-trigger",
  ]) {
    await page.locator(trigger).click();
    await page.waitForTimeout(350);
    await audit(`open ${trigger.slice(16, 40)}`);
    await hoverEach(".jp-KuusiFormatDropdown-menu.is-open .jp-KuusiSecondaryMenu-tab, .jp-KuusiFormatDropdown-menu.is-open .jp-KuusiStyleDropdown-item");
    await audit(`  hovered tabs`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // Zoom control, export menu, scroll buttons in the render pane.
  await page.locator(".jp-KuusiNotebookMindMap-status-zoom-btn").first().click().catch(() => {});
  await page.waitForTimeout(300);
  await audit("zoom slider");
  await page.keyboard.press("Escape");
  await page.locator(".jp-KuusiExport, [class*=Export] button").first().click().catch(() => {});
  await page.waitForTimeout(300);
  await audit("export menu");
  await page.keyboard.press("Escape");

  // Mind Map: switch, click nodes, keyboard.
  await page.locator('.jp-KuusiRenderViewSwitcher-button[data-view-id="mindmap"]').first().click();
  await page.waitForTimeout(2500);
  await audit("mind map open");
  const nodes = page.locator(".jp-KuusiNotebookMindMap-cellNode");
  const count = await nodes.count();
  console.log("mind map nodes:", count);
  for (let i = 0; i < Math.min(count, 6); i += 1) {
    await nodes.nth(i).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
  await audit("clicked nodes");
  for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "Shift+Digit1", "Enter", "Escape", "Tab", "Escape"]) {
    await page.keyboard.press(key).catch(() => {});
    await page.waitForTimeout(200);
  }
  await audit("mind map keys");
  await page.locator(".jp-KuusiNotebookMindMap-layout-toolbar button, .jp-KuusiLayoutDropdown-trigger").first().click().catch(() => {});
  await page.waitForTimeout(300);
  await hoverEach(".jp-KuusiFormatDropdown-menu.is-open .jp-KuusiSecondaryMenu-tab");
  await audit("layout menu hovered");
  await page.keyboard.press("Escape");
  await audit("end");
} finally {
  await browser.close();
}
