#!/usr/bin/env node
/**
 * Article pagination benchmark.
 *
 *   node benchmarks/article-paged/run.mjs [--repeats 5] [--only small,mixed] [--out file.json]
 *
 * Bundles harness.ts with esbuild and drives it in Chrome through Playwright
 * (uses the installed Google Chrome; no browser download needed).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";

import { DOCUMENTS } from "./docs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const repeats = Number(flag("repeats", "5"));
const only = flag("only", "").split(",").filter(Boolean);
const out = flag("out", join(here, "results", "latest.json"));
const outDir = join(here, ".build");
mkdirSync(outDir, { recursive: true });

console.log("==> Bundling harness");
await build({
  entryPoints: [join(here, "harness.ts")],
  bundle: true,
  format: "iife",
  outfile: join(outDir, "harness.js"),
  loader: {
    ".svg": "dataurl",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".ttf": "dataurl",
    ".eot": "dataurl",
    ".png": "dataurl",
    ".gif": "dataurl",
  },
  logLevel: "warning",
  absWorkingDir: resolve(here, "../.."),
});

writeFileSync(
  join(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="harness.css"><script src="harness.js"></script>`,
);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
  if (message.text().startsWith("MUT")) console.log(message.text());
});

await page.goto(`file://${join(outDir, "index.html")}`);
await page.waitForFunction(() => window.__bench !== undefined, null, {
  timeout: 30000,
});

if (flag("profile", "")) {
  // Chrome's own layout / style counters around one pagination pass.
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  const metric = async () =>
    Object.fromEntries(
      (await client.send("Performance.getMetrics")).metrics.map((m) => [
        m.name,
        m.value,
      ]),
    );

  for (const name of only.length > 0 ? only : Object.keys(DOCUMENTS)) {
    await page.evaluate(([source]) => window.__bench.prepare(source, 1), [
      DOCUMENTS[name],
    ]);
    const before = await metric();
    const ms = await page.evaluate(() => window.__bench.paginateOnce());
    const after = await metric();
    const d = (key) => after[key] - before[key];

    console.log(
      `${name.padEnd(6)} total ${ms.toFixed(0)}ms | layouts ${d("LayoutCount")} (${(d("LayoutDuration") * 1000).toFixed(0)}ms) | style recalcs ${d("RecalcStyleCount")} (${(d("RecalcStyleDuration") * 1000).toFixed(0)}ms)`,
    );
  }

  await browser.close();
  process.exit(0);
}

if (flag("defaults", "")) {
  const diffs = await page.evaluate(() => window.__bench.defaultsVersusPresets());
  const schemaDiffs = await page.evaluate(() => window.__bench.defaultsVersusSchema());
  let bad = 0;

  console.log("code defaults vs each theme preset (a difference makes the Theme/Page dot light up):");

  for (const [view, keys] of Object.entries(diffs)) {
    console.log(`${view.padEnd(7)} ${keys.length === 0 ? "ok" : `differs: ${keys.join(", ")}`}`);
    // Article ships by default; Book / Slides are informational for now.
    if (view === "article") bad += keys.length;
  }

  console.log("\nJSON schema defaults vs code defaults:");

  for (const [view, keys] of Object.entries(schemaDiffs)) {
    console.log(`${view.padEnd(7)} ${keys.length === 0 ? "ok" : ""}`);
    keys.forEach((key) => console.log(`        ${key}`));
    if (view === "article") bad += keys.length;
  }

  await browser.close();
  process.exit(bad > 0 ? 1 : 0);
}

if (flag("legends", "")) {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1400,
    height: 700,
    deviceScaleFactor: 3,
    mobile: false,
  });
  await page.evaluate(() => window.__bench.legendGallery());
  const file = join(here, "results", "legends.png");
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({
    path: file,
    clip: { x: 0, y: 0, width: 1080, height: 640 },
    scale: "device",
  });
  console.log(`Wrote ${file}`);
  await browser.close();
  process.exit(0);
}

if (flag("sashcpu", "")) {
  const client = await page.context().newCDPSession(page);
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 500 });
  await client.send("Profiler.start");
  await page.evaluate(
    ([source, m]) => window.__bench.sashDrag(source, m),
    [DOCUMENTS[only[0] ?? "long"], flag("sashcpu", "native")],
  );
  const { profile } = await client.send("Profiler.stop");
  const self = new Map();
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)));
  const byFn = new Map();
  for (const node of profile.nodes) {
    const f = node.callFrame;
    const key = `${f.functionName || "(anonymous)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`;
    byFn.set(key, (byFn.get(key) ?? 0) + (self.get(node.id) ?? 0));
  }
  [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, us]) =>
    console.log(`${(us / 1000).toFixed(0).padStart(6)}ms  ${k}`));
  await browser.close();
  process.exit(0);
}

if (flag("sash", "")) {
  console.log("sash drag (90 frames, desk 1200px → 480px)");
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  const metric = async () =>
    Object.fromEntries(
      (await client.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
    );

  for (const name of only.length > 0 ? only : ["mixed", "long"]) {
    for (const mode of ["js", "native"]) {
      const before = await metric();
      const r = await page.evaluate(
        ([source, m]) => window.__bench.sashDrag(source, m),
        [DOCUMENTS[name], mode],
      );
      const after = await metric();
      const d = (key) => after[key] - before[key];
      console.log(
        `${name.padEnd(6)} ${mode.padEnd(7)} re-pages ${String(r.repages).padStart(3)}  zoom steps ${String(r.zoomSteps).padStart(3)} → ${r.finalZoom}%  frame avg ${r.avgFrameMs}ms  max ${r.maxFrameMs}ms`,
      );
      console.log(
        `${" ".repeat(14)}whole run: layout ${(d("LayoutDuration") * 1000).toFixed(0)}ms (${d("LayoutCount")}x)  style ${(d("RecalcStyleDuration") * 1000).toFixed(0)}ms  script ${(d("ScriptDuration") * 1000).toFixed(0)}ms  task ${(d("TaskDuration") * 1000).toFixed(0)}ms`,
      );
    }
  }

  await browser.close();
  process.exit(0);
}

if (flag("experiment", "")) {
  const variants = {
    base: "",
    "pre not a scroller": '[data-kuusi-native-pages="1"] pre { overflow: visible !important; }',
    "pre wraps": '[data-kuusi-native-pages="1"] pre { overflow: visible !important; white-space: pre-wrap !important; }',
    "tr may split": '[data-kuusi-native-pages="1"] tr { break-inside: auto !important; }',
    "no orphans/widows": '[data-kuusi-native-pages="1"] :is(p,li,pre,dd) { orphans: 1 !important; widows: 1 !important; }',
    "no heading keep": '[data-kuusi-native-pages="1"] :is(h1,h2,h3,h4,h5,h6) { break-after: auto !important; }',
    "figures may split": '[data-kuusi-native-pages="1"] :is(img,figure,svg) { break-inside: auto !important; }',
    "none of the above":
      '[data-kuusi-native-pages="1"] * { break-inside: auto !important; break-after: auto !important; orphans: 1 !important; widows: 1 !important; }',
  };
  const name = only[0] ?? "mixed";

  for (const [label, css] of Object.entries(variants)) {
    const r = await page.evaluate(([source, extra]) => window.__bench.experiment(source, extra), [
      DOCUMENTS[name],
      css,
    ]);
    console.log(
      `${label.padEnd(20)} pages ${String(r.pages).padStart(4)}  unused ${String(r.unused).padStart(4)}px  stranded ${r.stranded}`,
    );
  }

  await browser.close();
  process.exit(0);
}

if (flag("map", "")) {
  console.log("source map vs rendered elements (misaligned = block ≠ element at same index)");

  for (const [name, markdown] of Object.entries(DOCUMENTS)) {
    const r = await page.evaluate(([source]) => window.__bench.mapAccuracy(source), [
      markdown,
    ]);
    for (const [scanner, v] of Object.entries(r)) {
      console.log(
        `${name.padEnd(6)} ${scanner.padEnd(9)} blocks ${v.blocks}  elements ${v.elements}  misaligned ${v.misaligned}`,
      );
    }
  }

  await browser.close();
  process.exit(0);
}

if (flag("cpu", "")) {
  // Self-time by function from Chrome's sampling profiler (one pagination pass).
  const client = await page.context().newCDPSession(page);
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 200 });
  const name = only[0] ?? "long";
  await page.evaluate(([source]) => window.__bench.prepare(source, 1), [
    DOCUMENTS[name],
  ]);
  await client.send("Profiler.start");
  await page.evaluate(() => window.__bench.paginateOnce());
  const { profile } = await client.send("Profiler.stop");
  const selfByNode = new Map();
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => {
    selfByNode.set(id, (selfByNode.get(id) ?? 0) + (dt[i] ?? 0));
  });
  const byFunction = new Map();
  for (const node of profile.nodes) {
    const f = node.callFrame;
    const key = `${f.functionName || "(anonymous)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`;
    byFunction.set(key, (byFunction.get(key) ?? 0) + (selfByNode.get(node.id) ?? 0));
  }
  const total = [...byFunction.values()].reduce((a, b) => a + b, 0);
  console.log(`self time by function (${name}), total ${(total / 1000).toFixed(0)}ms`);
  [...byFunction.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .forEach(([key, us]) =>
      console.log(`${(us / 1000).toFixed(0).padStart(6)}ms  ${key}`),
    );
  await browser.close();
  process.exit(0);
}

if (flag("trace", "")) {
  const lines = await page.evaluate(
    ([source]) => window.__bench.debugTrace(source),
    [DOCUMENTS.small],
  );
  lines.forEach((line, index) => console.log(String(index).padStart(3), line));
  await browser.close();
  process.exit(0);
}

if (flag("stability", "")) {
  const counts = await page.evaluate(
    ([source]) => window.__bench.stability(source, 6),
    [DOCUMENTS.small],
  );
  console.log("straddlers after each consecutive run:", counts.join(" → "));
  await browser.close();
  process.exit(0);
}

const version = browser.version();
const results = {};
const sourceMaps = {};

for (const [name, markdown] of Object.entries(DOCUMENTS)) {
  if (only.length > 0 && !only.includes(name)) continue;
  console.log(`==> ${name} (${markdown.length.toLocaleString()} chars)`);
  results[name] = await page.evaluate(
    ([source, count]) => window.__bench.run(source, count),
    [markdown, repeats],
  );
  sourceMaps[name] = await page.evaluate(
    ([source]) => window.__bench.mapAccuracy(source),
    [markdown],
  );
}

await browser.close();

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ chrome: version, repeats, results, sourceMaps, errors }, null, 2) + "\n",
);

console.log(`\nChrome ${version}, median of ${repeats} runs\n`);
console.log(
  "doc     mode    pages  blocks  ms      read-ms  rect-reads  range-reads  crossing  margin  stranded-h  unused  text",
);

for (const [doc, modes] of Object.entries(results)) {
  for (const [mode, r] of Object.entries(modes)) {
    const i = r.invariants;
    console.log(
      [
        doc.padEnd(7),
        mode.padEnd(7),
        String(i.pages).padStart(5),
        String(i.blocks).padStart(7),
        String(r.medianMs).padStart(7),
        String(r.readMs).padStart(8),
        String(r.rectCalls).padStart(11),
        String(r.rangeCalls).padStart(12),
        // Dual-column pages are broken by the browser; the vertical-flow
        // checks below do not apply there (text conservation still does).
        (mode === "dual" ? "-" : String(i.straddlers)).padStart(9),
        (mode === "dual" ? "-" : String(i.marginOverflow)).padStart(7),
        (mode === "dual" ? "-" : String(i.strandedHeadings)).padStart(11),
        (mode === "dual" ? "-" : `${i.avgUnusedPx}px`).padStart(7),
        i.textMatches ? "  ok" : "  MISMATCH",
      ].join(" "),
    );
  }
}

const samples = Object.entries(results).flatMap(([doc, modes]) =>
  Object.entries(modes).flatMap(([mode, r]) =>
    mode !== "dual"
      ? r.invariants.samples.map((sample) => `${doc}/${mode}: ${sample}`)
      : [],
  ),
);

if (samples.length > 0) {
  console.log("\nLayout offenders (single column, JS and native):");
  samples.slice(0, 12).forEach((sample) => console.log(`  ${sample}`));
}

for (const [doc, modes] of Object.entries(results)) {
  for (const [mode, r] of Object.entries(modes)) {
    if (r.invariants.textDiff) {
      console.log(`\ntext diff ${doc}/${mode}: ${r.invariants.textDiff}`);
    }
  }
}

if (errors.length > 0) {
  console.log(`\n${errors.length} page error(s):`);
  errors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
}

console.log("\nsource map (blocks / elements / misaligned)");

for (const [doc, maps] of Object.entries(sourceMaps)) {
  const f = (v) => `${v.blocks}/${v.elements}/${v.misaligned}`;
  console.log(
    `${doc.padEnd(7)} lexer ${f(maps.lexer).padEnd(14)} heuristic ${f(maps.heuristic)}`,
  );
}

console.log(`\nWrote ${out}`);

if (args.includes("--check")) {
  const problems = [];

  for (const [doc, modes] of Object.entries(results)) {
    for (const mode of ["single", "native"]) {
      const inv = modes[mode].invariants;

      if (inv.straddlers > 0)
        problems.push(`${doc}/${mode}: ${inv.straddlers} block(s) cross a page`);
      if (inv.marginOverflow > 0)
        problems.push(`${doc}/${mode}: ${inv.marginOverflow} block(s) in the margin`);
      if (inv.strandedHeadings > 0)
        problems.push(`${doc}/${mode}: ${inv.strandedHeadings} stranded heading(s)`);
    }

    for (const [mode, r] of Object.entries(modes)) {
      if (!r.invariants.textMatches)
        problems.push(`${doc}/${mode}: text lost or duplicated`);
    }
  }

  for (const [doc, maps] of Object.entries(sourceMaps)) {
    const lexer = maps.lexer;

    if (lexer.misaligned > 0 || lexer.blocks !== lexer.elements)
      problems.push(
        `${doc}: source map has ${lexer.blocks} blocks for ${lexer.elements} elements, ${lexer.misaligned} misaligned`,
      );
  }

  if (errors.length > 0) problems.push(`${errors.length} page error(s)`);

  if (problems.length > 0) {
    console.error(`\nCheck failed:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }

  console.log("Check passed.");
}
