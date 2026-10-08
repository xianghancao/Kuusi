import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyLevelStyles,
  hasAnyLevelStyle,
  levelIdForDepth,
  normalizeLevelStyles,
} from "./levelStyles";

describe("levelIdForDepth", () => {
  it("buckets depths into root / l1 / l2 / deep", () => {
    assert.equal(levelIdForDepth(0), "root");
    assert.equal(levelIdForDepth(1), "l1");
    assert.equal(levelIdForDepth(2), "l2");
    assert.equal(levelIdForDepth(3), "deep");
    assert.equal(levelIdForDepth(9), "deep");
  });
});

describe("normalizeLevelStyles", () => {
  it("returns empty styles for junk", () => {
    assert.deepEqual(normalizeLevelStyles(null), emptyLevelStyles());
    assert.deepEqual(normalizeLevelStyles("x"), emptyLevelStyles());
  });

  it("keeps string fields and drops everything else", () => {
    const result = normalizeLevelStyles({
      root: { fill: "#fff", borderWidth: 3, extra: "x" },
      nope: { fill: "#000" },
    });

    assert.equal(result.root.fill, "#fff");
    assert.equal(result.root.borderWidth, "");
    assert.equal(result.l1.fill, "");
  });

  it("detects whether any level overrides something", () => {
    assert.equal(hasAnyLevelStyle(emptyLevelStyles()), false);
    const styles = emptyLevelStyles();
    styles.l2.borderColor = "#123456";
    assert.equal(hasAnyLevelStyle(styles), true);
  });
});
