/** 2×2 linear transform (rotation / flip), same convention as @jupyterlab/imageviewer. */
export type Matrix2 = [number, number, number, number];

export const IDENTITY_MATRIX: Matrix2 = [1, 0, 0, 1];

export const ROTATE_CLOCKWISE_MATRIX: Matrix2 = [0, 1, -1, 0];

export const ROTATE_COUNTERCLOCKWISE_MATRIX: Matrix2 = [0, -1, 1, 0];

export const FLIP_HORIZONTAL_MATRIX: Matrix2 = [-1, 0, 0, 1];

export const FLIP_VERTICAL_MATRIX: Matrix2 = [1, 0, 0, -1];

export const prodMatrix = (
  [a11, a12, a21, a22]: Matrix2,
  [b11, b12, b21, b22]: Matrix2,
): Matrix2 => [
  a11 * b11 + a12 * b21,
  a11 * b12 + a12 * b22,
  a21 * b11 + a22 * b21,
  a21 * b12 + a22 * b22,
];

export const prodVec = (
  [a11, a12, a21, a22]: Matrix2,
  [b1, b2]: [number, number],
): [number, number] => [a11 * b1 + a12 * b2, a21 * b1 + a22 * b2];
