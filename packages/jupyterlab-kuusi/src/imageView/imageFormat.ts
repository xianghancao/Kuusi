export const formatFileSize = (bytes: number | undefined | null): string => {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const extensionForMime = (mimetype: string): string => {
  switch (mimetype) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/bmp":
      return ".bmp";
    case "image/tiff":
      return ".tif";
    case "image/svg+xml":
      return ".svg";
    case "image/x-icon":
      return ".ico";
    default:
      return ".png";
  }
};

export const formatMimeShort = (mimetype: string | undefined): string => {
  if (!mimetype) {
    return "—";
  }

  const map: Record<string, string> = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/gif": "GIF",
    "image/webp": "WebP",
    "image/bmp": "BMP",
    "image/svg+xml": "SVG",
    "image/tiff": "TIFF",
    "image/x-icon": "ICO",
  };

  return map[mimetype] ?? mimetype.replace(/^image\//, "").toUpperCase();
};
