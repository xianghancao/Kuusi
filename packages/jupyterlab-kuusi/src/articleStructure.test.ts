import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chineseNumeral,
  headingNumberLabels,
  tocEntries,
} from "./articleStructure";

test("chineseNumeral covers 1–99", () => {
  assert.equal(chineseNumeral(1), "一");
  assert.equal(chineseNumeral(10), "十");
  assert.equal(chineseNumeral(12), "十二");
  assert.equal(chineseNumeral(20), "二十");
  assert.equal(chineseNumeral(45), "四十五");
});

test("decimal numbering resets deeper levels", () => {
  assert.deepEqual(
    headingNumberLabels([1, 2, 2, 3, 1, 2], "decimal"),
    ["1", "1.1", "1.2", "1.2.1", "2", "2.1"],
  );
});

test("numbering is relative to the shallowest heading", () => {
  assert.deepEqual(headingNumberLabels([2, 3, 2], "decimal"), ["1", "1.1", "2"]);
});

test("skipped levels do not produce zero segments", () => {
  assert.deepEqual(headingNumberLabels([1, 3, 3], "decimal"), ["1", "1.1", "1.2"]);
});

test("chinese numbering labels chapters", () => {
  assert.deepEqual(headingNumberLabels([1, 2, 1], "chinese"), [
    "第一章",
    "1.1",
    "第二章",
  ]);
});

test("none yields empty labels", () => {
  assert.deepEqual(headingNumberLabels([1, 2], "none"), ["", ""]);
});

test("tocEntries honours depth and drops empty titles", () => {
  const entries = tocEntries(
    [
      { level: 1, title: "A", number: "1" },
      { level: 2, title: "B", number: "1.1" },
      { level: 3, title: "C", number: "1.1.1" },
      { level: 2, title: "", number: "1.2" },
    ],
    2,
  );
  assert.deepEqual(entries.map((e) => e.title), ["A", "B"]);
});
