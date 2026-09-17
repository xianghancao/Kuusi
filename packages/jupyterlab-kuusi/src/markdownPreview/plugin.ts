import { highlightActiveLineGutter } from "@codemirror/view";
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { IToolbarWidgetRegistry, ToolbarButton } from "@jupyterlab/apputils";
import { PathExt } from "@jupyterlab/coreutils";
import { IDocumentManager } from "@jupyterlab/docmanager";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import { IEditorTracker, type FileEditor } from "@jupyterlab/fileeditor";
import {
  IMarkdownViewerTracker,
  type MarkdownDocument,
} from "@jupyterlab/markdownviewer";
import type { Contents } from "@jupyterlab/services";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { ISettingRegistry } from "@jupyterlab/settingregistry";
import { KUUSI_DISK_POLL_INTERVAL_MS } from "../diskPollInterval";
import {
  onDefaultOpenersStateChanged,
  shouldUseKuusiForMarkdown,
} from "../defaultOpeners/defaultOpenersState";
import { kuusiLauncherMarkdownIcon } from "../launcherIcons";
import { applyKuusiTabIcon } from "../kuusiTabIcon";
import { createAutoReloadSwitch } from "./autoReloadSwitch";
import {
  findSourceLineFromPreview,
  type MdSyncContext,
  scrollPreviewToEditorLine,
} from "./mdSync";

const PLUGIN_ID = "jupyterlab-kuusi:markdown-preview";
const MARKDOWN_PREVIEW_FACTORY = "Markdown Preview";
const EDITOR_AUTO_RELOAD_DEBOUNCE_MS = 500;

const isMarkdownPath = (path: string | null | undefined): path is string =>
  Boolean(path && PathExt.extname(path).toLowerCase() === ".md");

type EditorAutoReloadState = {
  enabled: boolean;
  timer: number | null;
};

type PreviewAutoReloadState = {
  enabled: boolean;
  pollTimer: number | null;
  lastModified: string;
  syncPolling: () => void;
};

const editorAutoReloadStates = new WeakMap<
  IDocumentWidget<FileEditor>,
  EditorAutoReloadState
>();

const previewAutoReloadStates = new WeakMap<
  MarkdownDocument,
  PreviewAutoReloadState
>();

const markdownEditorGutterHosts = new WeakSet<IDocumentWidget<FileEditor>>();
const markdownEditorGutterInjected = new WeakSet<IDocumentWidget<FileEditor>>();

const syncMarkdownEditorGutterClass = (
  widget: IDocumentWidget<FileEditor>,
): void => {
  const active =
    shouldUseKuusiForMarkdown() && isMarkdownPath(widget.context.path);
  widget.content.node.classList.toggle("jp-KuusiMarkdownEditor", active);
};

const bindMarkdownActiveLineGutter = (
  widget: IDocumentWidget<FileEditor>,
): void => {
  if (!markdownEditorGutterHosts.has(widget)) {
    markdownEditorGutterHosts.add(widget);

    const onPathChanged = (): void => {
      if (
        !markdownEditorGutterInjected.has(widget) &&
        isMarkdownPath(widget.context.path)
      ) {
        markdownEditorGutterInjected.add(widget);
        widget.content.editor.injectExtension(highlightActiveLineGutter());
      }

      syncMarkdownEditorGutterClass(widget);
    };

    widget.context.pathChanged.connect(onPathChanged);

    widget.disposed.connect(() => {
      widget.context.pathChanged.disconnect(onPathChanged);
      markdownEditorGutterHosts.delete(widget);
      markdownEditorGutterInjected.delete(widget);
      widget.content.node.classList.remove("jp-KuusiMarkdownEditor");
    });
  }

  if (
    !markdownEditorGutterInjected.has(widget) &&
    isMarkdownPath(widget.context.path)
  ) {
    markdownEditorGutterInjected.add(widget);
    widget.content.editor.injectExtension(highlightActiveLineGutter());
  }

  syncMarkdownEditorGutterClass(widget);
};

const markdownPreviewPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description:
    "Auto reload and linked navigation between Markdown editor and preview.",
  autoStart: true,
  requires: [
    IEditorTracker,
    IDocumentManager,
    IMarkdownViewerTracker,
    IRenderMimeRegistry,
    ISettingRegistry,
    IToolbarWidgetRegistry,
  ],
  activate: (
    app: JupyterFrontEnd,
    editorTracker: IEditorTracker,
    docManager: IDocumentManager,
    markdownTracker: IMarkdownViewerTracker,
    rendermime: IRenderMimeRegistry,
    settingRegistry: ISettingRegistry,
    toolbarRegistry: IToolbarWidgetRegistry,
  ) => {
    const mdSyncContext: MdSyncContext = {
      parser: rendermime.markdownParser,
      sanitizer: rendermime.sanitizer,
    };
    let defaultEditorAutoReload = true;
    let defaultPreviewAutoReload = true;

    const loadSettings = async (): Promise<void> => {
      try {
        const settings = await settingRegistry.load(PLUGIN_ID);
        const editorValue = settings.get("autoReload").composite;
        const previewValue = settings.get("previewAutoReload").composite;

        defaultEditorAutoReload =
          typeof editorValue === "boolean" ? editorValue : true;
        defaultPreviewAutoReload =
          typeof previewValue === "boolean" ? previewValue : true;
      } catch {
        defaultEditorAutoReload = true;
        defaultPreviewAutoReload = true;
      }
    };

    void loadSettings();

    const findPreviewWidget = (mdPath: string): MarkdownDocument | null => {
      const widget = docManager.findWidget(mdPath, MARKDOWN_PREVIEW_FACTORY);

      return (widget as MarkdownDocument | null) ?? null;
    };

    const openPreviewBesideEditor = (
      mdPath: string,
      editorWidget: IDocumentWidget<FileEditor>,
    ): MarkdownDocument | null => {
      const existing = findPreviewWidget(mdPath);

      if (existing) {
        docManager.openOrReveal(mdPath, MARKDOWN_PREVIEW_FACTORY, undefined, {
          activate: false,
        });
        return existing;
      }

      const widget = docManager.openOrReveal(
        mdPath,
        MARKDOWN_PREVIEW_FACTORY,
        undefined,
        {
          mode: "split-right",
          ref: editorWidget.id,
        },
      );

      return widget as MarkdownDocument | null;
    };

    const jumpEditorToPreview = async (
      editorWidget: IDocumentWidget<FileEditor>,
    ): Promise<void> => {
      const mdPath = editorWidget.context.path;

      if (!isMarkdownPath(mdPath)) {
        return;
      }

      const preview = openPreviewBesideEditor(mdPath, editorWidget);

      if (!preview) {
        return;
      }

      const line = editorWidget.content.editor.getCursorPosition().line;
      const source = editorWidget.context.model.toString();

      await scrollPreviewToEditorLine(
        preview.content,
        source,
        line,
        mdSyncContext,
      );
    };

    const jumpPreviewToEditor = async (
      previewWidget: MarkdownDocument,
    ): Promise<void> => {
      const mdPath = previewWidget.context.path;

      if (!isMarkdownPath(mdPath)) {
        return;
      }

      const editorWidget = docManager.openOrReveal(mdPath, "Editor", undefined, {
        mode: "split-right",
        ref: previewWidget.id,
      }) as IDocumentWidget<FileEditor> | null;

      if (!editorWidget) {
        return;
      }

      const source = previewWidget.context.model.toString();
      const line = await findSourceLineFromPreview(
        source,
        previewWidget.content,
        mdSyncContext,
      );

      const position = { line, column: 0 };
      editorWidget.content.editor.setCursorPosition(position);
      editorWidget.content.editor.revealPosition(position);
      editorWidget.content.editor.focus();
    };

    const getEditorAutoReloadState = (
      widget: IDocumentWidget<FileEditor>,
    ): EditorAutoReloadState => {
      let state = editorAutoReloadStates.get(widget);

      if (!state) {
        state = {
          enabled: defaultEditorAutoReload,
          timer: null,
        };
        editorAutoReloadStates.set(widget, state);

        const onContentChanged = (): void => {
          if (!state!.enabled || !isMarkdownPath(widget.context.path)) {
            return;
          }

          if (state!.timer !== null) {
            window.clearTimeout(state!.timer);
          }

          state!.timer = window.setTimeout(() => {
            state!.timer = null;
            void jumpEditorToPreview(widget);
          }, EDITOR_AUTO_RELOAD_DEBOUNCE_MS);
        };

        widget.context.model.contentChanged.connect(onContentChanged);
        widget.disposed.connect(() => {
          if (state!.timer !== null) {
            window.clearTimeout(state!.timer);
          }

          widget.context.model.contentChanged.disconnect(onContentChanged);
          editorAutoReloadStates.delete(widget);
        });
      }

      return state;
    };

    const getPreviewAutoReloadState = (
      widget: MarkdownDocument,
      contents: Contents.IManager,
    ): PreviewAutoReloadState => {
      let state = previewAutoReloadStates.get(widget);

      if (!state) {
        state = {
          enabled: defaultPreviewAutoReload,
          pollTimer: null,
          lastModified: widget.context.contentsModel?.last_modified ?? "",
          syncPolling: () => {
            /* assigned below */
          },
        };
        previewAutoReloadStates.set(widget, state);

        const poll = async (): Promise<void> => {
          if (!state!.enabled || widget.isDisposed || !widget.context.isReady) {
            return;
          }

          try {
            const model = await contents.get(widget.context.path, {
              content: false,
            });

            if (model.last_modified !== state!.lastModified) {
              state!.lastModified = model.last_modified;
              await widget.context.revert();
            }
          } catch {
            // Ignore transient polling errors while the file is being rewritten.
          }
        };

        const startPolling = (): void => {
          if (state!.pollTimer !== null) {
            return;
          }

          state!.pollTimer = window.setInterval(() => {
            void poll();
          }, KUUSI_DISK_POLL_INTERVAL_MS);
        };

        const stopPolling = (): void => {
          if (state!.pollTimer === null) {
            return;
          }

          window.clearInterval(state!.pollTimer);
          state!.pollTimer = null;
        };

        const syncPolling = (): void => {
          if (state!.enabled) {
            startPolling();
          } else {
            stopPolling();
          }
        };

        syncPolling();

        const onFileChanged = async (): Promise<void> => {
          if (!state!.enabled) {
            return;
          }

          state!.lastModified =
            widget.context.contentsModel?.last_modified ?? state!.lastModified;
          await widget.context.revert();
        };

        widget.context.fileChanged.connect(onFileChanged);

        widget.disposed.connect(() => {
          stopPolling();
          widget.context.fileChanged.disconnect(onFileChanged);
          previewAutoReloadStates.delete(widget);
        });

        state.syncPolling = syncPolling;
      }

      return state;
    };

    toolbarRegistry.addFactory<IDocumentWidget<FileEditor>>(
      "Editor",
      "md-auto-reload",
      (widget) => {
        const state = getEditorAutoReloadState(widget);
        const wrap = createAutoReloadSwitch(
          state.enabled,
          "jp-KuusiMdPreview-autoReload",
          "Automatically update the Markdown preview while editing",
          (enabled) => {
            state.enabled = enabled;

            if (!enabled && state.timer !== null) {
              window.clearTimeout(state.timer);
              state.timer = null;
            }
          },
        );

        const updateVisibility = (): void => {
          wrap.setHidden(
            !shouldUseKuusiForMarkdown() || !isMarkdownPath(widget.context.path),
          );
        };

        updateVisibility();
        widget.context.pathChanged.connect(updateVisibility);
        onDefaultOpenersStateChanged(updateVisibility);
        wrap.disposed.connect(() => {
          widget.context.pathChanged.disconnect(updateVisibility);
        });

        return wrap;
      },
    );

    toolbarRegistry.addFactory<IDocumentWidget<FileEditor>>(
      "Editor",
      "md-jump-preview",
      (widget) => {
        const button = new ToolbarButton({
          className: "jp-KuusiMdPreview-jumpPreview",
          label: "Preview →",
          tooltip: "Open Markdown preview and jump to the cursor line",
          onClick: () => {
            void jumpEditorToPreview(widget);
          },
        });

        const updateVisibility = (): void => {
          button.setHidden(
            !shouldUseKuusiForMarkdown() || !isMarkdownPath(widget.context.path),
          );
        };

        updateVisibility();
        widget.context.pathChanged.connect(updateVisibility);
        onDefaultOpenersStateChanged(updateVisibility);
        button.disposed.connect(() => {
          widget.context.pathChanged.disconnect(updateVisibility);
        });

        return button;
      },
    );

    const applyKuusiMarkdownTabIcon = (
      widget: IDocumentWidget<FileEditor> | MarkdownDocument,
    ): void => {
      if (!shouldUseKuusiForMarkdown() || !isMarkdownPath(widget.context.path)) {
        return;
      }

      applyKuusiTabIcon(
        widget.title,
        kuusiLauncherMarkdownIcon,
        "Kuusi Markdown",
      );
    };

    editorTracker.forEach((widget) => {
      applyKuusiMarkdownTabIcon(widget);
      bindMarkdownActiveLineGutter(widget);
    });

    editorTracker.widgetAdded.connect((_, widget) => {
      applyKuusiMarkdownTabIcon(widget);
      bindMarkdownActiveLineGutter(widget);
    });

    const attachPreviewToolbar = (widget: MarkdownDocument): void => {
      if (!shouldUseKuusiForMarkdown()) {
        return;
      }

      applyKuusiMarkdownTabIcon(widget);

      if (Array.from(widget.toolbar.names()).includes("md-preview-auto-reload")) {
        return;
      }

      const contents = app.serviceManager.contents;
      const state = getPreviewAutoReloadState(widget, contents);

      widget.toolbar.insertItem(
        0,
        "md-preview-auto-reload",
        createAutoReloadSwitch(
          state.enabled,
          "jp-KuusiMdPreview-autoReload",
          "Automatically reload the preview when the file changes on disk",
          (enabled) => {
            state.enabled = enabled;
            state.syncPolling();

            if (enabled) {
              state.lastModified =
                widget.context.contentsModel?.last_modified ?? state.lastModified;
            }
          },
        ),
      );

      widget.toolbar.insertItem(
        1,
        "md-jump-source",
        new ToolbarButton({
          className: "jp-KuusiMdPreview-jumpSource",
          label: "← Source",
          tooltip: "Open the Markdown source and jump to this preview position",
          onClick: () => {
            void jumpPreviewToEditor(widget);
          },
        }),
      );
    };

    markdownTracker.forEach((widget) => {
      attachPreviewToolbar(widget);
    });

    markdownTracker.widgetAdded.connect((_, widget) => {
      attachPreviewToolbar(widget);
    });

    onDefaultOpenersStateChanged((_sender, state) => {
      editorTracker.forEach((widget) => {
        bindMarkdownActiveLineGutter(widget);
      });

      markdownTracker.forEach((widget) => {
        if (state.markdown) {
          attachPreviewToolbar(widget);
        }

        for (const name of ["md-preview-auto-reload", "md-jump-source"]) {
          const node = widget.toolbar.node.querySelector(
            `[data-jp-item-name="${name}"]`,
          );

          if (node instanceof HTMLElement) {
            node.hidden = !state.markdown;
          }
        }
      });
    });

    console.info("jupyterlab-kuusi: Markdown preview sync activated");
  },
};

export default markdownPreviewPlugin;
