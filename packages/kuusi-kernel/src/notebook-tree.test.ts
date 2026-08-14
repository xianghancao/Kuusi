import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNotebookOutline } from "./notebook-outline";
import {
  collectOutlineSelectionRoots,
  findOutlineNode,
  getDropZoneFromPointer,
  isOutlineDescendant,
  moveOutlineNode,
  moveOutlineNodes,
  normalizeOutlineHeadingLevels,
  resolveDropTarget,
  resolveSiblingGapDrop,
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

describe("getDropZoneFromPointer", () => {
  const rect = { left: 0, top: 0, width: 200, height: 100 };

  it("uses the top band for sibling-before; rear/center nest as child (LR/RL)", () => {
    assert.equal(getDropZoneFromPointer(rect, 100, 10, "LR"), "before");
    assert.equal(getDropZoneFromPointer(rect, 100, 50, "LR"), "inside");
    assert.equal(getDropZoneFromPointer(rect, 100, 90, "LR"), "inside");
    assert.equal(getDropZoneFromPointer(rect, 10, 50, "RL"), "inside");
    assert.equal(getDropZoneFromPointer(rect, 100, 5, "RL"), "before");
  });

  it("uses the leading band for sibling-before; rear/center nest as child (TB/BT)", () => {
    assert.equal(getDropZoneFromPointer(rect, 10, 50, "TB"), "before");
    assert.equal(getDropZoneFromPointer(rect, 100, 50, "TB"), "inside");
    assert.equal(getDropZoneFromPointer(rect, 190, 50, "TB"), "inside");
    assert.equal(getDropZoneFromPointer(rect, 20, 20, "BT"), "before");
  });
});

describe("resolveSiblingGapDrop", () => {
  const items = [
    { id: "a", start: 0, end: 40, crossStart: 100, crossEnd: 280 },
    { id: "b", start: 62, end: 102, crossStart: 100, crossEnd: 280 },
    { id: "c", start: 124, end: 164, crossStart: 100, crossEnd: 280 },
  ];

  it("maps the gap between two cards to before(next)", () => {
    assert.deepEqual(resolveSiblingGapDrop(items, 50, 190), {
      targetNodeId: "b",
      zone: "before",
    });
    assert.deepEqual(resolveSiblingGapDrop(items, 110, 200), {
      targetNodeId: "c",
      zone: "before",
    });
  });

  it("maps just before/after the group", () => {
    assert.deepEqual(resolveSiblingGapDrop(items, -10, 190), {
      targetNodeId: "a",
      zone: "before",
    });
    assert.deepEqual(resolveSiblingGapDrop(items, 180, 190), {
      targetNodeId: "c",
      zone: "after",
    });
  });

  it("keeps far past the top/bottom sibling as extreme insert", () => {
    assert.deepEqual(resolveSiblingGapDrop(items, -400, 190), {
      targetNodeId: "a",
      zone: "before",
    });
    assert.deepEqual(resolveSiblingGapDrop(items, 900, 190), {
      targetNodeId: "c",
      zone: "after",
    });
  });

  it("respects extremeAxisPad when limited", () => {
    assert.equal(
      resolveSiblingGapDrop(items, -400, 190, { extremeAxisPad: 80 }),
      null,
    );
    assert.deepEqual(
      resolveSiblingGapDrop(items, -50, 190, { extremeAxisPad: 80 }),
      { targetNodeId: "a", zone: "before" },
    );
  });

  it("ignores pointers outside the sibling lane", () => {
    assert.equal(resolveSiblingGapDrop(items, 50, 20), null);
  });
});

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

describe("collectOutlineSelectionRoots", () => {
  it("drops selected descendants of another selected node", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("### A1"),
      md("## B"),
      md("## C"),
    ]);

    assert.deepEqual(
      collectOutlineSelectionRoots(root, ["cell-1", "cell-2", "cell-3"]),
      ["cell-1", "cell-3"],
    );
  });
});

describe("moveOutlineNodes", () => {
  it("moves several siblings as one block and keeps order", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("## B"),
      md("## C"),
      md("## D"),
    ]);

    // insertIndex 4 = after D in the pre-move child list.
    const next = moveOutlineNodes(root, ["cell-1", "cell-3"], "cell-0", 4);
    assert.ok(next);
    const parent = findOutlineNode(next, "cell-0")?.node;
    assert.ok(parent);
    assert.deepEqual(
      parent.children.map((child) => child.id),
      ["cell-2", "cell-4", "cell-1", "cell-3"],
    );
  });

  it("nests several roots under a new parent", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("## B"),
      md("## C"),
    ]);

    const next = moveOutlineNodes(root, ["cell-1", "cell-3"], "cell-2", 0);
    assert.ok(next);
    const host = findOutlineNode(next, "cell-2")?.node;
    assert.ok(host);
    assert.deepEqual(
      host.children.map((child) => child.id),
      ["cell-1", "cell-3"],
    );
  });
});

describe("normalizeOutlineHeadingLevels", () => {
  it("promotes ATX H4+ into deep outline levels (Body chrome)", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## L2"),
      md("### L3"),
      md("#### was H4"),
      md("##### was H5"),
    ]);

    assert.equal(findOutlineNode(root, "cell-0")?.node.headingLevel, 1);
    assert.equal(findOutlineNode(root, "cell-1")?.node.headingLevel, 2);
    assert.equal(findOutlineNode(root, "cell-2")?.node.headingLevel, 3);
    assert.equal(findOutlineNode(root, "cell-3")?.node.headingLevel, 4);
    assert.equal(findOutlineNode(root, "cell-4")?.node.headingLevel, 5);

    normalizeOutlineHeadingLevels(root);

    assert.equal(findOutlineNode(root, "cell-3")?.node.headingLevel, 4);
    assert.equal(findOutlineNode(root, "cell-4")?.node.headingLevel, 5);
  });

  it("remaps a moved heading to the depth under its new parent", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("### Nested"),
      md("## B"),
    ]);

    const moved = moveOutlineNode(root, "cell-2", "cell-3", 0);
    assert.ok(moved);
    normalizeOutlineHeadingLevels(moved);

    assert.equal(findOutlineNode(moved, "cell-2")?.node.headingLevel, 3);
    assert.equal(findOutlineNode(moved, "cell-3")?.node.headingLevel, 2);
  });

  it("keeps a heading nested under H3 as deep outline level 4", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("### B"),
      md("## C"),
    ]);

    const nested = moveOutlineNode(root, "cell-3", "cell-2", 0);
    assert.ok(nested);
    normalizeOutlineHeadingLevels(nested);

    assert.equal(findOutlineNode(nested, "cell-2")?.node.headingLevel, 3);
    // C was H2; under H3 it becomes structural level 4 (Body chrome).
    assert.equal(findOutlineNode(nested, "cell-3")?.node.headingLevel, 4);
  });

  it("persists metadata outlineLevel deeper than H3", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("### B"),
      md("Deep", { kuusi: { outlineLevel: 4 } }),
      md("Deeper", { kuusi: { headingLevel: 5 } }),
    ]);

    assert.equal(findOutlineNode(root, "cell-3")?.node.headingLevel, 4);
    assert.equal(findOutlineNode(root, "cell-4")?.node.headingLevel, 5);
  });

  it("assigns structural depth to body nodes that have children", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("Body parent"),
      md("Body child"),
    ]);

    const parent = findOutlineNode(root, "cell-1");
    assert.ok(parent);
    parent.node.children = [findOutlineNode(root, "cell-2")!.node];
    findOutlineNode(root, "cell-2")!.node.headingLevel = null;

    normalizeOutlineHeadingLevels(root);

    assert.equal(findOutlineNode(root, "cell-1")?.node.headingLevel, 2);
    assert.equal(findOutlineNode(root, "cell-2")?.node.headingLevel, null);
  });
});
