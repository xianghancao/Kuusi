/**
 * Small inline-SVG legends ("what does this option look like?") for menu
 * choices. They draw with `currentColor` and the theme's brand colour, so they
 * follow light / dark themes without extra CSS.
 */

import { paperDimensions } from "./articlePaper";

const NS = "http://www.w3.org/2000/svg";

const INK = "currentColor";
const ACCENT = "var(--jp-brand-color1, #1976d2)";
const PAPER = "var(--jp-layout-color0, #ffffff)";

type Attrs = Record<string, string | number>;

const el = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(NS, tag);

  Object.entries(attrs).forEach(([name, value]) => {
    node.setAttribute(name, String(value));
  });
  children.forEach((child) => node.appendChild(child));
  return node;
};

const rect = (x: number, y: number, w: number, h: number, attrs: Attrs = {}) =>
  el("rect", { x, y, width: w, height: h, ...attrs });

const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  attrs: Attrs = {},
) => el("line", { x1, y1, x2, y2, stroke: INK, "stroke-width": 1, ...attrs });

/** A line of text, drawn as a thin rounded bar. */
const bar = (x: number, y: number, w: number, attrs: Attrs = {}) =>
  rect(x, y, Math.max(0.5, w), 1.6, {
    rx: 0.8,
    fill: INK,
    opacity: 0.4,
    ...attrs,
  });

const sheet = (x: number, y: number, w: number, h: number) =>
  rect(x, y, w, h, {
    rx: 1.5,
    fill: PAPER,
    stroke: INK,
    "stroke-opacity": 0.5,
    "stroke-width": 1,
  });

/** `count` text bars starting at (x, y); the last one is shorter. */
const bars = (
  x: number,
  y: number,
  w: number,
  count: number,
  gap = 3.2,
  attrs: Attrs = {},
): SVGElement[] =>
  Array.from({ length: count }, (_, i) =>
    bar(x, y + i * gap, i === count - 1 ? w * 0.6 : w, attrs),
  );

const label = (
  x: number,
  y: number,
  text: string,
  attrs: Attrs = {},
): SVGElement => {
  const node = el("text", {
    x,
    y,
    "font-size": 5.5,
    "text-anchor": "middle",
    fill: INK,
    "font-family": "inherit",
    ...attrs,
  });
  node.textContent = text;
  return node;
};

const LEGEND_W = 40;
const LEGEND_H = 26;

export const legendSvg = (children: SVGElement[]): HTMLElement => {
  const wrap = document.createElement("span");
  wrap.className = "jp-KuusiLegend";
  wrap.setAttribute("aria-hidden", "true");
  wrap.appendChild(
    el(
      "svg",
      {
        viewBox: `0 0 ${LEGEND_W} ${LEGEND_H}`,
        width: LEGEND_W,
        height: LEGEND_H,
      },
      children,
    ),
  );
  return wrap;
};

// --- Page ------------------------------------------------------------------

/** Scroll: one endless page. Paged: separate sheets. */
export const legendPageLayout = (layout: string): HTMLElement =>
  layout === "paged"
    ? legendSvg([
        sheet(11, 1, 18, 11),
        ...bars(14, 4, 12, 2, 3),
        sheet(11, 14, 18, 11),
        ...bars(14, 17, 12, 2, 3),
      ])
    : legendSvg([
        sheet(11, 1, 18, 30),
        ...bars(14, 5, 12, 6, 3.6),
        line(34, 5, 34, 21, { "stroke-opacity": 0.6 }),
        el("path", {
          d: "M31.5 18 L34 21 L36.5 18",
          fill: "none",
          stroke: INK,
          "stroke-opacity": 0.6,
          "stroke-width": 1,
        }),
      ]);

/** Paper sizes differ only in proportion, so draw each to scale. */
export const legendPaperSize = (size: string): HTMLElement => {
  const height = 22;
  const paper = paperDimensions(size, null);
  const width = (height * paper.widthMm) / paper.heightMm;
  const x = (LEGEND_W - width) / 2;

  return legendSvg([
    sheet(x, 2, width, height),
    ...bars(x + 3, 6, width - 6, 4, 3.6),
  ]);
};

export const legendPaperOrientation = (orientation: string): HTMLElement =>
  orientation === "landscape"
    ? legendSvg([sheet(7, 5, 26, 17), ...bars(11, 9, 18, 3, 3.6)])
    : legendSvg([sheet(12, 2, 16, 22), ...bars(15, 6, 10, 4, 3.6)]);

export const legendColumns = (columns: string): HTMLElement =>
  columns === "2"
    ? legendSvg([
        sheet(10, 2, 20, 22),
        ...bars(13, 6, 6, 5, 3.2),
        ...bars(21, 6, 6, 5, 3.2),
        line(20, 5, 20, 21, { "stroke-opacity": 0.25 }),
      ])
    : legendSvg([sheet(10, 2, 20, 22), ...bars(13, 6, 14, 5, 3.2)]);

// --- Page numbers ----------------------------------------------------------

export const legendPageNumberFormat = (format: string): HTMLElement => {
  const children = [sheet(10, 1, 20, 24), ...bars(13, 5, 14, 4, 3.4)];

  const sample: Record<string, string> = {
    page: "3",
    "page-of-total": "3 / 12",
    dashes: "– 3 –",
    bracket: "[3]",
    word: "Page 3",
    "word-of-total": "3 of 12",
    "roman-lower": "iii",
    "roman-upper": "III",
  };
  const text = sample[format];

  if (text) {
    children.push(
      label(20, 22.6, text, {
        fill: ACCENT,
        "font-weight": 600,
        ...(text.length > 1 ? { "font-size": 5 } : {}),
      }),
    );
  }

  return legendSvg(children);
};

/** First: the cover is page 1. Second: the cover is unnumbered. */
export const legendPageNumberStart = (start: string): HTMLElement => {
  const first = start === "first";

  return legendSvg([
    sheet(4, 3, 15, 20),
    ...(first ? bars(6.5, 6, 10, 3, 3.2) : [rect(7, 8, 9, 5, { rx: 1, fill: ACCENT, opacity: 0.45 })]),
    first ? label(11.5, 21, "1", { fill: ACCENT, "font-weight": 600 }) : label(11.5, 21, "–", { opacity: 0.5 }),
    sheet(21, 3, 15, 20),
    ...bars(23.5, 6, 10, 3, 3.2),
    label(28.5, 21, first ? "2" : "1", { fill: ACCENT, "font-weight": 600 }),
  ]);
};

export const legendPageNumberPosition = (position: string): HTMLElement =>
  legendSvg([
    sheet(10, 1, 20, 24),
    ...bars(13, position === "header" ? 8 : 5, 14, 4, 3.4),
    rect(13, position === "header" ? 3.5 : 20.5, 14, 2, {
      rx: 1,
      fill: ACCENT,
      opacity: 0.7,
    }),
  ]);

// --- Alignment -------------------------------------------------------------

/** Text alignment as five lines (left / center / right / justify). */
export const legendAlign = (align: string): HTMLElement => {
  const widths = [26, 20, 24, 16, 22];
  const left = 7;
  const full = 26;

  return legendSvg(
    widths.map((width, i) => {
      const w = align === "justify" ? (i === widths.length - 1 ? 16 : full) : width;
      const x =
        align === "center"
          ? left + (full - w) / 2
          : align === "right"
            ? left + full - w
            : left;
      return bar(x, 4 + i * 4, w);
    }),
  );
};

// --- Images ----------------------------------------------------------------

const image = (x: number, y: number, w: number, h: number): SVGElement[] => [
  rect(x, y, w, h, { rx: 1, fill: ACCENT, opacity: 0.35 }),
  el("path", {
    d: `M${x + 1.5} ${y + h - 1.5} L${x + w * 0.4} ${y + h * 0.45} L${x + w * 0.62} ${y + h * 0.7} L${x + w * 0.78} ${y + h * 0.5} L${x + w - 1.5} ${y + h - 1.5} Z`,
    fill: ACCENT,
    opacity: 0.7,
  }),
];

export const legendImageAlign = (align: string): HTMLElement => {
  const w = 14;
  const x = align === "left" ? 7 : align === "right" ? 33 - w : 20 - w / 2;

  return legendSvg([
    ...bars(7, 3, 26, 1, 3),
    ...image(x, 8, w, 9),
    ...bars(7, 20, 26, 2, 3),
  ]);
};

export const legendImageWrap = (wrap: string): HTMLElement => {
  if (wrap === "left") {
    return legendSvg([
      ...image(7, 3, 12, 10),
      ...bars(21, 3.5, 12, 3, 3.4),
      ...bars(7, 16, 26, 3, 3.4),
    ]);
  }

  if (wrap === "right") {
    return legendSvg([
      ...image(21, 3, 12, 10),
      ...bars(7, 3.5, 12, 3, 3.4),
      ...bars(7, 16, 26, 3, 3.4),
    ]);
  }

  return legendSvg([
    ...bars(7, 3, 26, 1, 3),
    ...image(13, 7, 14, 9),
    ...bars(7, 19, 26, 2, 3.4),
  ]);
};

export const legendImageWidth = (width: string): HTMLElement => {
  const w = width === "full" ? 34 : width === "wide" ? 24 : 12;

  return legendSvg([
    ...bars(3, 3, 34, 1, 3),
    ...image(20 - w / 2, 7, w, 9),
    ...bars(3, 19, 34, 2, 3.4),
  ]);
};

export const legendImageBorder = (style: string): HTMLElement => {
  const attrs: Attrs = {
    x: 7,
    y: 5,
    width: 26,
    height: 16,
    rx: 1,
    fill: ACCENT,
    "fill-opacity": 0.18,
  };

  if (style === "none") {
    return legendSvg([el("rect", attrs)]);
  }

  const stroke: Attrs = {
    ...attrs,
    stroke: INK,
    "stroke-width": style === "double" ? 1 : 1.4,
  };

  if (style === "dashed") {
    stroke["stroke-dasharray"] = "4 2.4";
  } else if (style === "dotted") {
    stroke["stroke-dasharray"] = "0.1 2.6";
    stroke["stroke-linecap"] = "round";
    stroke["stroke-width"] = 1.8;
  }

  const children = [el("rect", stroke)];

  if (style === "double") {
    children.push(
      rect(9.4, 7.4, 21.2, 11.2, {
        rx: 0.6,
        fill: "none",
        stroke: INK,
        "stroke-width": 1,
      }),
    );
  }

  return legendSvg(children);
};

// --- Text elements ---------------------------------------------------------

export const legendLinkStyle = (style: string): HTMLElement =>
  legendSvg([
    ...bars(6, 5, 28, 1, 3),
    label(
      20,
      15,
      "link",
      style === "default"
        ? { "font-size": 8.5, opacity: 0.85 }
        : style === "underline"
          ? { "font-size": 8.5, "text-decoration": "underline" }
          : {
              "font-size": 8.5,
              fill: ACCENT,
              "font-weight": 600,
              "text-decoration": "underline",
            },
    ),
    ...bars(6, 20, 28, 1, 3),
  ]);

export const legendListStyle = (style: string): HTMLElement => {
  const gap = style === "compact" ? 4 : style === "relaxed" ? 7 : 5.5;
  const top = style === "relaxed" ? 3 : 4;

  return legendSvg(
    Array.from({ length: style === "relaxed" ? 3 : 4 }, (_, i) => {
      const y = top + i * gap;
      return el("g", {}, [
        rect(7, y - 0.2, 2, 2, { rx: 1, fill: ACCENT }),
        bar(12, y, 20 - (i % 2) * 4),
      ]);
    }),
  );
};

/** Mini table: 3 columns × 4 rows, drawn the way each style renders. */
export const legendTableStyle = (style: string): HTMLElement => {
  const left = 6;
  const right = 34;
  const top = 4;
  const row = 4.6;
  const rows = 4;
  const bottom = top + rows * row;
  const cols = [left, left + 9.33, left + 18.66, right];
  const children: SVGElement[] = [];
  const hline = (y: number, width = 1, opacity = 0.65) =>
    line(left, y, right, y, { "stroke-width": width, "stroke-opacity": opacity });
  const cells = (): SVGElement[] =>
    Array.from({ length: rows }, (_, r) =>
      [0, 1, 2].map((c) =>
        bar(cols[c]! + 1.4, top + r * row + 1.5, 5.6, {
          opacity: r === 0 ? 0.7 : 0.35,
        }),
      ),
    ).flat();

  if (style === "banded") {
    // Header bar, then every other body row shaded.
    children.push(
      rect(left, top, right - left, row, { fill: ACCENT, opacity: 0.3 }),
      rect(left, top + 2 * row, right - left, row, { fill: INK, opacity: 0.1 }),
    );
  }

  if (style === "grid") {
    for (let r = 0; r <= rows; r += 1) children.push(hline(top + r * row));
    cols.forEach((x) => children.push(line(x, top, x, bottom, { "stroke-opacity": 0.65 })));
  } else if (style === "lines") {
    for (let r = 0; r <= rows; r += 1) children.push(hline(top + r * row, 0.8, 0.45));
  } else if (style === "booktabs") {
    children.push(hline(top, 1.8, 0.8), hline(top + row, 0.7, 0.6), hline(bottom, 1.8, 0.8));
  } else if (style === "ruled") {
    children.push(hline(top, 1, 0.8), hline(top + row, 1, 0.8), hline(bottom, 1, 0.8));
  }

  return legendSvg([...children, ...cells()]);
};

/** `quote`: the bar beside a block quote; `rule`: a horizontal divider. */
export const legendRuleWeight = (
  kind: "quote" | "rule",
  weight: string,
): HTMLElement => {
  const w = weight === "strong" ? 3.2 : weight === "normal" ? 2 : 1;
  const opacity = weight === "light" ? 0.45 : 0.8;

  if (kind === "quote") {
    return legendSvg([
      rect(8, 4, w, 18, { rx: w / 2, fill: INK, opacity }),
      ...bars(14, 6, 18, 3, 5),
    ]);
  }

  return legendSvg([
    ...bars(7, 3, 26, 1, 3),
    rect(7, 11.5, 26, w, { rx: w / 2, fill: INK, opacity }),
    ...bars(7, 18, 26, 2, 3.4),
  ]);
};
