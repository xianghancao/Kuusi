import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCellHeadingLevel } from "./notebook-outline";
import { remapSubtreeCellsToRootLevel } from "./subtree-clipboard";
import { md } from "./test-helpers";

describe("remapSubtreeCellsToRootLevel", () => {
  it("shifts markdown headings while preserving relative depth", () => {
    const remapped = remapSubtreeCellsToRootLevel(
      [md("## Parent"), md("### Child"), md("#### Grand")],
      3,
    );

    assert.equal(getCellHeadingLevel(remapped[0]!), 3);
    assert.equal(getCellHeadingLevel(remapped[1]!), 4);
    assert.equal(getCellHeadingLevel(remapped[2]!), 5);
    assert.match(String(remapped[0]!.source), /^### Parent/);
    assert.match(String(remapped[1]!.source), /^#### Child/);
  });

  it("leaves levels unchanged when already matching", () => {
    const remapped = remapSubtreeCellsToRootLevel(
      [md("## Parent"), md("### Child")],
      2,
    );

    assert.equal(getCellHeadingLevel(remapped[0]!), 2);
    assert.equal(getCellHeadingLevel(remapped[1]!), 3);
  });

  it("remaps metadata-only heading levels", () => {
    const remapped = remapSubtreeCellsToRootLevel(
      [
        md("", { kuusi: { headingLevel: 2 } }),
        md("", { kuusi: { headingLevel: 3 } }),
      ],
      4,
    );

    assert.equal(getCellHeadingLevel(remapped[0]!), 4);
    assert.equal(getCellHeadingLevel(remapped[1]!), 5);
  });

  it("stamps metadata on the first markdown cell when none have headings", () => {
    const remapped = remapSubtreeCellsToRootLevel(
      [md("plain note"), md("also plain")],
      2,
    );

    assert.equal(getCellHeadingLevel(remapped[0]!), 2);
    assert.equal(getCellHeadingLevel(remapped[1]!), null);
  });

  it("clamps remapped levels to 1–6", () => {
    const remapped = remapSubtreeCellsToRootLevel(
      [md("##### Deep"), md("###### Deeper")],
      6,
    );

    assert.equal(getCellHeadingLevel(remapped[0]!), 6);
    assert.equal(getCellHeadingLevel(remapped[1]!), 6);
  });
});
