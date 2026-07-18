import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNotebookOutline } from "./notebook-outline";
import {
  findOutlineNode,
  isOutlineDescendant,
  moveOutlineNode,
  resolveDropTarget,
} from "./notebook-tree";
import { getInsertIndexAfterSubtree, getInsertIndexForChild } from "./outline-navigation";
import { code, md } from "./test-helpers";

const sampleOutline = () =>
  buildNotebookOutline([
    md("# Root"),
    md("## Child A"),
    code("x = 1"),
    md("## Child B"),
  ]);

describe("findOutlineNode", () => {
  it("locates nested nodes with parent context", () => {
    const root = sampleOutline();
    const located = findOutlineNode(root, "cell-2");

    assert.ok(located);
    assert.equal(located.node.id, "cell-2");
    assert.equal(located.parent.id, "cell-1");
    assert.equal(located.index, 0);
  });
});

describe("getInsertIndexAfterSubtree", () => {
  it("returns index after the deepest descendant cell", () => {
    const root = sampleOutline();

    assert.equal(getInsertIndexAfterSubtree(root, "cell-1", 10), 3);
    assert.equal(getInsertIndexAfterSubtree(root, "cell-0", 10), 4);
  });
});

describe("getInsertIndexForChild", () => {
  it("returns index after the parent subtree (last child)", () => {
    const root = sampleOutline();

    assert.equal(getInsertIndexForChild(root, "cell-0", 10), 4);
    assert.equal(getInsertIndexForChild(root, "cell-1", 10), 3);
    assert.equal(getInsertIndexForChild(root, "cell-3", 10), 4);
  });
});

describe("resolveDropTarget", () => {
  it("resolves before, inside, and after zones", () => {
    const root = sampleOutline();

    assert.deepEqual(resolveDropTarget(root, "cell-3", "cell-1", "inside"), {
      parentId: "cell-1",
      insertIndex: 1,
    });
    assert.deepEqual(resolveDropTarget(root, "cell-3", "cell-1", "before"), {
      parentId: "cell-0",
      insertIndex: 0,
    });
    assert.deepEqual(resolveDropTarget(root, "cell-2", "cell-1", "after"), {
      parentId: "cell-0",
      insertIndex: 1,
    });
  });

  it("rejects dropping onto a descendant", () => {
    const root = sampleOutline();

    assert.equal(
      resolveDropTarget(root, "cell-0", "cell-2", "inside"),
      null,
    );
    assert.equal(isOutlineDescendant(root, "cell-0", "cell-2"), true);
  });
});

describe("moveOutlineNode", () => {
  it("moves a node to a new parent", () => {
    const root = sampleOutline();
    const next = moveOutlineNode(root, "cell-3", "cell-1", 0);

    assert.ok(next);
    const moved = findOutlineNode(next, "cell-3");
    assert.ok(moved);
    assert.equal(moved.parent.id, "cell-1");
    assert.equal(moved.index, 0);
    assert.equal(
      findOutlineNode(next, "cell-0")?.node.children.some((child) => child.id === "cell-3"),
      false,
    );
  });
});
