import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  branchEdgeColor,
  computeEdgeInfo,
  taperedEdgeWidth,
} from "./edgeStyling";

describe("computeEdgeInfo", () => {
  it("numbers first-level branches and propagates them down", () => {
    const info = computeEdgeInfo([
      { fromId: "r", toId: "a" },
      { fromId: "a", toId: "a1" },
      { fromId: "a1", toId: "a11" },
      { fromId: "r", toId: "b" },
      { fromId: "b", toId: "b1" },
    ]);

    assert.deepEqual(info.get("a"), { depth: 1, branch: 0 });
    assert.deepEqual(info.get("a1"), { depth: 2, branch: 0 });
    assert.deepEqual(info.get("a11"), { depth: 3, branch: 0 });
    assert.deepEqual(info.get("b"), { depth: 1, branch: 1 });
    assert.deepEqual(info.get("b1"), { depth: 2, branch: 1 });
  });

  it("keeps branches distinct across several roots", () => {
    const info = computeEdgeInfo([
      { fromId: "r1", toId: "x" },
      { fromId: "r2", toId: "y" },
    ]);

    assert.equal(info.get("x")!.branch, 0);
    assert.equal(info.get("y")!.branch, 1);
  });
});

describe("taperedEdgeWidth", () => {
  it("keeps the first level at full width and shrinks deeper levels", () => {
    assert.equal(taperedEdgeWidth(8, 2, 1), 8);
    assert.ok(taperedEdgeWidth(8, 2, 2) < 8);
    assert.ok(taperedEdgeWidth(8, 2, 3) < taperedEdgeWidth(8, 2, 2));
  });

  it("never goes below the minimum or above the base", () => {
    assert.equal(taperedEdgeWidth(8, 2, 20), 2);
    assert.equal(taperedEdgeWidth(2, 6, 3), 2);
  });
});

describe("branchEdgeColor", () => {
  it("cycles through the palette", () => {
    assert.equal(
      branchEdgeColor("rainbow", 0),
      branchEdgeColor("rainbow", 8),
    );
    assert.notEqual(
      branchEdgeColor("rainbow", 0),
      branchEdgeColor("rainbow", 1),
    );
  });
});
