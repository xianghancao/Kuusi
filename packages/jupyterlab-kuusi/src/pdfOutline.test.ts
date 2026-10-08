import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPdfOutline,
  headingTitle,
  outlineParents,
  pageIndexAt,
} from "./pdfOutline";

const pages = [
  { y: 0, height: 1000 },
  { y: 1028, height: 1000 },
  { y: 2056, height: 1000 },
];

describe("headingTitle", () => {
  it("drops the anchor pilcrow and collapses whitespace", () => {
    assert.equal(headingTitle("  Section  1 \n Intro ¶ "), "Section 1 Intro");
  });
});

describe("pageIndexAt", () => {
  it("finds the page containing a position", () => {
    assert.equal(pageIndexAt(pages, 10), 0);
    assert.equal(pageIndexAt(pages, 1500), 1);
    assert.equal(pageIndexAt(pages, 2900), 2);
  });

  it("sends a position in the gap between pages to the next page", () => {
    assert.equal(pageIndexAt(pages, 1010), 1);
  });

  it("clamps past the last page", () => {
    assert.equal(pageIndexAt(pages, 99999), 2);
  });
});

describe("buildPdfOutline", () => {
  it("maps headings to 1-based pages and skips empty titles", () => {
    const outline = buildPdfOutline(
      [
        { level: 1, title: "Intro", y: 40 },
        { level: 2, title: "", y: 300 },
        { level: 2, title: "Method", y: 1100 },
        { level: 1, title: "Results", y: 2100 },
      ],
      pages,
    );

    assert.deepEqual(outline, [
      { level: 1, title: "Intro", page: 1 },
      { level: 2, title: "Method", page: 2 },
      { level: 1, title: "Results", page: 3 },
    ]);
  });

  it("keeps a heading on the page whose top edge it touches", () => {
    assert.equal(
      buildPdfOutline([{ level: 1, title: "A", y: 1028 }], pages)[0]!.page,
      2,
    );
  });

  it("returns nothing without pages", () => {
    assert.deepEqual(buildPdfOutline([{ level: 1, title: "A", y: 0 }], []), []);
  });
});

describe("outlineParents", () => {
  it("nests by level", () => {
    assert.deepEqual(
      outlineParents([
        { level: 1 },
        { level: 2 },
        { level: 3 },
        { level: 2 },
        { level: 1 },
        { level: 2 },
      ]),
      [-1, 0, 1, 0, -1, 4],
    );
  });

  it("attaches a skipped level to the nearest shallower heading", () => {
    assert.deepEqual(outlineParents([{ level: 1 }, { level: 3 }, { level: 2 }]), [
      -1, 0, 0,
    ]);
  });

  it("keeps a document that starts below H1 flat at the top", () => {
    assert.deepEqual(outlineParents([{ level: 2 }, { level: 2 }, { level: 3 }]), [
      -1, -1, 1,
    ]);
  });
});
