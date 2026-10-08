import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeUnicodePath,
  safeDecodeURIComponent,
} from "./markdownResourceUrls";

describe("safeDecodeURIComponent", () => {
  it("decodes valid escapes", () => {
    assert.equal(safeDecodeURIComponent("my%20file.png"), "my file.png");
    assert.equal(safeDecodeURIComponent("%E4%B8%AD.png"), "中.png");
  });

  it("returns the input when a % is not an escape", () => {
    assert.equal(safeDecodeURIComponent("50%.png"), "50%.png");
    assert.equal(safeDecodeURIComponent("100%/a%zz.png"), "100%/a%zz.png");
  });
});

describe("normalizeUnicodePath", () => {
  it("normalizes each segment to NFC", () => {
    const nfd = "é.png"; // e + combining acute
    assert.equal(normalizeUnicodePath(`dir/${nfd}`), "dir/é.png");
  });
});
