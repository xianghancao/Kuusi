import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMindMapEdgePath, collectOutlineEdges, layoutOutlineTree } from "./layout";
import { buildNotebookOutline } from "./notebook-outline";
import { md } from "./test-helpers";

describe("layoutOutlineTree", () => {
  it("returns positions for visible outline nodes", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## Child"),
    ]);
    const positions = layoutOutlineTree(root, {
      direction: "LR",
      density: "normal",
    });
    const byId = new Map(positions.map((position) => [position.id, position]));

    assert.ok(byId.get("cell-0"));
    assert.ok(byId.get("cell-1"));
    assert.equal(byId.get("cell-0")!.width > 0, true);
    assert.equal(byId.get("cell-1")!.x > byId.get("cell-0")!.x, true);
  });

  it("increases parent-child distance when child gap grows", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## Child"),
    ]);
    const compact = layoutOutlineTree(root, {
      direction: "LR",
      density: "normal",
      childGap: 24,
    });
    const loose = layoutOutlineTree(root, {
      direction: "LR",
      density: "normal",
      childGap: 96,
    });
    const compactChild = compact.find((position) => position.id === "cell-1")!;
    const looseChild = loose.find((position) => position.id === "cell-1")!;

    assert.ok(looseChild.x > compactChild.x);
  });

  it("centers sibling branches around the parent even with uneven subtrees", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("### A1"),
      md("### A2"),
      md("### A3"),
      md("## B"),
      md("## C"),
    ]);
    const positions = layoutOutlineTree(root, {
      direction: "LR",
      density: "normal",
    });
    const byId = new Map(positions.map((position) => [position.id, position]));
    const parent = byId.get("cell-0")!;
    const branchIds = [
      ["cell-1", "cell-2", "cell-3", "cell-4"],
      ["cell-5"],
      ["cell-6"],
    ];
    const branchBoxes = branchIds.map((ids) => {
      const boxes = ids.map((id) => byId.get(id)!);
      return {
        start: Math.min(...boxes.map((box) => box.y)),
        end: Math.max(...boxes.map((box) => box.y + box.height)),
      };
    });
    const parentCy = parent.y + parent.height / 2;
    const blockCy =
      (Math.min(...branchBoxes.map((box) => box.start)) +
        Math.max(...branchBoxes.map((box) => box.end))) /
      2;

    assert.ok(Math.abs(blockCy - parentCy) < 1);
    // Packing must not leave nodes (or their edges) in negative SVG space.
    positions.forEach((position) => {
      assert.ok(position.x >= 0, `${position.id} x=${position.x}`);
      assert.ok(position.y >= 0, `${position.id} y=${position.y}`);
    });
  });

  it("left-aligns LR siblings when card widths differ", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## Short"),
      md("## A much longer sibling title"),
      md("## Mid"),
    ]);
    const nodeDimensions = new Map([
      ["cell-0", { width: 200, height: 40 }],
      ["cell-1", { width: 160, height: 40 }],
      ["cell-2", { width: 420, height: 40 }],
      ["cell-3", { width: 240, height: 40 }],
    ]);
    const positions = layoutOutlineTree(root, {
      direction: "LR",
      density: "normal",
      nodeDimensions,
    });
    const byId = new Map(positions.map((position) => [position.id, position]));
    const lefts = ["cell-1", "cell-2", "cell-3"].map(
      (id) => byId.get(id)!.x,
    );

    assert.ok(
      Math.max(...lefts) - Math.min(...lefts) < 0.5,
      `sibling left edges differ: ${lefts.join(", ")}`,
    );
  });

  it("packs sibling subtrees so they do not overlap and edges stay clear", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("### A1"),
      md("### A2"),
      md("### A3"),
      md("## B"),
      md("## C"),
      md("### C1"),
    ]);
    const siblingGap = 22;
    const positions = layoutOutlineTree(root, {
      direction: "LR",
      density: "normal",
      siblingGap,
    });
    const byId = new Map(positions.map((position) => [position.id, position]));

    const subtreeY = (ids: string[]) => {
      const boxes = ids.map((id) => byId.get(id)!);
      return {
        start: Math.min(...boxes.map((box) => box.y)),
        end: Math.max(...boxes.map((box) => box.y + box.height)),
      };
    };

    const branchA = subtreeY(["cell-1", "cell-2", "cell-3", "cell-4"]);
    const branchB = subtreeY(["cell-5"]);
    const branchC = subtreeY(["cell-6", "cell-7"]);

    assert.ok(branchA.end + siblingGap <= branchB.start + 0.5);
    assert.ok(branchB.end + siblingGap <= branchC.start + 0.5);

    const edges = collectOutlineEdges(root);
    const crossings: string[] = [];

    edges.forEach(({ fromId, toId }) => {
      const from = byId.get(fromId)!;
      const to = byId.get(toId)!;
      const path = buildMindMapEdgePath(from, to, "LR");
      const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) =>
        Number(match[0]),
      );

      // Orthogonal path: pairs of coordinates after M/L commands.
      const points: Array<{ x: number; y: number }> = [];
      for (let index = 0; index + 1 < numbers.length; index += 2) {
        points.push({ x: numbers[index]!, y: numbers[index + 1]! });
      }

      positions.forEach((node) => {
        if (node.id === fromId || node.id === toId) {
          return;
        }

        for (let index = 0; index < points.length - 1; index += 1) {
          const a = points[index]!;
          const b = points[index + 1]!;
          const samples = 12;

          for (let sample = 1; sample < samples; sample += 1) {
            const t = sample / samples;
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;

            if (
              x > node.x + 2 &&
              x < node.x + node.width - 2 &&
              y > node.y + 2 &&
              y < node.y + node.height - 2
            ) {
              crossings.push(`${fromId}->${toId} x ${node.id}`);
              return;
            }
          }
        }
      });
    });

    assert.deepEqual(crossings, []);
  });

  it("places sibling cards flush when sibling gap is 0", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("## B"),
      md("## C"),
    ]);
    const dims = new Map([
      ["cell-0", { width: 200, height: 80 }],
      ["cell-1", { width: 200, height: 80 }],
      ["cell-2", { width: 200, height: 80 }],
      ["cell-3", { width: 200, height: 80 }],
    ]);
    const positions = layoutOutlineTree(root, {
      direction: "LR",
      density: "normal",
      siblingGap: 0,
      nodeDimensions: dims,
    });
    const byId = new Map(positions.map((position) => [position.id, position]));
    const a = byId.get("cell-1")!;
    const b = byId.get("cell-2")!;
    const c = byId.get("cell-3")!;

    assert.ok(Math.abs(a.y + a.height - b.y) < 0.5);
    assert.ok(Math.abs(b.y + b.height - c.y) < 0.5);
  });

  it("centers nested parents on TB layouts along X", () => {
    const root = buildNotebookOutline([
      md("# Root"),
      md("## A"),
      md("### A1"),
      md("### A2"),
      md("## B"),
    ]);
    const positions = layoutOutlineTree(root, {
      direction: "TB",
      density: "normal",
    });
    const byId = new Map(positions.map((position) => [position.id, position]));
    const parent = byId.get("cell-0")!;
    const branchA = ["cell-1", "cell-2", "cell-3"].map((id) => byId.get(id)!);
    const branchB = [byId.get("cell-4")!];
    const parentCx = parent.x + parent.width / 2;
    const blockCx =
      (Math.min(
        ...branchA.map((box) => box.x),
        ...branchB.map((box) => box.x),
      ) +
        Math.max(
          ...branchA.map((box) => box.x + box.width),
          ...branchB.map((box) => box.x + box.width),
        )) /
      2;

    assert.ok(Math.abs(blockCx - parentCx) < 1);

    const branch = byId.get("cell-1")!;
    const grand = ["cell-2", "cell-3"].map((id) => byId.get(id)!);
    const branchCx = branch.x + branch.width / 2;
    const grandCx =
      (Math.min(...grand.map((kid) => kid.x)) +
        Math.max(...grand.map((kid) => kid.x + kid.width))) /
      2;

    assert.ok(Math.abs(grandCx - branchCx) < 1);
  });

  it("builds straight, curve, orthogonal, and rounded edge routes", () => {
    const from = { id: "a", x: 0, y: 0, width: 100, height: 40 };
    const to = { id: "b", x: 200, y: 80, width: 100, height: 40 };

    assert.match(
      buildMindMapEdgePath(from, to, "LR", "straight"),
      /^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+$/,
    );
    assert.match(buildMindMapEdgePath(from, to, "LR", "curve"), / C /);
    assert.equal(
      buildMindMapEdgePath(from, to, "LR", "orthogonal").includes("Q"),
      false,
    );
    assert.match(
      buildMindMapEdgePath(from, to, "LR", "rounded-orthogonal"),
      / Q /,
    );
  });
});
