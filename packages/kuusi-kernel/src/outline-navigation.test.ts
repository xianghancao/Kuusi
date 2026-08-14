import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNotebookOutline } from "./notebook-outline";
import {
  resolveFocusAfterDelete,
  getInsertIndexForChild,
} from "./outline-navigation";
import { md } from "./test-helpers";

describe("resolveFocusAfterDelete", () => {
  const visibleAll = (root: ReturnType<typeof buildNotebookOutline>) => {
    const ids = new Set<string>();

    const visit = (node: (typeof root)["children"][number]) => {
      ids.add(node.id);
      node.children.forEach(visit);
    };

    ids.add(root.id);
    root.children.forEach(visit);
    return ids;
  };

  it("prefers the next sibling", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("## B"),
      md("## C"),
    ]);
    const visible = visibleAll(root);
    const focus = resolveFocusAfterDelete(root, "cell-2", visible);

    assert.equal(focus?.nodeId, "cell-3");
    assert.equal(focus?.cellIndex, 3);
  });

  it("falls back to the previous sibling when there is no next sibling", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("## B"),
    ]);
    const visible = visibleAll(root);
    const focus = resolveFocusAfterDelete(root, "cell-2", visible);

    assert.equal(focus?.nodeId, "cell-1");
    assert.equal(focus?.cellIndex, 1);
  });

  it("falls back to the parent when there are no siblings", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## Only child"),
    ]);
    const visible = visibleAll(root);
    const focus = resolveFocusAfterDelete(root, "cell-1", visible);

    assert.equal(focus?.nodeId, "cell-0");
    assert.equal(focus?.cellIndex, 0);
  });
});

describe("getInsertIndexForChild", () => {
  it("inserts after the subtree", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("### A1"),
      md("## B"),
    ]);

    assert.equal(getInsertIndexForChild(root, "cell-1", 4), 3);
  });
});
