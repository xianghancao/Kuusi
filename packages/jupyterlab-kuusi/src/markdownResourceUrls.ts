import { PathExt, URLExt } from "@jupyterlab/coreutils";
import type { IRenderMime } from "@jupyterlab/rendermime-interfaces";
import type { Contents } from "@jupyterlab/services";

/** Jupyter document resolver (adds `path` beyond {@link IRenderMime.IResolver}). */
export type DocumentContextResolver = IRenderMime.IResolver & {
  path: string;
  isMalformed?: (url: string) => boolean;
};

/** Normalize path segments (macOS NFD filenames vs NFC in markdown). */
export const normalizeUnicodePath = (path: string): string =>
  path
    .split("/")
    .map((segment) => segment.normalize("NFC"))
    .join("/");

const isLocalResourceUrl = (
  url: string,
  resolver: DocumentContextResolver,
): boolean => resolver.isLocal?.(url) ?? URLExt.isLocal(url);

const isResolvableLocalUrl = (
  url: string,
  resolver: DocumentContextResolver,
): boolean => {
  if (!url || url.startsWith("attachment:")) {
    return false;
  }

  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return false;
  }

  if (resolver.isMalformed?.(url)) {
    return false;
  }

  return isLocalResourceUrl(url, resolver);
};

const resolveDocumentRelativePath = (
  url: string,
  resolver: DocumentContextResolver,
  contents: Contents.IManager,
): string => {
  const parent = PathExt.dirname(resolver.path);
  const decoded = decodeURIComponent(url);
  const resolved = contents.resolvePath(parent, decoded);

  return normalizeUnicodePath(contents.normalize(resolved));
};

/**
 * Resolver wrapper: resolve sibling / relative assets against the open document
 * using ContentsManager path normalization (Unicode-safe).
 */
export const wrapDocumentUrlResolver = (
  resolver: DocumentContextResolver,
  contents: Contents.IManager,
): DocumentContextResolver => ({
  get path() {
    return resolver.path;
  },
  set path(value: string) {
    resolver.path = value;
  },
  isLocal: (url, allowRoot) =>
    resolver.isLocal?.(url, allowRoot) ?? URLExt.isLocal(url, allowRoot),
  isMalformed: (url) => resolver.isMalformed?.(url) ?? false,
  resolvePath: (path) => resolver.resolvePath?.(path) ?? Promise.resolve(null),
  resolveUrl: async (url, context) => {
    if (isResolvableLocalUrl(url, resolver)) {
      return resolveDocumentRelativePath(url, resolver, contents);
    }

    return resolver.resolveUrl(url, context);
  },
  getDownloadUrl: async (urlPath) => {
    const normalized = normalizeUnicodePath(decodeURIComponent(urlPath));

    return resolver.getDownloadUrl(normalized);
  },
});

const isAlreadyServedFileUrl = (src: string): boolean =>
  src.includes("/files/") || src.includes("api/contents/");

const patchImageSrc = async (
  img: HTMLImageElement,
  resolver: DocumentContextResolver,
): Promise<void> => {
  const source = img.getAttribute("src") ?? "";

  if (!source || isAlreadyServedFileUrl(source)) {
    return;
  }

  if (!isResolvableLocalUrl(source, resolver)) {
    return;
  }

  try {
    const urlPath = await resolver.resolveUrl(source, {
      attribute: "src",
      tag: "img",
    });
    let url = await resolver.getDownloadUrl(urlPath);

    if (URLExt.parse(url).protocol !== "data:") {
      url += (/\?/.test(url) ? "&" : "?") + String(Date.now());
    }

    img.setAttribute("src", url);
  } catch (error) {
    console.warn(`Kuusi: could not resolve markdown image "${source}"`, error);
  }
};

/** Fix `<img src="relative/file.jpg">` left unresolved after markdown render. */
export const refreshMarkdownImageSources = async (
  root: HTMLElement,
  resolver: DocumentContextResolver,
): Promise<void> => {
  const images = root.querySelectorAll<HTMLImageElement>("img[src]");

  await Promise.all(Array.from(images, (img) => patchImageSrc(img, resolver)));
};
