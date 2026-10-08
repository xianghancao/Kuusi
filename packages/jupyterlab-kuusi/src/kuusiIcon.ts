import { LabIcon } from "@jupyterlab/ui-components";

/**
 * Spruce in a tall stamp-like frame — tiered silhouette (Kuusi mark).
 * Uses currentColor; tint with --kuusi-brand-green in CSS.
 */
const KUUSI_BRAND_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">
  <rect
    x="3.05"
    y="0.68"
    width="9.9"
    height="14.64"
    rx="1.9"
    ry="1.9"
    stroke="currentColor"
    stroke-width="0.65"
  />
  <g fill="currentColor" transform="translate(8 8.05) scale(0.84 0.94) translate(-8 -8.05)">
    <path d="M8 1.85 9.55 3.95 6.45 3.95Z" />
    <path d="M8 3.35 10.65 5.85 5.35 5.85Z" />
    <path d="M8 5.05 11.55 7.95 4.45 7.95Z" />
    <path d="M8 6.85 12.35 10.05 3.65 10.05Z" />
    <path d="M7.42 9.85h1.16v3.35H7.42z" />
  </g>
</svg>`;

/**
 * Radial mind map — center topic with branches and child nodes.
 * Reads clearly at 16px tabs and 52px launcher tiles.
 */
export const MIND_MAP_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">
  <path
    stroke="currentColor"
    stroke-width="1.35"
    stroke-linecap="round"
    d="M8 6.1V2.8M8 9.9v3.3M6.1 8H2.8M9.9 8h3.3M6.6 9.8 4.1 12.1"
  />
  <circle cx="8" cy="8" r="2" fill="currentColor"/>
  <circle cx="8" cy="2.2" r="1.3" fill="currentColor"/>
  <circle cx="2.2" cy="8" r="1.3" fill="currentColor"/>
  <circle cx="13.8" cy="8" r="1.3" fill="currentColor"/>
  <circle cx="3.8" cy="12.4" r="1.15" fill="currentColor"/>
</svg>`;

export const kuusiBrandIcon = new LabIcon({
  name: "jupyterlab-kuusi:logo",
  svgstr: KUUSI_BRAND_SVG,
});

export const mindMapIcon = new LabIcon({
  name: "jupyterlab-kuusi:mindmap",
  svgstr: MIND_MAP_ICON_SVG,
});

/** Stacked slide cards — Markdown Slides tab / launcher. */
export const SLIDES_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">
  <rect
    x="4.2"
    y="1.6"
    width="9.2"
    height="6.4"
    rx="1.2"
    stroke="currentColor"
    stroke-width="1.15"
  />
  <rect
    x="2.6"
    y="4.2"
    width="9.2"
    height="6.4"
    rx="1.2"
    stroke="currentColor"
    stroke-width="1.15"
    fill="var(--jp-layout-color1, #fff)"
  />
  <rect
    x="2.6"
    y="7.8"
    width="9.2"
    height="6.4"
    rx="1.2"
    stroke="currentColor"
    stroke-width="1.15"
    fill="currentColor"
    fill-opacity="0.18"
  />
</svg>`;

export const slidesIcon = new LabIcon({
  name: "jupyterlab-kuusi:slides",
  svgstr: SLIDES_ICON_SVG,
});

/** Article page — tab / capsule mark (16×16). */
export const ARTICLE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">
  <path
    stroke="currentColor"
    stroke-width="1.2"
    stroke-linejoin="round"
    d="M3.6 1.8h6.8L12.4 3.8v10.4H3.6z"
  />
  <path
    stroke="currentColor"
    stroke-width="1.1"
    stroke-linecap="round"
    d="M5.4 6.4h5.2M5.4 8.8h5.2M5.4 11.2h3.4"
  />
</svg>`;

export const articleIcon = new LabIcon({
  name: "jupyterlab-kuusi:article",
  svgstr: ARTICLE_ICON_SVG,
});

/** Open book — dual facing pages (Book view tab / capsule). */
export const BOOK_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">
  <path
    stroke="currentColor"
    stroke-width="1.15"
    stroke-linejoin="round"
    d="M8 3.2C6.6 2.4 5.1 2.1 3.4 2.1v10.2c1.7 0 3.2.3 4.6 1.1 1.4-.8 2.9-1.1 4.6-1.1V2.1C11 2.1 9.4 2.4 8 3.2z"
  />
  <path
    stroke="currentColor"
    stroke-width="1.1"
    stroke-linecap="round"
    d="M8 3.4v9.8"
  />
</svg>`;

export const bookIcon = new LabIcon({
  name: "jupyterlab-kuusi:book",
  svgstr: BOOK_ICON_SVG,
});

/** @deprecated Use {@link kuusiBrandIcon} or {@link mindMapIcon} explicitly. */
export const kuusiIcon = kuusiBrandIcon;
