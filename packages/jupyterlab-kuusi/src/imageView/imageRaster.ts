import type { Matrix2 } from "./imageMatrix";
import { prodVec } from "./imageMatrix";

export type ImageCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RasterizeOptions = {
  crop?: ImageCropRect;
  outputWidth?: number;
  outputHeight?: number;
  matrix?: Matrix2;
  invert?: boolean;
  mimeType?: string;
  quality?: number;
};

const clampCrop = (
  crop: ImageCropRect,
  maxW: number,
  maxH: number,
): ImageCropRect => {
  const x = Math.max(0, Math.min(crop.x, maxW - 1));
  const y = Math.max(0, Math.min(crop.y, maxH - 1));
  const width = Math.max(1, Math.min(crop.width, maxW - x));
  const height = Math.max(1, Math.min(crop.height, maxH - y));

  return { x, y, width, height };
};

/**
 * Draw decoded pixels to a canvas (optional crop, rotation/flip, resize, invert).
 */
export const rasterizeImageElement = async (
  img: HTMLImageElement,
  options: RasterizeOptions = {},
): Promise<Blob> => {
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    throw new Error("Image is not loaded yet.");
  }

  const crop = options.crop
    ? clampCrop(options.crop, naturalWidth, naturalHeight)
    : {
        x: 0,
        y: 0,
        width: naturalWidth,
        height: naturalHeight,
      };

  const matrix = options.matrix ?? [1, 0, 0, 1];
  const [a, b, c, d] = matrix;
  const [tX, tY] = prodVec(matrix, [1, 1]);
  const translateX = tX < 0 ? -crop.width : 0;
  const translateY = tY < 0 ? -crop.height : 0;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = crop.width;
  sourceCanvas.height = crop.height;
  const sourceCtx = sourceCanvas.getContext("2d");

  if (!sourceCtx) {
    throw new Error("Could not rasterize the image.");
  }

  if (options.invert) {
    sourceCtx.filter = "invert(1)";
  }

  sourceCtx.setTransform(a, b, c, d, translateX, translateY);
  sourceCtx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  const outW = options.outputWidth ?? crop.width;
  const outH = options.outputHeight ?? crop.height;

  if (outW === crop.width && outH === crop.height) {
    return canvasToBlob(sourceCanvas, options.mimeType, options.quality);
  }

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = Math.max(1, Math.round(outW));
  outputCanvas.height = Math.max(1, Math.round(outH));
  const outputCtx = outputCanvas.getContext("2d");

  if (!outputCtx) {
    throw new Error("Could not resize the image.");
  }

  outputCtx.imageSmoothingEnabled = true;
  outputCtx.imageSmoothingQuality = "high";
  outputCtx.drawImage(sourceCanvas, 0, 0, outputCanvas.width, outputCanvas.height);

  return canvasToBlob(outputCanvas, options.mimeType, options.quality);
};

export const estimateRasterSize = async (
  img: HTMLImageElement,
  options: RasterizeOptions = {},
): Promise<number> => {
  const blob = await rasterizeImageElement(img, options);
  return blob.size;
};

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("Could not read encoded image data."));
        return;
      }

      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Could not read encoded image data."));
    };

    reader.readAsDataURL(blob);
  });

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType = "image/png",
  quality?: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode the image."));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
