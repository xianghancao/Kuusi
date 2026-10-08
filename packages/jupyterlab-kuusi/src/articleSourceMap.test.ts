import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  scanMarkdownBlocks,
  scanMarkdownBlocksHeuristic,
} from "./articleSourceMap";

const scan = (source: string): Array<[number, number, string | null]> =>
  scanMarkdownBlocks(source).map((b) => [b.start, b.end, b.heading]);

describe("scanMarkdownBlocks", () => {
  it("splits paragraphs on blank lines and keeps ATX heading text", () => {
    assert.deepEqual(scan("# Title\n\nfirst\n\nsecond\n"), [
      [0, 1, "Title"],
      [2, 3, null],
      [4, 5, null],
    ]);
  });

  it("starts a new block right after a heading without a blank line", () => {
    assert.deepEqual(scan("# H\ntext right after\n"), [
      [0, 1, "H"],
      [1, 2, null],
    ]);
  });

  it("reads a setext heading as one block with its text", () => {
    assert.deepEqual(scan("Title\n=====\n\npara\n"), [
      [0, 2, "Title"],
      [3, 4, null],
    ]);
    assert.deepEqual(scan("Sub\n---\n\npara\n"), [
      [0, 2, "Sub"],
      [3, 4, null],
    ]);
  });

  it("joins a multi-line paragraph into the setext heading text", () => {
    assert.deepEqual(scan("one\ntwo\n===\n"), [[0, 3, "one\ntwo"]]);
  });

  it("treats a lone --- as a thematic break, not a heading", () => {
    assert.deepEqual(scan("a\n\n---\n\nb\n"), [
      [0, 1, null],
      [2, 3, null],
      [4, 5, null],
    ]);
  });

  it("reads YAML front matter the way CommonMark renders it", () => {
    // `---` is a rule; `title: A` + closing `---` is a setext <h2>.
    assert.deepEqual(scan("---\ntitle: A\n---\n\n# H\n\ntext\n"), [
      [0, 1, null],
      [1, 3, "title: A"],
      [4, 5, "H"],
      [6, 7, null],
    ]);
  });

  it("does not treat other rule characters as setext underlines", () => {
    assert.deepEqual(scan("para\n***\n\nnext\n"), [
      [0, 1, null],
      [1, 2, null],
      [3, 4, null],
    ]);
  });

  it("keeps lists, tables, quotes and fences together", () => {
    assert.deepEqual(scan("- a\n\n- b\n\nafter\n"), [
      [0, 3, null],
      [4, 5, null],
    ]);
    assert.deepEqual(scan("| a | b |\n|---|---|\n| 1 | 2 |\n\nafter\n"), [
      [0, 3, null],
      [4, 5, null],
    ]);
    assert.deepEqual(scan("> a\nlazy\n\nz\n"), [
      [0, 2, null],
      [3, 4, null],
    ]);
    assert.deepEqual(scan("```\n# not a heading\n\n---\n```\n\nafter\n"), [
      [0, 5, null],
      [6, 7, null],
    ]);
  });

  it("handles CRLF input", () => {
    assert.deepEqual(scan("# H\r\n\r\ntext\r\n"), [
      [0, 1, "H"],
      [2, 3, null],
    ]);
  });
});

describe("scanMarkdownBlocks (lexer details)", () => {
  it("reports the heading text the renderer shows", () => {
    assert.equal(
      scanMarkdownBlocks("# **Bold** and [a link](http://x.y) and `code`\n")[0]!
        .heading,
      "Bold and a link and code",
    );
    assert.equal(scanMarkdownBlocks("## ![img](a.png) caption\n")[0]!.heading, " caption".trim());
  });

  it("skips blocks that render nothing", () => {
    // HTML comment and link reference definition produce no element.
    assert.deepEqual(scan("<!-- note -->\n\n[ref]: http://x.y\n\ntext\n"), [
      [4, 5, null],
    ]);
  });

  it("numbers lines exactly, including leading blank lines", () => {
    assert.deepEqual(scan("\n\n# H\n\n\n\ntext\n"), [
      [2, 3, "H"],
      [6, 7, null],
    ]);
  });

  it("keeps an HTML block as one block", () => {
    assert.deepEqual(scan("<div>\n<b>x</b>\n</div>\n\nafter\n"), [
      [0, 3, null],
      [4, 5, null],
    ]);
  });

  it("agrees with the heuristic scanner on ordinary documents", () => {
    const source =
      "# T\n\npara one\nline two\n\n- a\n- b\n\n```py\nx = 1\n```\n\n> q\n\n## S\n\ntail\n";
    assert.deepEqual(
      scanMarkdownBlocks(source).map((b) => [b.start, b.end]),
      scanMarkdownBlocksHeuristic(source).map((b) => [b.start, b.end]),
    );
  });
});
