/**
 * Probes whether JupyterLab's top menu bar (File / Edit / View …) stays
 * reachable after Kuusi's view fullscreen is entered and left in different ways.
 */
import { chromium } from "playwright";

const baseUrl = process.env.KUUSI_E2E_URL ?? "http://127.0.0.1:18889";
const token = process.env.KUUSI_E2E_TOKEN ?? "kuusi-e2e-token";
const file = process.env.KUUSI_E2E_FILE ?? "article-test.md";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

const menuState = async (label) => {
  const state = await page.evaluate(() => {
    const bar = document.querySelector("#jp-MainMenu, .lm-MenuBar");
    if (!bar) return { found: false };
    const r = bar.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 30, r.top + r.height / 2);
    const lifted = Array.from(document.querySelectorAll("*")).filter(
      (el) => el.style && el.style.zIndex === "100000",
    ).map((el) => el.className.toString().slice(0, 50) || el.tagName);
    return {
      found: true,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      display: getComputedStyle(bar).display,
      visibility: getComputedStyle(bar).visibility,
      reachable: Boolean(hit && (bar === hit || bar.contains(hit))),
      coveredBy: hit && !(bar === hit || bar.contains(hit)) ? `${hit.tagName}.${hit.className.toString().slice(0, 50)}` : null,
      fullscreenElement: document.fullscreenElement
        ? document.fullscreenElement.className.toString().slice(0, 40)
        : null,
      liftedAncestors: lifted,
      viewFullscreenClass: document.querySelectorAll(".jp-KuusiViewFullscreen").length,
    };
  });
  console.log(label.padEnd(34), JSON.stringify(state));
};

try {
  await page.goto(`${baseUrl}/lab/tree/${file}?reset&token=${token}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForSelector("#jupyterlab-splash", { state: "hidden", timeout: 120000 }).catch(() => {});
  await page.waitForSelector(".jp-FileEditor, .jp-MarkdownViewer", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator(".jp-Toolbar").getByText("Kuusi View").first().click();
  await page.locator('.jp-KuusiRenderViewSwitcher-button[data-view-id="article"]').first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(1500);
  await menuState("Article open");

  const corner = page.locator(".jp-KuusiNotebookMindMap-status-fullscreen-btn-kuusi").first();
  console.log("corner button visible:", await corner.isVisible());

  // 1. Enter, then leave with the same button.
  await corner.click();
  await page.waitForTimeout(900);
  await menuState("fullscreen entered");
  await page.locator(".jp-KuusiNotebookMindMap-status-fullscreen-btn-kuusi").first().click().catch(() => {});
  await page.waitForTimeout(900);
  await menuState("left via button");

  // 2. Enter, leave with Escape.
  await corner.click();
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  await menuState("left via Escape");

  // 3. Enter, then close the tab with the document in fullscreen.
  await corner.click().catch(() => {});
  await page.waitForTimeout(900);
  await menuState("fullscreen entered again");
  await page.evaluate(() => {
    // Close the Article tab the way a user would (tab close icon).
    const tabs = document.querySelectorAll(".lm-TabBar-tab");
    const article = Array.from(tabs).find((tab) => tab.querySelector(".jp-icon-selectable"));
    void article;
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await menuState("after Escape again");
  await page.screenshot({ path: new URL("./screenshots/menubar-final.png", import.meta.url).pathname });
  console.log("page errors:", errors.slice(0, 3));
} finally {
  await browser.close();
}
