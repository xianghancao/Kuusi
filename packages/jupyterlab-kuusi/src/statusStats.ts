import type { KuusiTranslator } from "./kuusiI18n";

export type TextStats = {
  characters: number;
  words: number;
};

/** Character count (all code points) and whitespace-delimited word count. */
export const countTextStats = (source: string): TextStats => {
  const characters = Array.from(source).length;
  const trimmed = source.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return { characters, words };
};

export const formatFileSize = (bytes: number, t: KuusiTranslator): string => {
  const safe = Math.max(0, Math.round(bytes));

  if (safe < 1024) {
    return t.statusFileSizeBytes(safe);
  }

  if (safe < 1024 * 1024) {
    const kb = safe / 1024;
    const rounded = kb >= 10 ? Math.round(kb) : Math.round(kb * 10) / 10;
    return t.statusFileSizeKb(rounded);
  }

  const mb = safe / (1024 * 1024);
  const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  return t.statusFileSizeMb(rounded);
};

export const byteLengthOf = (source: string): number =>
  new TextEncoder().encode(source).byteLength;

export const resolveFileBytes = (
  contentsSize: number | null | undefined,
  source: string,
): number => {
  if (typeof contentsSize === "number" && Number.isFinite(contentsSize) && contentsSize >= 0) {
    return contentsSize;
  }

  return byteLengthOf(source);
};
