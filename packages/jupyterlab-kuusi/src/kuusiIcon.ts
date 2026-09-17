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

/** “PDF” wordmark — fill-only, 16×16 (launcher / tabs; no stroke doubling). */
export const LIVE_PDF_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
  <g transform="translate(0.85 1.65) scale(0.98)">
    <path
      d="M1.55 12.55V3.75H3.3c1.4 0 2.25.72 2.25 1.82 0 1-.72 1.65-1.82 1.72v.05c1.12.06 1.82.88 1.82 2.02 0 1.28-.9 2.09-2.38 2.09H1.55Zm1.38-6.02h.48c.74 0 1.14-.38 1.14-.95 0-.56-.4-.9-1-.9h-.62v1.85Zm0 3.72h.64c.84 0 1.28-.48 1.28-1.15 0-.72-.44-1.14-1.14-1.14h-.78v2.29z"
    />
    <path
      d="M6.2 12.55V3.75h1.68c2.08 0 3.42 1.58 3.42 4.48 0 2.88-1.34 4.32-3.42 4.32H6.2Zm1.48-1.32h.26c1.3 0 2.08-1.02 2.08-3.08 0-2.02-.78-3.08-2.08-3.08h-.26v6.16z"
    />
    <path
      d="M10.75 12.55V3.75h4.15v1.32h-2.62v2.05h2.38v1.25h-2.38v4.18h-1.53z"
    />
  </g>
</svg>`;

export const livePdfIcon = new LabIcon({
  name: "jupyterlab-kuusi:live-pdf",
  svgstr: LIVE_PDF_ICON_SVG,
});

/** “IMG” wordmark — fill-only, 16×16 (launcher / tabs). */
export const KUUSI_IMAGE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
  <g transform="translate(0.55 1.65) scale(0.98)">
    <path d="M2.2 12.55V3.75h2.95v1.32H3.58v6.16h1.57v1.32H2.2Z" />
    <path
      d="M6.05 12.55V3.75h1.52l2.18 4.72 2.18-4.72h1.52v8.8H9.85V8.42L7.62 12.55h-1.02L4.38 8.42v4.13H6.05Z"
    />
    <path
      d="M11.85 12.55V3.75h3.75c1.62 0 2.58.82 2.58 2.08 0 1.05-.68 1.78-1.72 1.92v.05c1.18.12 1.92.92 1.92 2.12 0 1.52-1.05 2.48-2.72 2.48H11.85Zm1.38-1.32h2.22c.88 0 1.38-.48 1.38-1.22 0-.78-.5-1.25-1.38-1.25h-1.82v2.47Zm0-4.42h1.62c.82 0 1.28-.42 1.28-1.12 0-.75-.46-1.18-1.28-1.18h-1.62v2.3Z"
    />
  </g>
</svg>`;

export const kuusiImageIcon = new LabIcon({
  name: "jupyterlab-kuusi:image",
  svgstr: KUUSI_IMAGE_ICON_SVG,
});

/** @deprecated Use {@link kuusiBrandIcon} or {@link mindMapIcon} explicitly. */
export const kuusiIcon = kuusiBrandIcon;
