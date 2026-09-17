/** User-facing label for Jupyter `last_modified` (precision to the second). */
export const formatContentsModified = (
  raw: string | undefined | null,
): string => {
  if (!raw) {
    return "";
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw.replace(/\.\d+(?=[Z+-]|$)/, "").replace(/Z$/i, "");
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};
