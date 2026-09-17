import * as UTIF from "utif";
import { isHeicPath, isTiffMime, isTiffPath } from "./imageFormats";

export type DecodedImage = {
  url: string;
  revoke: () => void;
};

const decodeBase64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const decodeTiffBase64 = (base64: string): DecodedImage => {
  const bytes = decodeBase64ToBytes(base64);
  const buffer = new Uint8Array(bytes).buffer;
  const ifds = UTIF.decode(buffer);

  if (ifds.length === 0) {
    throw new Error("Could not read this TIFF file.");
  }

  UTIF.decodeImages(buffer, ifds);
  const first = ifds[0];
  const rgba = UTIF.toRGBA8(first);
  const canvas = document.createElement("canvas");
  canvas.width = first.width;
  canvas.height = first.height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not decode this TIFF file.");
  }

  const imageData = new ImageData(
    new Uint8ClampedArray(rgba),
    first.width,
    first.height,
  );
  ctx.putImageData(imageData, 0, 0);

  const url = canvas.toDataURL("image/png");
  return { url, revoke: () => undefined };
};

export const decodeImageContent = (
  path: string,
  mimetype: string,
  format: ContentsFormat,
  content: string,
): DecodedImage => {
  if (isHeicPath(path)) {
    throw new Error(
      "HEIC/HEIF is not supported yet. Export the image as JPEG or PNG.",
    );
  }

  if (isTiffMime(mimetype) || isTiffPath(path)) {
    if (format !== "base64") {
      throw new Error("Unexpected TIFF encoding from the server.");
    }

    return decodeTiffBase64(content);
  }

  if (format === "base64") {
    return {
      url: `data:${mimetype};base64,${content}`,
      revoke: () => undefined,
    };
  }

  const blob = new Blob([content], { type: mimetype });
  const url = URL.createObjectURL(blob);

  return {
    url,
    revoke: () => {
      URL.revokeObjectURL(url);
    },
  };
};

/** Mirrors Jupyter contents save format names. */
export type ContentsFormat = "base64" | "text" | "json";
