import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SLIDES_SETTINGS,
  slidesSettingsNeedOverflowReflow,
  slidesSettingsNeedSourceRebuild,
} from "./slidesSettings";

describe("slidesSettingsNeedSourceRebuild", () => {
  it("ignores typography and chrome", () => {
    assert.equal(
      slidesSettingsNeedSourceRebuild(DEFAULT_SLIDES_SETTINGS, {
        ...DEFAULT_SLIDES_SETTINGS,
        font: "georgia",
        fontSize: 16,
        showFooter: false,
        ratio: "4:3",
      }),
      false,
    );
  });

  it("rebuilds only when split mode changes", () => {
    assert.equal(
      slidesSettingsNeedSourceRebuild(DEFAULT_SLIDES_SETTINGS, {
        ...DEFAULT_SLIDES_SETTINGS,
        splitMode: "rules",
      }),
      true,
    );
  });
});

describe("slidesSettingsNeedOverflowReflow", () => {
  it("reflows when typography or chrome height changes", () => {
    assert.equal(
      slidesSettingsNeedOverflowReflow(DEFAULT_SLIDES_SETTINGS, {
        ...DEFAULT_SLIDES_SETTINGS,
        fontSize: 16,
      }),
      true,
    );
    assert.equal(
      slidesSettingsNeedOverflowReflow(DEFAULT_SLIDES_SETTINGS, {
        ...DEFAULT_SLIDES_SETTINGS,
        showFooter: false,
      }),
      true,
    );
    assert.equal(
      slidesSettingsNeedOverflowReflow(DEFAULT_SLIDES_SETTINGS, {
        ...DEFAULT_SLIDES_SETTINGS,
        padding: "loose",
      }),
      true,
    );
  });

  it("does not reflow when split mode alone changes (rebuild owns that)", () => {
    assert.equal(
      slidesSettingsNeedOverflowReflow(DEFAULT_SLIDES_SETTINGS, {
        ...DEFAULT_SLIDES_SETTINGS,
        splitMode: "rules",
      }),
      false,
    );
  });

  it("ignores pure accent color tweaks", () => {
    assert.equal(
      slidesSettingsNeedOverflowReflow(DEFAULT_SLIDES_SETTINGS, {
        ...DEFAULT_SLIDES_SETTINGS,
        accentColor: "#ff0000",
        textColor: "#111111",
        stageShadow: false,
        showNavButtons: false,
      }),
      false,
    );
  });
});
