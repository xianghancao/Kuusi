import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { Widget } from "@lumino/widgets";

import type { RenderViewChromeHandle } from "./renderViewChrome";
import { countTextStats, resolveFileBytes } from "./statusStats";

export type StatusChromeFlags = {
  showNodeCount?: boolean;
  showTextCount: boolean;
  showPageCount: boolean;
  showFileSize: boolean;
};

export type StatusChromeValues = {
  source: string;
  pages?: number;
  nodes?: number;
  contentsSize?: number | null;
};

export const applyStatusChrome = (
  chrome: RenderViewChromeHandle,
  flags: StatusChromeFlags,
  values: StatusChromeValues,
): void => {
  const text = countTextStats(values.source);
  const fileBytes = resolveFileBytes(values.contentsSize, values.source);

  chrome.setStatVisibility({
    nodes: flags.showNodeCount === true,
    text: flags.showTextCount,
    pages: flags.showPageCount,
    fileSize: flags.showFileSize,
  });
  chrome.setStats({
    nodes: values.nodes ?? 0,
    characters: text.characters,
    words: text.words,
    pages: Math.max(0, values.pages ?? 0),
    fileBytes,
  });
};

type StatusSettingsLike = {
  showTextCount: boolean;
  showPageCount: boolean;
  showFileSize: boolean;
  showNodeCount?: boolean;
};

type StatusSettingsManagerLike = {
  settings: StatusSettingsLike;
  changed: {
    connect: (fn: (settings: StatusSettingsLike) => void) => {
      disconnect: () => void;
    };
  };
};

/**
 * Keep bottom-right status stats in sync with document source + settings.
 * Returns a dispose function.
 */
export const bindDocumentStatusChrome = (
  options: {
    chrome: RenderViewChromeHandle;
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>;
    manager: StatusSettingsManagerLike;
    getPages?: () => number;
    getNodes?: () => number;
  },
): (() => void) => {
  const { chrome, context, manager, getPages, getNodes } = options;

  const refresh = (): void => {
    if (chrome.node.isConnected === false) {
      return;
    }

    const settings = manager.settings;
    applyStatusChrome(
      chrome,
      {
        showNodeCount: settings.showNodeCount,
        showTextCount: settings.showTextCount,
        showPageCount: settings.showPageCount,
        showFileSize: settings.showFileSize,
      },
      {
        source: context.model.toString(),
        pages: getPages?.() ?? 1,
        nodes: getNodes?.(),
        contentsSize: context.contentsModel?.size,
      },
    );
  };

  let refreshTimer = 0;
  const scheduleRefresh = (): void => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      refresh();
    }, 120);
  };

  context.model.contentChanged.connect(scheduleRefresh);
  const settingsConnection = manager.changed.connect(scheduleRefresh);
  context.fileChanged.connect(scheduleRefresh);

  refresh();

  return () => {
    window.clearTimeout(refreshTimer);
    context.model.contentChanged.disconnect(scheduleRefresh);
    context.fileChanged.disconnect(scheduleRefresh);
    settingsConnection.disconnect();
  };
};

export const pageCountFromArticleHost = (host: HTMLElement): number => {
  const sheets = host.querySelectorAll(".jp-KuusiArticle-pageSheet");
  return Math.max(1, sheets.length || 1);
};

export const slideCountFromWidget = (widget: Widget): number => {
  const candidate = widget as Widget & { slideCount?: unknown };
  return typeof candidate.slideCount === "number" && candidate.slideCount > 0
    ? candidate.slideCount
    : 1;
};
