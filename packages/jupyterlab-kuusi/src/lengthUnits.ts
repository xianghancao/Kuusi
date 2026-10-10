/**
 * Lengths shown in menus. Word measures type, rules and borders in points and
 * page geometry in millimetres (centimetres); Kuusi keeps its stored values in
 * CSS px / rem and converts only for display and input.
 */

/** 96 px per inch, 72 pt per inch. */
export const PT_PER_PX = 0.75;

/** 1 rem is 16 px, and 1 px is 25.4 / 96 mm. */
export const MM_PER_REM = 25.4 / 6;

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const pxToPtLength = (px: number): number => round(px * PT_PER_PX, 2);

export const ptToPxLength = (pt: number): number => round(pt / PT_PER_PX, 3);

export const remToMm = (rem: number): number => round(rem * MM_PER_REM, 1);

export const mmToRem = (mm: number): number => round(mm / MM_PER_REM, 4);

export const formatPtLength = (pt: number): string =>
  `${Number(pt.toFixed(2))} pt`;

export const formatMmLength = (mm: number): string =>
  `${Number(mm.toFixed(1))} mm`;

/** `"2px"` -> `"1.5pt"`; other units are left alone. */
export const cssLengthLabel = (css: string): string => {
  const match = css.trim().match(/^([\d.]+)\s*(px)$/i);

  if (!match) {
    return css;
  }

  return `${Number(pxToPtLength(Number.parseFloat(match[1])).toFixed(2))}pt`;
};

export type PtRange = { min: number; max: number; step: number };

/**
 * Ranges for the point sliders, chosen so every bound maps back inside the
 * schema's px limits and the defaults sit on the step grid.
 */
export const PT_RANGES = {
  paperBorder: { min: 0, max: 9, step: 0.25 },
  paperShadow: { min: 0, max: 48, step: 1 },
  columnRule: { min: 0.5, max: 3, step: 0.25 },
  codeBorder: { min: 0, max: 6, step: 0.25 },
  codeRadius: { min: 0, max: 18, step: 0.25 },
  imageBorder: { min: 0, max: 9, step: 0.25 },
  imageRadius: { min: 0, max: 24, step: 0.25 },
  nodePaddingX: { min: 3, max: 36, step: 0.25 },
  nodePaddingY: { min: 0, max: 24, step: 0.25 },
} as const satisfies Record<string, PtRange>;

/** Millimetre ranges for the page padding sliders (stored in rem). */
export const MM_RANGES = {
  padding: { min: 2.5, max: 33, step: 0.5 },
  bookGap: { min: 4.5, max: 16.5, step: 0.5 },
} as const satisfies Record<string, PtRange>;
