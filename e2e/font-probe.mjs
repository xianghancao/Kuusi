/** Reads what the Article body text really measures (font size, zoom, line height). */
import { chromium } from "playwright";

const baseUrl = process.env.KUUSI_E2E_URL ?? "http://127.0.0.1:18889";
const token = process.env.KUUSI_E2E_TOKEN ?? "kuusi-e2e-token";
const file = process.env.KUUSI_E2E_FILE ?? "article-test.md";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

try {
  await page.goto(`${baseUrl}/lab/tree/${file}?reset&token=${token}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("#jupyterlab-splash", { state: "hidden", timeout: 120000 }).catch(() => {});
  await page.waitForSelector(".jp-FileEditor", { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.locator(".jp-Toolbar").getByText("Kuusi View").first().click();
  await page.waitForSelector(".jp-KuusiArticle-header", { timeout: 30000 });
  await page.waitForTimeout(1800);

  const info = await page.evaluate(() => {
    const paper = document.querySelector(".jp-KuusiArticle-paper");
    const rendered = document.querySelector(".jp-RenderedMarkdown");
    const p = rendered.querySelector("p");
    const li = rendered.querySelector("li");
    const style = getComputedStyle(p);
    const zoomVar = getComputedStyle(rendered).getPropertyValue("--kuusi-render-zoom");
    const rect = rendered.getBoundingClientRect();
    const cssWidth = rendered.offsetWidth;
    return {
      settingVar: paper.style.getPropertyValue("--kuusi-article-font-size") || getComputedStyle(paper).getPropertyValue("--kuusi-article-font-size"),
      paragraphFontSizePx: style.fontSize,
      paragraphLineHeight: style.lineHeight,
      paragraphFontFamily: style.fontFamily.slice(0, 60),
      listItemFontSizePx: li ? getComputedStyle(li).fontSize : null,
      renderZoom: zoomVar.trim(),
      paperCssWidthPx: cssWidth,
      paperOnScreenWidthPx: Math.round(rect.width),
      zoomLabel: document.querySelector(".jp-KuusiNotebookMindMap-status-zoom-btn")?.textContent,
      sizeMenuValueHint: null,
    };
  });
  const px = parseFloat(info.paragraphFontSizePx);
  const zoom = parseFloat(info.renderZoom) || 1;
  console.log(JSON.stringify(info, null, 2));
  console.log(`body text: ${px}px = ${(px * 0.75).toFixed(2)}pt in print; on screen right now ${(px * zoom).toFixed(2)}px (zoom ${zoom})`);
  console.log(`Word 12pt = 16px; Word 10.5pt (五号) = 14px; Word 11pt = 14.67px`);
} finally {
  await browser.close();
}
