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
    // Deep levels drop ATX and keep metadata depth.
    assert.doesNotMatch(String(remapped[1]!.source), /^#/);
  });

  it("leaves levels unchanged when already matching", () => {
    const remapped = remapSubtreeCellsToRootLevel(
      [md("## Parent"), md("### Child")],
      2,
    );

    assert.equal(getCellHeadingLevel(remapped[0]!), 2);
    assert.equal(getCellHeadingLevel(remapped[1]!), 3);
  });

  it("remaps metadata-only heading levels into deep outline", () => {
    const remapped = remapSubtreeCellsToRootLevel(
      [
        md("", { kuusi: { headingLevel: 2 } }),
        md("", { kuusi: { headingLevel: 3 } }),
      ],
      3,
    );

    assert.equal(getCellHeadingLevel(remapped[0]!), 3);
    assert.equal(getCellHeadingLevel(remapped[1]!), 4);
  });

  it("stamps metadata on the first markdown cell when none have headings", () => {
    const remapped = remapSubtreeCellsToRootLevel(
      [md("plain note"), md("also plain")],
      2,
    );

    assert.equal(getCellHeadingLevel(remapped[0]!), 2);
    assert.equal(getCellHeadingLevel(remapped[1]!), null);
  });

  it("keeps ATX H4+ as deep outline under a deep paste target", () => {
    const remapped = remapSubtreeCellsToRootLevel(
      [md("##### Deep"), md("###### Deeper")],
      5,
    );

    assert.equal(getCellHeadingLevel(remapped[0]!), 5);
    assert.equal(getCellHeadingLevel(remapped[1]!), 6);
  });

  it("preserves relative depth when remapping under H3", () => {
    const remapped = remapSubtreeCellsToRootLevel(
      [md("# Mid"), md("## Deep"), md("### Deeper")],
      2,
    );

    assert.equal(getCellHeadingLevel(remapped[0]!), 2);
    assert.equal(getCellHeadingLevel(remapped[1]!), 3);
    assert.equal(getCellHeadingLevel(remapped[2]!), 4);
  });
});
