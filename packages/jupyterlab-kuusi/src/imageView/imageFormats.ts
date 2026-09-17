/** JupyterLab docregistry file type names supported by Kuusi Image. */
export const KUUSI_IMAGE_FILE_TYPES = [
  "png",
  "gif",
  "jpeg",
  "bmp",
  "tiff",
  "webp",
  "svg",
  "ico",
] as const;

export type KuusiImageFileType = (typeof KUUSI_IMAGE_FILE_TYPES)[number];

export const IMAGE_EXTENSIONS = [
  ".png",
  ".gif",
  ".jpg",
  ".jpeg",
  ".bmp",
  ".tif",
  ".tiff",
  ".webp",
  ".svg",
  ".ico",
  ".heic",
  ".heif",
] as const;

const IMAGE_EXT_SET = new Set(
  IMAGE_EXTENSIONS.map((ext) => ext.slice(1).toLowerCase()),
);

export const isKuusiImagePath = (path: string): boolean => {
  const dot = path.lastIndexOf(".");

  if (dot < 0) {
    return false;
  }

  return IMAGE_EXT_SET.has(path.slice(dot + 1).toLowerCase());
};

export const isHeicPath = (path: string): boolean => {
  const lower = path.toLowerCase();
  return lower.endsWith(".heic") || lower.endsWith(".heif");
};

export const isTiffMime = (mimetype: string): boolean =>
  mimetype === "image/tiff" || mimetype === "image/tif";

export const isTiffPath = (path: string): boolean => {
  const lower = path.toLowerCase();
  return lower.endsWith(".tif") || lower.endsWith(".tiff");
};
