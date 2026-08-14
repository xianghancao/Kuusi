import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseClipboardMarkdownOutline,
  remapClipboardTopicsUnderBase,
} from "./clipboard-markdown";

describe("parseClipboardMarkdownOutline", () => {
  it("keeps ATX heading levels and treats other lines as Body", () => {
    const topics = parseClipboardMarkdownOutline(
      "# Root\n\n## Child\nplain note\n### Deep\n",
    );

    assert.deepEqual(topics, [
      { title: "Root", level: 1 },
      { title: "Child", level: 2 },
      { title: "plain note", level: null },
      { title: "Deep", level: 3 },
    ]);
  });

  it("skips empty headings and blank lines", () => {
    assert.deepEqual(parseClipboardMarkdownOutline("##   \n\n# Title"), [
      { title: "Title", level: 1 },
    ]);
  });

  it("merges consecutive list items into one Body topic", () => {
    const topics = parseClipboardMarkdownOutline(
      "## Section\n- alpha\n- beta\n* gamma\nplain\n1. one\n2. two\n",
    );

    assert.deepEqual(topics, [
      { title: "Section", level: 2 },
      { title: "- alpha\n- beta\n* gamma", level: null },
      { title: "plain", level: null },
      { title: "1. one\n2. two", level: null },
    ]);
  });

  it("keeps blank lines inside a loose list block", () => {
    assert.deepEqual(
      parseClipboardMarkdownOutline("- a\n\n- b\n\nnote"),
      [
        { title: "- a\n\n- b", level: null },
        { title: "note", level: null },
      ],
    );
  });

  it("keeps nested list indentation in one node", () => {
    assert.deepEqual(
      parseClipboardMarkdownOutline("- parent\n  - child\n  - sibling\n- next"),
      [{ title: "- parent\n  - child\n  - sibling\n- next", level: null }],
    );
  });
});

describe("remapClipboardTopicsUnderBase", () => {
  it("shifts heading hierarchy under the paste base level", () => {
    const remapped = remapClipboardTopicsUnderBase(
      [
        { title: "A", level: 1 },
        { title: "B", level: 2 },
        { title: "note", level: null },
        { title: "C", level: 3 },
      ],
      2,
    );

    assert.deepEqual(remapped, [
      { title: "A", level: 2 },
      { title: "B", level: 3 },
      { title: "note", level: null },
      { title: "C", level: 4 },
    ]);
  });

  it("keeps levels beyond H3 as deep outline (Body chrome)", () => {
    const remapped = remapClipboardTopicsUnderBase(
      [
        { title: "A", level: 1 },
        { title: "B", level: 2 },
        { title: "C", level: 3 },
      ],
      3,
    );

    assert.deepEqual(remapped, [
      { title: "A", level: 3 },
      { title: "B", level: 4 },
      { title: "C", level: 5 },
    ]);
  });

  it("stamps plain lines at the base level when there are no headings", () => {
    const remapped = remapClipboardTopicsUnderBase(
      [
        { title: "one", level: null },
        { title: "two", level: null },
      ],
      2,
    );

    assert.deepEqual(remapped, [
      { title: "one", level: 2 },
      { title: "two", level: 2 },
    ]);
  });

  it("keeps list blocks as Body when there are no headings", () => {
    const remapped = remapClipboardTopicsUnderBase(
      [
        { title: "- a\n- b", level: null },
        { title: "plain", level: null },
      ],
      2,
    );

    assert.deepEqual(remapped, [
      { title: "- a\n- b", level: null },
      { title: "plain", level: 2 },
    ]);
  });

  it("forces Body when the paste base is Body", () => {
    const remapped = remapClipboardTopicsUnderBase(
      [
        { title: "A", level: 1 },
        { title: "B", level: 2 },
      ],
      null,
    );

    assert.deepEqual(remapped, [
      { title: "A", level: null },
      { title: "B", level: null },
    ]);
  });
});
