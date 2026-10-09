import "./testDom";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_TYPOGRAPHY_VALUES } from "./typographySettings";
import {
  mindMapSettingsToTypography,
  typographyPatch,
} from "./mindMapTypography";

const sample = {
  ...DEFAULT_TYPOGRAPHY_VALUES,
  displayFont: "arial" as const,
  displayFontSize: 16,
};

describe("mind map typography mapping", () => {
  it("exposes display font as the shared Text font", () => {
    const values = mindMapSettingsToTypography(sample);

    assert.equal(values.font, "arial");
    assert.equal(values.fontSize, 16);
    assert.equal(
      values.headers.h1.fontSize,
      DEFAULT_TYPOGRAPHY_VALUES.headers.h1.fontSize,
    );
  });

  it("writes Text font back to displayFont and keeps headings independent", () => {
    const patch = typographyPatch(
      { unifyEditDisplayFont: false, matchNotebookFont: false },
      { font: "georgia", fontSize: 16 },
    );

    assert.equal(patch.displayFont, "georgia");
    assert.equal(patch.displayFontSize, 16);
    assert.equal(patch.editFont, undefined);
    assert.equal(patch.headers, undefined);
  });

  it("mirrors Text onto edit font when unify is on", () => {
    const patch = typographyPatch(
      { unifyEditDisplayFont: true, matchNotebookFont: false },
      { font: "helvetica" },
    );

    assert.equal(patch.displayFont, "helvetica");
    assert.equal(patch.editFont, "helvetica");
    assert.equal(patch.matchNotebookFont, false);
  });

  it("keeps match-notebook only when Text stays on notebook", () => {
    assert.equal(
      typographyPatch(
        { unifyEditDisplayFont: false, matchNotebookFont: true },
        { font: "notebook" },
      ).matchNotebookFont,
      true,
    );
    assert.equal(
      typographyPatch(
        { unifyEditDisplayFont: false, matchNotebookFont: true },
        { font: "arial" },
      ).matchNotebookFont,
      false,
    );
  });
});
