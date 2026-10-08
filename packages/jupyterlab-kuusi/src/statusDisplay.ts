import type { KuusiTranslator } from "./kuusiI18n";
import type { PanelWidget } from "./panelWidgets";

export type StatusDisplayOptions = {
  getShowUpdatedTimestamp?: () => boolean;
  onShowUpdatedTimestampChange?: (show: boolean) => void;
  getShowNodeCount?: () => boolean;
  onShowNodeCountChange?: (show: boolean) => void;
  getShowTextCount?: () => boolean;
  onShowTextCountChange?: (show: boolean) => void;
  getShowPageCount?: () => boolean;
  onShowPageCountChange?: (show: boolean) => void;
  getShowFileSize?: () => boolean;
  onShowFileSizeChange?: (show: boolean) => void;
};

/** Toggle widgets for status capsules left of zoom (and optional updated time). */
export const buildStatusPanelWidgets = (
  t: KuusiTranslator,
  options: StatusDisplayOptions,
  onRebuild: () => void,
): PanelWidget[] => {
  const widgets: PanelWidget[] = [];

  if (options.getShowUpdatedTimestamp && options.onShowUpdatedTimestampChange) {
    widgets.push({
      kind: "toggle",
      label: t.showUpdatedTimestamp(),
      title: t.showUpdatedTimestampTitle(),
      value: options.getShowUpdatedTimestamp(),
      onChange: (value) => {
        options.onShowUpdatedTimestampChange?.(value);
        onRebuild();
      },
    });
  }

  if (options.getShowNodeCount && options.onShowNodeCountChange) {
    widgets.push({
      kind: "toggle",
      label: t.showNodeCount(),
      title: t.showNodeCountTitle(),
      value: options.getShowNodeCount(),
      onChange: (value) => {
        options.onShowNodeCountChange?.(value);
        onRebuild();
      },
    });
  }

  if (options.getShowTextCount && options.onShowTextCountChange) {
    widgets.push({
      kind: "toggle",
      label: t.showTextCount(),
      title: t.showTextCountTitle(),
      value: options.getShowTextCount(),
      onChange: (value) => {
        options.onShowTextCountChange?.(value);
        onRebuild();
      },
    });
  }

  if (options.getShowPageCount && options.onShowPageCountChange) {
    widgets.push({
      kind: "toggle",
      label: t.showPageCount(),
      title: t.showPageCountTitle(),
      value: options.getShowPageCount(),
      onChange: (value) => {
        options.onShowPageCountChange?.(value);
        onRebuild();
      },
    });
  }

  if (options.getShowFileSize && options.onShowFileSizeChange) {
    widgets.push({
      kind: "toggle",
      label: t.showFileSize(),
      title: t.showFileSizeTitle(),
      value: options.getShowFileSize(),
      onChange: (value) => {
        options.onShowFileSizeChange?.(value);
        onRebuild();
      },
    });
  }

  return widgets;
};
