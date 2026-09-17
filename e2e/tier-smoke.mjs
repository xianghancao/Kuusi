/**
 * Short release-tier smoke: core launcher + API off; full override + API on.
 * Run after scripts/run-e2e-smoke.sh starts Jupyter, or with KUUSI_E2E_URL / TOKEN set.
 */
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

const apiGet = async (path) => {
  const url = `${baseUrl.replace(/\/$/, "")}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  const response = await fetch(url);
  return { status: response.status, ok: response.ok };
};

const waitForLab = async (page) => {
  await page.goto(labUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page
    .waitForSelector("#jupyterlab-splash", { state: "hidden", timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(2000);
};

const openLauncher = async (page) => {
  const launcherTab = page.getByRole("tab", { name: "Launcher" });
  if (await launcherTab.isVisible().catch(() => false)) {
    await launcherTab.click({ timeout: 10000 });
  } else {
    const launcherBtn = page.getByRole("button", { name: "Launcher" });
    if (await launcherBtn.isVisible().catch(() => false)) {
      await launcherBtn.click({ timeout: 10000 });
    }
  }
  await page.waitForSelector(".jp-Launcher", { timeout: 30000 });
};

const kuusiLauncherLabels = async (page) => {
  const section = page.locator(".jp-Launcher-section").filter({
    has: page.locator(".jp-Launcher-sectionTitle", { hasText: "Kuusi" }),
  });
  if ((await section.count()) === 0) {
    return [];
  }
  const cards = section.first().locator(".jp-LauncherCard-label");
  const n = await cards.count();
  const labels = [];
  for (let i = 0; i < n; i++) {
    labels.push((await cards.nth(i).innerText()).trim());
  }
  return labels;
};

console.log("==> Tier smoke: server API (core)");
const compressJob = await apiGet("/jupyterlab-kuusi/compress/job");
const channelStats = await apiGet("/jupyterlab-kuusi/channel-monitor/api/stats");
if (compressJob.status !== 404) {
  fail(`core: compress/job expected 404, got ${compressJob.status}`);
} else {
  console.log("PASS: core compress API returns 404");
}
if (channelStats.status !== 404) {
  fail(`core: channel-monitor stats expected 404, got ${channelStats.status}`);
} else {
  console.log("PASS: core channel-monitor API returns 404");
}

const browser = await chromium.launch({ headless: true });

try {
  console.log("==> Tier smoke: launcher (core, default tier)");
  const corePage = await browser.newPage();
  await waitForLab(corePage);
  await openLauncher(corePage);
  const coreLabels = await kuusiLauncherLabels(corePage);
  console.log(`    Kuusi launcher tiles: ${JSON.stringify(coreLabels)}`);
  if (!coreLabels.some((l) => /mind map/i.test(l))) {
    fail(`core: expected Mind Map launcher tile, got ${JSON.stringify(coreLabels)}`);
  }
  if (!coreLabels.some((l) => /settings/i.test(l))) {
    fail(`core: expected Settings launcher tile, got ${JSON.stringify(coreLabels)}`);
  }
  for (const forbidden of ["Live PDF", "Transfer speed", "Compress", "TeX"]) {
    if (coreLabels.some((l) => l.includes(forbidden))) {
      fail(`core: unexpected launcher tile "${forbidden}"`);
    }
  }
  if (failures.length === 0 || !failures.some((f) => f.startsWith("core: launcher"))) {
    console.log("PASS: core launcher shows Mind Map + Settings only");
  }

  const coreTier = await corePage.evaluate(() =>
    localStorage.getItem("jupyterlab-kuusi:release-tier-override"),
  );
  if (coreTier === "full") {
    fail("core: localStorage override was already full before full-tier test");
  }

  console.log("==> Tier smoke: launcher (full override)");
  const fullPage = await browser.newPage();
  await fullPage.addInitScript(() => {
    localStorage.setItem("jupyterlab-kuusi:release-tier-override", "full");
  });
  await waitForLab(fullPage);
  await openLauncher(fullPage);
  const fullLabels = await kuusiLauncherLabels(fullPage);
  console.log(`    Kuusi launcher tiles: ${JSON.stringify(fullLabels)}`);
  for (const expected of ["Mind Map", "Settings", "Transfer speed", "Compress"]) {
    if (!fullLabels.some((l) => l.includes(expected.split(" ")[0]))) {
      fail(`full: expected launcher tile matching "${expected}", got ${JSON.stringify(fullLabels)}`);
    }
  }
  if (!failures.some((f) => f.startsWith("full: expected launcher"))) {
    console.log("PASS: full override launcher includes Transfer speed and Compress");
  }

  console.log("==> Tier smoke: server API still core with frontend full override");
  const compressAfterFull = await apiGet("/jupyterlab-kuusi/compress/job");
  if (compressAfterFull.status !== 404) {
    fail(
      `full UI override: server compress/job should stay 404 on 0.2.x, got ${compressAfterFull.status}`,
    );
  } else {
    console.log("PASS: server APIs remain disabled when only localStorage is full");
  }

  await fullPage.close();
  await corePage.close();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\nTier smoke failed (${failures.length} issue(s))`);
  process.exit(1);
}

console.log("\nTier smoke: all checks passed");
assert.equal(failures.length, 0);
