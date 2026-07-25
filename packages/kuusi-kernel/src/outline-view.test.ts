import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNotebookOutline } from "./notebook-outline";
import { collectOutlineSubtreeCellIndices } from "./outline-view";
import { findOutlineNode } from "./notebook-tree";
import { md } from "./test-helpers";

describe("collectOutlineSubtreeCellIndices", () => {
  it("includes the topic cell and every descendant cell", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## Section A"),
      md("### Detail"),
      md("## Section B"),
    ]);
    const sectionA = findOutlineNode(root, "cell-1");

    assert.ok(sectionA);
    assert.deepEqual(collectOutlineSubtreeCellIndices(sectionA.node), [1, 2]);
  });

  it("returns only the leaf for a node without children", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## Section A"),
      md("## Section B"),
    ]);
    const sectionB = findOutlineNode(root, "cell-2");

    assert.ok(sectionB);
    assert.deepEqual(collectOutlineSubtreeCellIndices(sectionB.node), [2]);
  });
});
