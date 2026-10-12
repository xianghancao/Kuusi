import { Signal } from "@lumino/signaling";

/**
 * “Live preview” (keep the Kuusi view in step with the Markdown editor while
 * typing) per file path, so the switch can live in the view's Sync menu while
 * the editor does the syncing.
 */
const enabledByPath = new Map<string, boolean>();
let defaultEnabled = true;

export const markdownLivePreviewChanged = new Signal<
  unknown,
  { path: string; enabled: boolean }
>({});

export const setMarkdownLivePreviewDefault = (enabled: boolean): void => {
  defaultEnabled = enabled;
};

export const getMarkdownLivePreviewEnabled = (path: string): boolean =>
  enabledByPath.get(path) ?? defaultEnabled;

export const setMarkdownLivePreviewEnabled = (
  path: string,
  enabled: boolean,
): void => {
  if (getMarkdownLivePreviewEnabled(path) === enabled) {
    return;
  }

  enabledByPath.set(path, enabled);
  markdownLivePreviewChanged.emit({ path, enabled });
};
