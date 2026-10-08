import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildNotebookOutline } from "./notebook-outline";
import {
  cellsToMarkdownDocument,
  markdownCellIndexToLine,
  markdownCellStartLines,
  markdownDocumentToCells,
  markdownLineToCellIndex,
  splitMarkdownIntoCells,
} from "./markdown-cells";

describe("splitMarkdownIntoCells", () => {
  it("splits on headings preceded by a blank line", () => {
    const cells = splitMarkdownIntoCells(
      "# Root\n\nIntro paragraph.\n\n## Child\n\nMore text.\n",
    );

    assert.equal(cells.length, 2);
    assert.match(cells[0]!.source as string, /^# Root/);
    assert.match(cells[1]!.source as string, /^## Child/);
  });

  it("does not split headings inside fenced code", () => {
    const cells = splitMarkdownIntoCells(
      "# Root\n\n```python\n# not a heading cell\nx = 1\n```\n\n## After code\n",
    );

    assert.equal(cells.length, 2);
    assert.match(cells[0]!.source as string, /# not a heading cell/);
  });

  it("round-trips through cellsToMarkdownDocument", () => {
    const source = "# A\n\nbody a\n\n## B\n\nbody b\n";
    const round = cellsToMarkdownDocument(splitMarkdownIntoCells(source));

    assert.equal(round, source);
  });
});

describe("markdownDocumentToCells", () => {
  it("seeds a root when the document is empty", () => {
    const cells = markdownDocumentToCells("\n");

    assert.equal(cells.length, 1);
    assert.match(cells[0]!.source as string, /^# Title/);
  });

  it("does not write the synthetic root back into the file", () => {
    const source = "---\ntitle: Deck\n---\n\n# Real\n\nBody.\n";
    const cells = markdownDocumentToCells(source);

    assert.match(cells[0]!.source as string, /^# Title/);
    assert.equal(cellsToMarkdownDocument(cells), source);
  });

  it("keeps the root once the user renames it", () => {
    const cells = markdownDocumentToCells("Intro.\n");
    cells[0] = { ...cells[0]!, source: "# Renamed\n" };

    assert.equal(cellsToMarkdownDocument(cells), "# Renamed\n\nIntro.\n");
  });

  it("builds the same outline shape as notebook cells", () => {
    const cells = markdownDocumentToCells(
      "# Root\n\n## Branch\n\nParagraph.\n",
    );
    const root = buildNotebookOutline(cells);

    assert.equal(root.children.length, 1);
    assert.equal(root.children[0]?.children.length, 1);
  });
});

describe("markdownLineToCellIndex", () => {
  it("maps lines to the cell that owns that source range", () => {
    const source = "# Root\n\nIntro.\n\n## Child\n\nBody.\n";
    const cells = markdownDocumentToCells(source);

    assert.ok(cells.length >= 2);
    assert.equal(markdownLineToCellIndex(source, 0), 0);
    assert.equal(markdownLineToCellIndex(source, 4), 1);
  });
});

describe("markdownCellStartLines", () => {
  it("returns the first source line of every cell", () => {
    const source = "# Root\n\nIntro.\n\n## Child\n\nBody.\n";

    assert.deepEqual(markdownCellStartLines(source), [0, 4]);
    assert.equal(markdownCellIndexToLine(source, 1), 4);
  });

  it("maps a synthetic root cell to line 0", () => {
    const source = "Intro.\n\n## Child\n";

    assert.deepEqual(markdownCellStartLines(source), [0, 0, 2]);
    assert.equal(markdownCellIndexToLine(source, 2), 2);
  });
});
