import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ARTICLE_THEME_PRESETS,
  articleThemeChrome,
} from "./articleSettings";
import { presetMatches } from "./themeRestore";

describe("article theme chrome", () => {
  it("stamps fonts and heading styles when applying a theme", () => {
    const chrome = articleThemeChrome("essay");
    assert.equal(chrome.font, "georgia");
    assert.equal(chrome.headers.h1.font, "garamond");
    assert.equal(chrome.background, "sepia");
    assert.equal(chrome.viewBackground, "paper");
    assert.equal(chrome.measure, "narrow");
    assert.equal(chrome.paragraphIndent, 28);
  });

  it("treats typography as part of restore matching", () => {
    const notebook = ARTICLE_THEME_PRESETS.notebook;
    const chrome = articleThemeChrome("notebook");
    assert.equal(presetMatches(notebook, chrome), true);
    assert.equal(
      presetMatches({ ...notebook, font: "georgia" }, chrome),
      false,
    );
    assert.equal(
      presetMatches({ ...notebook, background: "ink" }, chrome),
      false,
    );
  });

  it("gives each article theme a distinct layout fingerprint", () => {
    assert.equal(ARTICLE_THEME_PRESETS.notebook.backgroundPattern, "notebook");
    assert.equal(ARTICLE_THEME_PRESETS.magazine.columns, 2);
    assert.equal(ARTICLE_THEME_PRESETS.magazine.background, "newspaper");
    assert.equal(ARTICLE_THEME_PRESETS.academic.pageLayout, "paged");
    assert.equal(ARTICLE_THEME_PRESETS.academic.paragraphAlign, "justify");
    assert.equal(ARTICLE_THEME_PRESETS.night.fontSize, 16);
    assert.equal(ARTICLE_THEME_PRESETS.minimal.padding, 3.5);
  });
});
