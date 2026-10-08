import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The menus clamp to ranges defined in TypeScript, while JupyterLab's Settings
 * editor validates against the JSON schemas. When they drift, one of them
 * rejects (or documents the wrong) values the other accepts.
 */

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const schema = (file: string): Record<string, Record<string, unknown>> =>
  (JSON.parse(read(`schema/${file}`)) as { properties: Record<string, Record<string, unknown>> })
    .properties;

/** `export const NAME[: Type] = { min: 0, max: 3, step: 0.05 }` → numbers. */
const range = (
  source: string,
  name: string,
): { min: number; max: number } => {
  const match = new RegExp(
    `export const ${name}[^=]*=\\s*\\{[^}]*?min:\\s*(-?[\\d.]+)[^}]*?max:\\s*(-?[\\d.]+)`,
  ).exec(source);

  assert.ok(match, `${name} not found`);
  return { min: Number(match![1]), max: Number(match![2]) };
};

const constant = (source: string, name: string): number => {
  const match = new RegExp(`export const ${name}\\s*=\\s*(-?[\\d.]+)`).exec(
    source,
  );

  assert.ok(match, `${name} not found`);
  return Number(match![1]);
};

describe("Article schema matches the TypeScript ranges", () => {
  const article = schema("article.json");
  const typography = read("src/typographySettings.ts");
  const settings = read("src/articleSettings.ts");

  it("padding", () => {
    assert.equal(article.padding!.minimum, constant(settings, "ARTICLE_PADDING_MIN"));
    assert.equal(article.padding!.maximum, constant(settings, "ARTICLE_PADDING_MAX"));
  });

  it("line height", () => {
    assert.equal(article.lineHeight!.minimum, constant(settings, "ARTICLE_LINE_HEIGHT_MIN"));
    assert.equal(article.lineHeight!.maximum, constant(settings, "ARTICLE_LINE_HEIGHT_MAX"));
  });

  it("tracking, paragraph spacing and indent", () => {
    (
      [
        ["letterSpacing", "LETTER_SPACING_RANGE"],
        ["paragraphSpacing", "PARAGRAPH_SPACING_RANGE"],
        ["paragraphIndent", "PARAGRAPH_INDENT_RANGE"],
      ] as const
    ).forEach(([key, name]) => {
      const expected = range(typography, name);
      assert.equal(article[key]!.minimum, expected.min, `${key} minimum`);
      assert.equal(article[key]!.maximum, expected.max, `${key} maximum`);
    });
  });

  it("paper border and shadow", () => {
    const border = range(settings, "ARTICLE_PAPER_BORDER_RANGE");
    const shadow = range(settings, "ARTICLE_PAPER_SHADOW_WIDTH_RANGE");
    assert.equal(article.paperBorderWidth!.maximum, border.max);
    assert.equal(article.paperShadowWidth!.maximum, shadow.max);
  });
});

describe("shared typography schema", () => {
  const typography = read("src/typographySettings.ts");

  ["article.json", "markdown-slides.json", "plugin.json"].forEach((file) => {
    it(`${file} documents the units the menus use (pt, not em)`, () => {
      const props = schema(file);
      const ranges = [
        ["letterSpacing", "LETTER_SPACING_RANGE"],
        ["paragraphSpacing", "PARAGRAPH_SPACING_RANGE"],
        ["paragraphIndent", "PARAGRAPH_INDENT_RANGE"],
      ] as const;

      ranges.forEach(([key, name]) => {
        const expected = range(typography, name);
        const prop = props[key];

        assert.ok(prop, `${key} missing in ${file}`);
        assert.equal(prop.minimum, expected.min, `${file} ${key} minimum`);
        assert.equal(prop.maximum, expected.max, `${file} ${key} maximum`);
        assert.doesNotMatch(String(prop.description), /\bin em\b/, `${file} ${key}`);
      });
    });
  });
});
