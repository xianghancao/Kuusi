import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.KUUSI_E2E_URL ?? "http://127.0.0.1:18888";
const token = process.env.KUUSI_E2E_TOKEN ?? "kuusi-e2e-token";
const labUrl = `${baseUrl.replace(/\/$/, "")}/lab?token=${token}`;

const failures = [];

const fail = (message) => {
  failures.push(message);
  console.error(`FAIL: ${message}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];

page.on("pageerror", (error) => {
  pageErrors.push(String(error));
});

try {
  console.log(`Opening ${labUrl}`);
  await page.goto(labUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page
    .waitForSelector("#jupyterlab-splash", { state: "hidden", timeout: 120000 })
    .catch(() => {});

  const fileBrowser = page.getByRole("button", { name: "File Browser" });
  if (await fileBrowser.isVisible().catch(() => false)) {
    await fileBrowser.click({ timeout: 10000 });
  }

  const exampleItem = page
    .locator(".jp-DirListing-item")
    .filter({ hasText: "example.ipynb" })
    .first();

  await exampleItem.waitFor({ state: "visible", timeout: 30000 });
  await exampleItem.dblclick({ timeout: 10000 });
  await page.waitForSelector(".jp-NotebookPanel", { timeout: 30000 });

  const kuusiButton = page.locator(
    '.jp-NotebookPanel-toolbar .jp-KuusiNotebookOpenButton',
  ).filter({ hasText: "Kuusi View" });

  if ((await kuusiButton.count()) === 0) {
    fail("Kuusi View toolbar button not found on notebook panel");
  } else {
    await kuusiButton.first().click({ timeout: 10000 });
  }

  const mindMap = page.locator(".jp-KuusiNotebookMindMap").first();
  await mindMap.waitFor({ state: "visible", timeout: 30000 });

  const headerText = await mindMap
    .locator(".jp-KuusiNotebookMindMap-header-left")
    .innerText();
  for (const label of ["Tree", "Style", "Guide"]) {
    if (!headerText.includes(label)) {
      fail(`Expected Kuusi header to include "${label}"`);
    }
  }

  const cellNodes = mindMap.locator(".jp-KuusiNotebookMindMap-cellNode");
  const nodeCount = await cellNodes.count();
  if (nodeCount < 1) {
    fail(`Expected at least one mind map cell node, got ${nodeCount}`);
  }

  if (pageErrors.length > 0) {
    fail(`Page errors detected: ${pageErrors.join(" | ")}`);
  }

  console.log("PASS: Kuusi mind map opened with header controls and cell nodes");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\nSmoke test failed (${failures.length} issue(s))`);
  process.exit(1);
}

assert.equal(failures.length, 0);
