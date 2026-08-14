import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findSpatialNavigationTarget } from "./spatial-navigation";

describe("findSpatialNavigationTarget", () => {
  const nodes = [
    { nodeId: "cell-0", cellIndex: 0, centerX: 100, centerY: 100 },
    { nodeId: "cell-1", cellIndex: 1, centerX: 300, centerY: 100 },
    { nodeId: "cell-2", cellIndex: 2, centerX: 100, centerY: 260 },
    { nodeId: "cell-3", cellIndex: 3, centerX: 300, centerY: 260 },
  ];

  it("moves right to the nearest node on the right", () => {
    const target = findSpatialNavigationTarget("cell-0", nodes, "right");
    assert.equal(target?.nodeId, "cell-1");
  });

  it("moves down to the nearest node below", () => {
    const target = findSpatialNavigationTarget("cell-0", nodes, "down");
    assert.equal(target?.nodeId, "cell-2");
  });

  it("moves left from a right-hand node", () => {
    const target = findSpatialNavigationTarget("cell-3", nodes, "left");
    assert.equal(target?.nodeId, "cell-2");
  });

  it("moves up from a lower node", () => {
    const target = findSpatialNavigationTarget("cell-3", nodes, "up");
    assert.equal(target?.nodeId, "cell-1");
  });
});
