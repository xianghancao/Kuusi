import { highlightActiveLineGutter } from "@codemirror/view";
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { IToolbarWidgetRegistry } from "@jupyterlab/apputils";
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
import { attachDiskAutoReload } from "../diskAutoReload";
import {
  onDefaultOpenersStateChanged,
  shouldUseKuusiForMarkdown,
} from "../defaultOpeners/defaultOpenersState";
import { articleIcon } from "../kuusiIcon";
import { kuusiLauncherMarkdownIcon } from "../launcherIcons";
import { applyKuusiTabIcon } from "../kuusiTabIcon";
import {
  getNotebookAutoReloadEnabled,
  registerNotebookAutoReloadListener,
  setNotebookAutoReloadEnabled,
} from "../notebookAutoReloadRegistry";
import {
  getMarkdownLivePreviewEnabled,
  setMarkdownLivePreviewDefault,
  setMarkdownLivePreviewEnabled,
} from "./livePreviewRegistry";
import {
  type MdSyncContext,
} from "./mdSync";
import {
  type DocumentContextResolver,
  refreshMarkdownImageSources,
  wrapDocumentUrlResolver,
} from "../markdownResourceUrls";
import { FACTORY_MARKDOWN_PREVIEW } from "../defaultOpeners/constants";
import { ensureKuusiRenderToolbarChrome } from "../renderExportButton";
import { bindFileEditorFormatBars } from "../markdownEditorFormatBar";
import {
  bindMarkdownEditorRenderSync,
  hasNonArticleMarkdownRenderOpen,
  syncMarkdownRendersToEditorLine,
} from "../markdownEditorRenderSync";
import {
  bindArticlePositionSync,
  configureRenderPositionSync,
} from "../renderPositionSync";
import {
  applyArticleToMarkdownDocument,
  ensureKuusiArticleChrome,
} from "../articleCapsule";
import { ArticleSettingsManager } from "../articleSettings";

const PLUGIN_ID = "jupyterlab-kuusi:markdown-preview";
const MARKDOWN_PREVIEW_FACTORY = "Markdown Preview";
const EDITOR_LIVE_PREVIEW_DEBOUNCE_MS = 500;

const isMarkdownPath = (path: string | null | undefined): path is string =>
  Boolean(path && PathExt.extname(path).toLowerCase() === ".md");

type EditorLivePreviewState = {
  enabled: boolean;
  timer: number | null;
};

type PreviewAutoReloadState = {
  enabled: boolean;
  dispose: () => void;
  syncPolling: () => void;
};

const editorLivePreviewStates = new WeakMap<
  IDocumentWidget<FileEditor>,
  EditorLivePreviewState
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
    const articleSettings = ArticleSettingsManager.shared(settingRegistry);

    const applyArticleChrome = (widget: MarkdownDocument): void => {
      ensureKuusiArticleChrome(widget, articleSettings);
    };

    void articleSettings.ready().then(() => {
      markdownTracker.forEach(applyArticleChrome);
    });
    articleSettings.changed.connect(() => {
      markdownTracker.forEach((widget) => {
        applyArticleToMarkdownDocument(widget, articleSettings);
      });
    });

    const mdSyncContext: MdSyncContext = {
      parser: rendermime.markdownParser,
      sanitizer: rendermime.sanitizer,
    };
    let defaultEditorLivePreview = true;

    const loadSettings = async (): Promise<void> => {
      try {
        const settings = await settingRegistry.load(PLUGIN_ID);
        const editorValue = settings.get("autoReload").composite;

        defaultEditorLivePreview =
          typeof editorValue === "boolean" ? editorValue : true;
      } catch {
        defaultEditorLivePreview = true;
      }

      setMarkdownLivePreviewDefault(defaultEditorLivePreview);
    };

    void loadSettings();

    const findPreviewWidget = (mdPath: string): MarkdownDocument | null => {
      const widget = docManager.findWidget(mdPath, MARKDOWN_PREVIEW_FACTORY);

      return (widget as MarkdownDocument | null) ?? null;
    };

    const jumpEditorToPreview = async (
      editorWidget: IDocumentWidget<FileEditor>,
    ): Promise<void> => {
      const mdPath = editorWidget.context.path;

      if (!isMarkdownPath(mdPath)) {
        return;
      }

      const line = editorWidget.content.editor.getCursorPosition().line;
      const source = editorWidget.context.model.toString();

      // Slides / Mind Map already open: sync only — never spawn Article tab.
      if (hasNonArticleMarkdownRenderOpen(docManager, mdPath)) {
        await syncMarkdownRendersToEditorLine(
          docManager,
          mdPath,
          source,
          line,
          mdSyncContext,
        );
        return;
      }

      // Article already open: sync in place (do not re-reveal).
      const existing = findPreviewWidget(mdPath);

      if (existing && !existing.isDisposed) {
        await syncMarkdownRendersToEditorLine(
          docManager,
          mdPath,
          source,
          line,
          mdSyncContext,
        );
      }

      // No render open yet: leave editor alone (Kuusi View opens the pane).
    };

    const getEditorLivePreviewState = (
      widget: IDocumentWidget<FileEditor>,
    ): EditorLivePreviewState => {
      let state = editorLivePreviewStates.get(widget);

      if (!state) {
        state = {
          get enabled(): boolean {
            return getMarkdownLivePreviewEnabled(widget.context.path);
          },
          set enabled(next: boolean) {
            setMarkdownLivePreviewEnabled(widget.context.path, next);
          },
          timer: null,
        };
        editorLivePreviewStates.set(widget, state);

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
          }, EDITOR_LIVE_PREVIEW_DEBOUNCE_MS);
        };

        widget.context.model.contentChanged.connect(onContentChanged);
        widget.disposed.connect(() => {
          if (state!.timer !== null) {
            window.clearTimeout(state!.timer);
          }

          widget.context.model.contentChanged.disconnect(onContentChanged);
          editorLivePreviewStates.delete(widget);
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
        const path = (): string => widget.context.path;
        const handle = attachDiskAutoReload(widget.context, contents, {
          getEnabled: () => getNotebookAutoReloadEnabled(path()),
        });
        const unregister = registerNotebookAutoReloadListener(path(), handle);
        state = {
          enabled: true,
          dispose: () => {
            unregister();
            handle.dispose();
            previewAutoReloadStates.delete(widget);
          },
          syncPolling: () => {
            handle.syncPolling();
          },
        };
        Object.defineProperty(state, "enabled", {
          get: () => getNotebookAutoReloadEnabled(path()),
          set: (next: boolean) => {
            setNotebookAutoReloadEnabled(path(), next);
          },
          enumerable: true,
          configurable: true,
        });
        previewAutoReloadStates.set(widget, state);
        widget.disposed.connect(() => {
          state!.dispose();
        });
      }

      return state;
    };

    const applyKuusiMarkdownTabIcon = (
      widget: IDocumentWidget<FileEditor> | MarkdownDocument,
      isArticle = false,
    ): void => {
      if (!shouldUseKuusiForMarkdown() || !isMarkdownPath(widget.context.path)) {
        return;
      }

      applyKuusiTabIcon(
        widget.title,
        isArticle ? articleIcon : kuusiLauncherMarkdownIcon,
        isArticle ? "Kuusi Article" : "Kuusi Markdown",
      );
    };

    const bindMarkdownEditorChrome = (
      widget: IDocumentWidget<FileEditor>,
    ): void => {
      applyKuusiMarkdownTabIcon(widget);
      // “Live preview” is switched in the view's Sync menu; the editor does the
      // syncing, so its typing listener is attached here.
      getEditorLivePreviewState(widget);
      bindMarkdownActiveLineGutter(widget);
      bindFileEditorFormatBars(widget);
      bindMarkdownEditorRenderSync(app, docManager, widget, mdSyncContext);
    };

    configureRenderPositionSync({ editorTracker });

    editorTracker.forEach(bindMarkdownEditorChrome);

    editorTracker.widgetAdded.connect((_, widget) => {
      bindMarkdownEditorChrome(widget);
    });

    const attachPreviewToolbar = (widget: MarkdownDocument): void => {
      applyKuusiMarkdownTabIcon(widget, true);

      if (shouldUseKuusiForMarkdown()) {
        getPreviewAutoReloadState(widget, app.serviceManager.contents);
      }

      applyArticleChrome(widget);
      ensureKuusiRenderToolbarChrome(app, widget, FACTORY_MARKDOWN_PREVIEW);
      bindArticlePositionSync(widget, "markdown");
    };

    markdownTracker.forEach((widget) => {
      attachPreviewToolbar(widget);
    });

    markdownTracker.widgetAdded.connect((_, widget) => {
      attachPreviewToolbar(widget);
    });

    const bindMarkdownPreviewImages = (widget: MarkdownDocument): void => {
      const resolver = wrapDocumentUrlResolver(
        widget.context.urlResolver as DocumentContextResolver,
        app.serviceManager.contents,
      );

      const refreshImages = (): void => {
        const rendererNode = widget.content.renderer.node;
        const root = rendererNode.matches(".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown")
          ? rendererNode
          : rendererNode.querySelector(".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown");

        if (!(root instanceof HTMLElement)) {
          return;
        }

        void refreshMarkdownImageSources(root, resolver);
      };

      widget.content.rendered.connect(refreshImages);
      widget.disposed.connect(() => {
        widget.content.rendered.disconnect(refreshImages);
      });
      refreshImages();
    };

    markdownTracker.forEach((widget) => {
      bindMarkdownPreviewImages(widget);
    });

    markdownTracker.widgetAdded.connect((_, widget) => {
      bindMarkdownPreviewImages(widget);
    });

    onDefaultOpenersStateChanged((_sender, state) => {
      editorTracker.forEach((widget) => {
        bindMarkdownActiveLineGutter(widget);
        if (state.markdown) {
          bindFileEditorFormatBars(widget);
        }
      });

      markdownTracker.forEach((widget) => {
        if (state.markdown) {
          attachPreviewToolbar(widget);
        }
      });
    });

    console.info("jupyterlab-kuusi: Markdown preview sync activated");
  },
};

export default markdownPreviewPlugin;
