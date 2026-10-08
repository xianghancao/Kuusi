/**
 * Deterministic benchmark documents. Same seed → same Markdown, so timings
 * and layout invariants are comparable across code changes.
 */

const WORDS = (
  "article page layout margin heading paragraph reading flow render block " +
  "table column footer header source line break split widow orphan figure " +
  "caption quote list item code sample number value result method system " +
  "design detail note summary section chapter content width height paper"
).split(" ");

const makeRandom = (seed) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const pick = (random, list) => list[Math.floor(random() * list.length)];
const between = (random, min, max) =>
  min + Math.floor(random() * (max - min + 1));

const sentence = (random, minWords, maxWords) => {
  const words = Array.from({ length: between(random, minWords, maxWords) }, () =>
    pick(random, WORDS),
  );
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return `${words.join(" ")}.`;
};

const paragraph = (random, sentences) =>
  Array.from({ length: sentences }, () => sentence(random, 8, 22)).join(" ");

const list = (random) => {
  const ordered = random() < 0.4;
  const count = between(random, 3, 14);

  return Array.from(
    { length: count },
    (_, index) =>
      `${ordered ? `${index + 1}.` : "-"} ${sentence(random, 5, 16)}`,
  ).join("\n");
};

const codeBlock = (random) => {
  const lines = between(random, 8, 55);
  const body = Array.from(
    { length: lines },
    (_, index) =>
      `${"  ".repeat(index % 3)}value_${index} = compute(${index}, "${pick(random, WORDS)}")`,
  ).join("\n");

  return "```python\n" + body + "\n```";
};

const table = (random) => {
  const rows = between(random, 5, 38);
  const header = "| Name | Value | Notes |\n|---|---|---|";
  const body = Array.from(
    { length: rows },
    (_, index) =>
      `| ${pick(random, WORDS)}-${index} | ${between(random, 1, 9999)} | ${sentence(random, 2, 7)} |`,
  ).join("\n");

  return `${header}\n${body}`;
};

const image = (random) => {
  const height = between(random, 120, 320);
  const color = `hsl(${between(random, 0, 359)} 60% 70%)`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${height}">` +
    `<rect width="600" height="${height}" fill="${color}"/></svg>`;

  return `![figure](data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")})`;
};

const quote = (random) => `> ${paragraph(random, between(random, 1, 3))}`;

/**
 * @param {{ sections: number, seed: number, mix: Record<string, number> }} options
 */
const build = ({ sections, seed, mix }) => {
  const random = makeRandom(seed);
  const parts = [`# Benchmark document ${seed}`, paragraph(random, 3)];
  const kinds = Object.entries(mix).flatMap(([kind, weight]) =>
    Array.from({ length: weight }, () => kind),
  );
  const make = {
    paragraph: () => paragraph(random, between(random, 2, 7)),
    list: () => list(random),
    code: () => codeBlock(random),
    table: () => table(random),
    image: () => image(random),
    quote: () => quote(random),
  };

  for (let section = 0; section < sections; section += 1) {
    parts.push(`## Section ${section + 1} ${sentence(random, 2, 4).slice(0, -1)}`);

    const blocks = between(random, 6, 12);

    for (let block = 0; block < blocks; block += 1) {
      if (random() < 0.12) {
        parts.push(`### ${sentence(random, 2, 5).slice(0, -1)}`);
      }

      parts.push(make[pick(random, kinds)]());
    }
  }

  return `${parts.join("\n\n")}\n`;
};

export const DOCUMENTS = {
  /** Mostly prose: the common case (~20 pages). */
  small: build({
    sections: 7,
    seed: 11,
    mix: { paragraph: 8, list: 2, quote: 1, code: 1 },
  }),
  /** Tables, long code, lists, and figures (~60 pages). */
  mixed: build({
    sections: 22,
    seed: 23,
    mix: { paragraph: 4, list: 2, code: 3, table: 3, image: 2, quote: 1 },
  }),
  /** Long manuscript (~300 pages). */
  long: build({
    sections: 105,
    seed: 37,
    mix: { paragraph: 6, list: 2, code: 2, table: 2, image: 1, quote: 1 },
  }),
};
