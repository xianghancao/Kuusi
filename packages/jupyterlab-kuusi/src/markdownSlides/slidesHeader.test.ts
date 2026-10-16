import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fillSlideTokens, resolveSlideHeaderText } from "./slidesHeader";

describe("resolveSlideHeaderText", () => {
  const slides = [
    "# Deck\n\nIntro",
    "## Section A\n\nBody",
    "### Detail\n\nMore",
    "## Section B\n\nNext",
  ];

  it("tracks the nearest heading of the chosen level", () => {
    assert.equal(resolveSlideHeaderText("h1", "", slides, 3), "Deck");
    assert.equal(resolveSlideHeaderText("h2", "", slides, 2), "Section A");
    assert.equal(resolveSlideHeaderText("h2", "", slides, 3), "Section B");
    assert.equal(resolveSlideHeaderText("h3", "", slides, 3), "Detail");
  });

  it("uses custom text when selected", () => {
    assert.equal(
      resolveSlideHeaderText("custom", "  Fixed title  ", slides, 2),
      "Fixed title",
    );
  });

  it("returns empty when no matching heading exists", () => {
    assert.equal(resolveSlideHeaderText("h3", "", ["# Only H1"], 0), "");
  });
});

describe("fillSlideTokens", () => {
  const sources = [
    "# Deck\n\nIntro",
    "## Section A\n\nBody",
    "### Detail\n\nMore",
    "## Section B\n\nNext",
  ];
  const ctx = (index: number) => ({
    title: "My talk",
    page: String(index + 1),
    total: "4",
    slideSources: sources,
    index,
  });

  it("fills title, running chapter / section and page numbers", () => {
    assert.equal(
      fillSlideTokens("{title} · {chapter} · {section} · {page}/{total}", ctx(2)),
      "My talk · Deck · Section A · 3/4",
    );
  });

  it("follows the running section across slides", () => {
    assert.equal(fillSlideTokens("{section}", ctx(3)), "Section B");
    assert.equal(fillSlideTokens("{subsection}", ctx(3)), "Detail");
  });

  it("treats {pages} as the total and drops unknown headings", () => {
    assert.equal(fillSlideTokens("{page} of {pages}", ctx(0)), "1 of 4");
    assert.equal(fillSlideTokens("[{section}]", ctx(0)), "[]");
  });
});
