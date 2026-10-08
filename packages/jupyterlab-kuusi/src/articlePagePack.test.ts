import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { linesToKeepOnPage, resolvePageSplit } from "./articlePagePack";

describe("linesToKeepOnPage", () => {
  it("keeps a block that already fits", () => {
    assert.equal(linesToKeepOnPage(5, 5), "all");
  });

  it("pushes short paragraphs instead of splitting them", () => {
    assert.equal(linesToKeepOnPage(2, 1), "push");
    assert.equal(linesToKeepOnPage(1, 0), "push");
  });

  it("pushes when only one line would stay (orphan)", () => {
    assert.equal(linesToKeepOnPage(8, 1), "push");
  });

  it("pulls one extra line so the next page is not a widow", () => {
    assert.equal(linesToKeepOnPage(5, 4), 3);
  });

  it("splits at the last fitting line when both sides stay ≥2", () => {
    assert.equal(linesToKeepOnPage(10, 6), 6);
  });
});

describe("resolvePageSplit", () => {
  it("forces a split at the page start rather than looping a push", () => {
    assert.equal(resolvePageSplit(8, 1, true), 1);
    assert.equal(resolvePageSplit(8, 0, true), "push");
  });

  it("still pushes when there is room on the next page", () => {
    assert.equal(resolvePageSplit(8, 1, false), "push");
  });
});
