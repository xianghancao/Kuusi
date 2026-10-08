import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatPageNumberLabel,
  resolvePageNumberDisplay,
} from "./pageNumberStart";

describe("resolvePageNumberDisplay", () => {
  it("numbers from the first page", () => {
    assert.deepEqual(resolvePageNumberDisplay(0, 5, "first"), {
      show: true,
      page: 1,
      pages: 5,
    });
    assert.deepEqual(resolvePageNumberDisplay(4, 5, "first"), {
      show: true,
      page: 5,
      pages: 5,
    });
  });

  it("skips the first page when starting on the second", () => {
    assert.deepEqual(resolvePageNumberDisplay(0, 5, "second"), {
      show: false,
      page: 0,
      pages: 4,
    });
    assert.deepEqual(resolvePageNumberDisplay(1, 5, "second"), {
      show: true,
      page: 1,
      pages: 4,
    });
    assert.deepEqual(resolvePageNumberDisplay(4, 5, "second"), {
      show: true,
      page: 4,
      pages: 4,
    });
  });
});

describe("formatPageNumberLabel", () => {
  it("formats with and without total", () => {
    assert.equal(formatPageNumberLabel(0, 3, "first", true), "1 / 3");
    assert.equal(formatPageNumberLabel(0, 3, "first", false), "1");
    assert.equal(formatPageNumberLabel(0, 3, "second", true), "");
    assert.equal(formatPageNumberLabel(1, 3, "second", true), "1 / 2");
  });
});
