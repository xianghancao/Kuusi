import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveElementsSection,
  resolveTextMenuSection,
} from "./textMenuSections";

describe("resolveTextMenuSection", () => {
  it("keeps heading tabs", () => {
    assert.equal(resolveTextMenuSection("h3"), "h3");
  });

  it("sends tabs from the old Text menu to Body", () => {
    ["family", "size", "color", "tracking", "leading", "edit", "link"].forEach(
      (old) => assert.equal(resolveTextMenuSection(old), "body"),
    );
    assert.equal(resolveTextMenuSection(undefined), "body");
  });
});

describe("resolveElementsSection", () => {
  it("maps remembered sub-tabs onto their parent tab", () => {
    assert.equal(resolveElementsSection("image-border", false), "image");
    assert.equal(resolveElementsSection("table-headers", false), "table");
  });

  it("only offers the edit-text tab when the view has one", () => {
    assert.equal(resolveElementsSection("text", true), "text");
    assert.equal(resolveElementsSection("text", false), "code");
  });

  it("falls back to code for unknown ids", () => {
    assert.equal(resolveElementsSection("nope", true), "code");
    assert.equal(resolveElementsSection(undefined, true), "code");
  });
});
