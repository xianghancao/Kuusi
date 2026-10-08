import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeEnabledRenderViews,
  normalizeRenderViewOrder,
} from "./renderViewOrder";

describe("render view order", () => {
  it("keeps known ids once and appends missing ones", () => {
    assert.deepEqual(normalizeRenderViewOrder(["slides", "book", "slides", "x"]), [
      "slides",
      "book",
      "article",
      "mindmap",
    ]);
  });

  it("falls back to the default order for junk", () => {
    assert.deepEqual(normalizeRenderViewOrder(null), [
      "article",
      "book",
      "mindmap",
      "slides",
    ]);
  });

  it("never leaves the switcher empty", () => {
    assert.deepEqual(normalizeEnabledRenderViews([]), ["article", "mindmap"]);
    assert.deepEqual(normalizeEnabledRenderViews(["slides"]), ["slides"]);
    assert.deepEqual(normalizeEnabledRenderViews("nope"), ["article", "mindmap"]);
  });
});
