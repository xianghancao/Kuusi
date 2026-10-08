import { PathExt } from "@jupyterlab/coreutils";
import type { Contents } from "@jupyterlab/services";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".avif",
]);

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/avif": ".avif",
};

export const isImageFile = (file: File): boolean =>
  file.type.startsWith("image/") ||
  IMAGE_EXTENSIONS.has(PathExt.extname(file.name).toLowerCase());

/** True while an OS file drag is over the page (names are hidden until drop). */
export const dragHasFiles = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

export const imageFilesFromDrop = (event: DragEvent): File[] =>
  Array.from(event.dataTransfer?.files ?? []).filter(isImageFile);

const timestamp = (): string => {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
};

/**
 * Markdown-safe file name: spaces and brackets break `![](…)` links.
 * Pasted/dragged blobs often arrive as a generic "image.png".
 */
const sanitizeImageName = (file: File): string => {
  let ext = PathExt.extname(file.name).toLowerCase();

  if (!IMAGE_EXTENSIONS.has(ext)) {
    ext = MIME_EXTENSIONS[file.type] ?? ".png";
  }

  let stem = PathExt.basename(file.name, PathExt.extname(file.name))
    .replace(/[\s()[\]<>#?%]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!stem || /^image$/i.test(stem)) {
    stem = `image-${timestamp()}`;
  }

  return `${stem}${ext}`;
};

const pathExists = async (
  contents: Contents.IManager,
  path: string,
): Promise<boolean> => {
  try {
    await contents.get(path, { content: false });
    return true;
  } catch {
    return false;
  }
};

const uniquePath = async (
  contents: Contents.IManager,
  dir: string,
  name: string,
): Promise<string> => {
  const ext = PathExt.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = PathExt.join(dir, name);

  for (let n = 1; await pathExists(contents, candidate); n++) {
    candidate = PathExt.join(dir, `${stem}-${n}${ext}`);
  }

  return candidate;
};

const readBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export interface ISavedImage {
  /** Server path of the written file. */
  path: string;
  /** Link target relative to the document's directory. */
  relativePath: string;
  alt: string;
}

/** Write `file` next to the document at `documentPath`, never overwriting. */
export const saveImageNextToDocument = async (
  contents: Contents.IManager,
  documentPath: string,
  file: File,
): Promise<ISavedImage> => {
  const dir = PathExt.dirname(documentPath);
  const name = sanitizeImageName(file);
  const path = await uniquePath(contents, dir, name);

  await contents.save(path, {
    type: "file",
    format: "base64",
    content: await readBase64(file),
  });

  const relativePath = PathExt.basename(path);

  return {
    path,
    relativePath,
    alt: PathExt.basename(relativePath, PathExt.extname(relativePath)),
  };
};

export const imageMarkdown = (images: ISavedImage[]): string =>
  images.map((image) => `![${image.alt}](${image.relativePath})`).join("\n\n");
