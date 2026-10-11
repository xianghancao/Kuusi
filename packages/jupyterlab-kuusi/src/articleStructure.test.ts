import assert from "node:assert/strict";
import { test } from "node:test";
import {
  romanNumeral,
  headingNumberLabels,
  tocEntries,
} from "./articleStructure";

test("romanNumeral writes chapter numbers", () => {
  assert.equal(romanNumeral(1), "I");
  assert.equal(romanNumeral(4), "IV");
  assert.equal(romanNumeral(9), "IX");
  assert.equal(romanNumeral(14), "XIV");
  assert.equal(romanNumeral(49), "XLIX");
  assert.equal(romanNumeral(2024), "MMXXIV");
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

test("roman numbering labels chapters", () => {
  assert.deepEqual(headingNumberLabels([1, 2, 1], "roman"), [
    "I",
    "1.1",
    "II",
  ]);
});

test("number depth limits which levels carry a number", () => {
  assert.deepEqual(headingNumberLabels([1, 2, 3, 1], "decimal", "h1"), ["1", "", "", "2"]);
  assert.deepEqual(headingNumberLabels([1, 2, 3], "decimal", "h2"), ["1", "1.1", ""]);
});

test("start at H2 leaves the title unnumbered", () => {
  assert.deepEqual(
    headingNumberLabels([1, 2, 3, 2], "decimal", "all", "h2"),
    ["", "1", "1.1", "2"],
  );
  assert.deepEqual(
    headingNumberLabels([1, 2, 2], "roman", "all", "h2"),
    ["", "I", "II"],
  );
  assert.deepEqual(
    headingNumberLabels([1, 2, 3, 4], "decimal", "h2", "h2"),
    ["", "1", "1.1", ""],
  );
});

test("tocEntries can leave Heading 1 out and counts depth from H2", () => {
  const list = [
    { level: 1, title: "Doc", number: "" },
    { level: 2, title: "A", number: "1" },
    { level: 3, title: "A.1", number: "1.1" },
    { level: 4, title: "deep", number: "" },
  ];
  assert.deepEqual(tocEntries(list, 2, 2).map((e) => e.title), ["A", "A.1"]);
  assert.deepEqual(tocEntries(list, 2).map((e) => e.title), ["Doc", "A"]);
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
