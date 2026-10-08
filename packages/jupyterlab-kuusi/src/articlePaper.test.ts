import assert from "node:assert/strict";
import { test } from "node:test";
import { mmToPt, paperDimensions } from "./articlePaper";

test("A4 portrait and landscape", () => {
  assert.deepEqual(paperDimensions("a4", "portrait"), { widthMm: 210, heightMm: 297, cssName: "A4" });
  assert.deepEqual(paperDimensions("a4", "landscape"), { widthMm: 297, heightMm: 210, cssName: "A4" });
});

test("unknown size falls back to A4", () => {
  assert.equal(paperDimensions("tabloid", null).widthMm, 210);
});

test("Letter width is 612pt", () => {
  assert.equal(Math.round(mmToPt(paperDimensions("letter", null).widthMm)), 612);
});
