import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import {
  Dialog,
  IToolbarWidgetRegistry,
  Notification,
  ToolbarButton,
  showDialog,
} from "@jupyterlab/apputils";
import { PathExt } from "@jupyterlab/coreutils";
import { IDocumentManager } from "@jupyterlab/docmanager";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import { IEditorTracker, type FileEditor } from "@jupyterlab/fileeditor";
import { ISettingRegistry } from "@jupyterlab/settingregistry";
import { Widget } from "@lumino/widgets";
import { LivePdfWidgetFactory } from "../livePdf/livePdfFactory";
import { linkPdfToTexSource } from "../livePdf/livePdfSourceLink";
import type { LivePdfViewer } from "../livePdf/livePdfViewer";
import {
  compileTex,
  formatEngineLabel,
  pdfPathForTex,
  type TexCompileResult,
  type TexEngine,
} from "./compileTex";
import { showTexInstallHelp } from "./texInstallHelp";
import { bindTexOutlineHost } from "./texOutlineHost";
import {
  onDefaultOpenersStateChanged,
  shouldUseKuusiForTex,
} from "../defaultOpeners/defaultOpenersState";
import { kuusiLauncherTexIcon } from "../launcherIcons";
import { applyKuusiTabIcon } from "../kuusiTabIcon";
import {
  openPdfPreviewBesideTexEditor,
  openTexEditorWithPdfPreview,
} from "./openTexWorkspace";
import { syncTexView } from "./syncTex";
import { KUUSI_DISK_POLL_INTERVAL_MS } from "../diskPollInterval";

const PLUGIN_ID = "jupyterlab-kuusi:tex-compile";

export const COMPILE_TEX_COMMAND = "jupyterlab-kuusi:compile-tex";
export const OPEN_TEX_WORKSPACE_COMMAND =
  "jupyterlab-kuusi:open-tex-workspace";
export const TOGGLE_TEX_OUTLINE_COMMAND = "jupyterlab-kuusi:toggle-tex-outline";
export const TEX_INSTALL_HELP_COMMAND = "jupyterlab-kuusi:tex-install-help";

const isTexPath = (path: string | null | undefined): path is string =>
  Boolean(path && path.toLowerCase().endsWith(".tex"));

const createTexAutoReloadSwitch = (
  enabled: boolean,
  onChange: (enabled: boolean) => void,
): Widget => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiTexCompile-autoReload");

  const label = document.createElement("span");
  label.className = "jp-KuusiTexCompile-autoReloadLabel";
  label.textContent = "Auto reload";

  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.className = "jp-KuusiPanelWidget-switch";
  switchBtn.setAttribute("role", "switch");
  switchBtn.setAttribute("aria-label", "Auto reload");
  switchBtn.title =
    "Automatically reload when the .tex file changes on disk";

  const thumb = document.createElement("span");
  thumb.className = "jp-KuusiPanelWidget-switchThumb";
  thumb.setAttribute("aria-hidden", "true");
  switchBtn.appendChild(thumb);

  const syncSwitch = (next: boolean): void => {
    switchBtn.classList.toggle("is-on", next);
    switchBtn.setAttribute("aria-checked", next ? "true" : "false");
  };

  syncSwitch(enabled);

  switchBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = !switchBtn.classList.contains("is-on");
    syncSwitch(next);
    onChange(next);
  });

  wrap.node.append(label, switchBtn);
  return wrap;
};

type TexAutoReloadState = {
  enabled: boolean;
  pollTimer: number | null;
  lastModified: string;
  syncPolling: () => void;
};

const showCompileLog = async (log: string): Promise<void> => {
  const pre = document.createElement("pre");
  pre.className = "jp-KuusiTexCompile-log";
  pre.textContent = log || "No log output.";

  const body = new Widget();
  body.node.appendChild(pre);

  await showDialog({
    title: "TeX compile log",
    body,
    buttons: [Dialog.okButton({ label: "Close" })],
  });
};

const ENGINE_OPTIONS: { value: TexEngine; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "pdflatex", label: "pdflatex" },
  { value: "xelatex", label: "xelatex" },
];

const isTexEngine = (value: unknown): value is TexEngine =>
  value === "pdflatex" || value === "xelatex" || value === "auto";

const texCompilePlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: "Compile .tex files with pdflatex or xelatex on the Jupyter server.",
  autoStart: true,
  requires: [
    IEditorTracker,
    IDocumentManager,
    ISettingRegistry,
    IToolbarWidgetRegistry,
  ],
  activate: (
    app: JupyterFrontEnd,
    editorTracker: IEditorTracker,
    docManager: IDocumentManager,
    settingRegistry: ISettingRegistry,
    toolbarRegistry: IToolbarWidgetRegistry,
  ) => {
    let texEngine: TexEngine = "auto";
    const engineSelects = new Set<HTMLSelectElement>();
    const compileButtons = new WeakMap<
      IDocumentWidget<FileEditor>,
      ToolbarButton
    >();
    const compileGlowCounts = new Map<string, number>();

    const setCompileButtonGlow = (
      button: ToolbarButton,
      active: boolean,
    ): void => {
      button.toggleClass("jp-KuusiTexCompile-isCompiling", active);

      const surfaces = new Set<HTMLElement>();

      if (button.node.classList.contains("jp-ToolbarButtonComponent")) {
        surfaces.add(button.node);
      }

      for (const node of Array.from(
        button.node.querySelectorAll(".jp-ToolbarButtonComponent"),
      )) {
        if (node instanceof HTMLElement) {
          surfaces.add(node);
        }
      }

      const toolbarItem = button.node.closest(
        '[data-jp-item-name="compile-tex"]',
      );

      if (toolbarItem instanceof HTMLElement) {
        toolbarItem.classList.toggle("jp-KuusiTexCompile-isCompiling", active);
      }

      for (const surface of surfaces) {
        surface.classList.toggle("jp-KuusiTexCompile-isCompiling", active);

        if (active) {
          void surface.offsetWidth;
        }
      }
    };

    const syncCompileGlow = (texPath: string, active: boolean): void => {
      editorTracker.forEach((widget) => {
        if (widget.context.path !== texPath) {
          return;
        }

        const button = compileButtons.get(widget);

        if (!button || button.isDisposed) {
          return;
        }

        setCompileButtonGlow(button, active);
      });
    };

    const beginCompileGlow = (texPath: string): void => {
      const next = (compileGlowCounts.get(texPath) ?? 0) + 1;
      compileGlowCounts.set(texPath, next);

      if (next === 1) {
        syncCompileGlow(texPath, true);
      }
    };

    const endCompileGlow = (texPath: string): void => {
      const current = compileGlowCounts.get(texPath) ?? 0;

      if (current <= 1) {
        compileGlowCounts.delete(texPath);
        syncCompileGlow(texPath, false);
        return;
      }

      compileGlowCounts.set(texPath, current - 1);
    };

    const syncEngineSelects = (): void => {
      for (const select of engineSelects) {
        select.value = texEngine;
      }
    };

    const loadSettings = async (): Promise<void> => {
      const settings = await settingRegistry.load(PLUGIN_ID);
      const value = settings.get("texEngine").composite;

      texEngine = isTexEngine(value) ? value : "auto";
      syncEngineSelects();

      settings.changed.connect(() => {
        const next = settings.get("texEngine").composite;
        texEngine = isTexEngine(next) ? next : "auto";
        syncEngineSelects();
      });
    };

    void loadSettings();

    const applyKuusiTexTabIcon = (widget: IDocumentWidget<FileEditor>): void => {
      if (!shouldUseKuusiForTex() || !isTexPath(widget.context.path)) {
        return;
      }

      applyKuusiTabIcon(widget.title, kuusiLauncherTexIcon, "Kuusi LaTeX");
    };

    const ensureTexOutline = (
      widget: IDocumentWidget<FileEditor>,
    ): ReturnType<typeof bindTexOutlineHost> => {
      if (!shouldUseKuusiForTex() || !isTexPath(widget.context.path)) {
        return undefined;
      }

      applyKuusiTexTabIcon(widget);
      return bindTexOutlineHost(widget);
    };

    editorTracker.forEach((widget) => {
      ensureTexOutline(widget);
    });

    editorTracker.widgetAdded.connect((_, widget) => {
      ensureTexOutline(widget);
    });

    const bindTexToolbarVisibility = (
      widget: IDocumentWidget<FileEditor>,
      item: Widget,
    ): void => {
      const updateVisibility = (): void => {
        item.setHidden(
          !shouldUseKuusiForTex() || !isTexPath(widget.context.path),
        );
      };

      updateVisibility();
      widget.context.pathChanged.connect(updateVisibility);
      onDefaultOpenersStateChanged(updateVisibility);
      item.disposed.connect(() => {
        widget.context.pathChanged.disconnect(updateVisibility);
      });
    };

    onDefaultOpenersStateChanged((_sender, state) => {
      if (state.tex) {
        editorTracker.forEach((widget) => {
          ensureTexOutline(widget);
        });
      }
    });

    toolbarRegistry.addFactory<IDocumentWidget<FileEditor>>(
      "Editor",
      "tex-engine",
      (widget): Widget => {
        const wrap = new Widget();
        wrap.addClass("jp-KuusiTexCompile-engine");

        const select = document.createElement("select");
        select.className = "jp-KuusiTexCompile-engineSelect";
        select.title = "TeX engine used by the Compile button";
        select.setAttribute("aria-label", "TeX engine");

        for (const option of ENGINE_OPTIONS) {
          const node = document.createElement("option");
          node.value = option.value;
          node.textContent = option.label;
          select.appendChild(node);
        }

        select.value = texEngine;
        engineSelects.add(select);
        wrap.disposed.connect(() => {
          engineSelects.delete(select);
        });

        select.addEventListener("change", () => {
          if (!isTexEngine(select.value)) {
            return;
          }

          texEngine = select.value;
          void settingRegistry.set(PLUGIN_ID, "texEngine", texEngine);
        });

        wrap.node.appendChild(select);
        bindTexToolbarVisibility(widget, wrap);
        return wrap;
      },
    );

    const jumpToPdf = async (
      widget: IDocumentWidget<FileEditor>,
    ): Promise<void> => {
      const texPath = widget.context.path;

      if (!isTexPath(texPath)) {
        return;
      }

      const position = widget.content.editor.getCursorPosition();
      const line = position.line + 1;
      const column = position.column + 1;

      const result = await syncTexView(texPath, line, column);

      if (!result.ok || typeof result.page !== "number") {
        Notification.error(
          result.error ?? "SyncTeX lookup failed. Compile with SyncTeX first.",
          { autoClose: 4000 },
        );
        return;
      }

      const pdfPath = pdfPathForTex(texPath);
      const existingPdf = docManager.findWidget(
        pdfPath,
        LivePdfWidgetFactory.NAME,
      );

      const pdfWidget =
        existingPdf ??
        docManager.openOrReveal(pdfPath, LivePdfWidgetFactory.NAME, undefined, {
          mode: "split-right",
          ref: widget.id,
        });

      if (existingPdf) {
        docManager.openOrReveal(pdfPath, LivePdfWidgetFactory.NAME, undefined, {
          activate: false,
        });
      }

      const viewer = pdfWidget?.content as LivePdfViewer | undefined;

      if (!viewer) {
        return;
      }

      await viewer.ready;
      viewer.jumpToPosition(
        result.page,
        result.h ?? 0,
        result.v ?? 0,
        result.width ?? 0,
        result.height ?? 0,
        {
          x: result.x,
          y: result.y,
        },
      );
    };

    toolbarRegistry.addFactory<IDocumentWidget<FileEditor>>(
      "Editor",
      "tex-jump-pdf",
      (widget) => {
        const button = new ToolbarButton({
          className: "jp-KuusiTexCompile-jumpPdf",
          label: "PDF →",
          tooltip: "Jump to this line in the PDF preview (SyncTeX)",
          onClick: () => {
            void jumpToPdf(widget);
          },
        });

        bindTexToolbarVisibility(widget, button);
        return button;
      },
    );

    const getTexPath = (): string | null => {
      const path = editorTracker.currentWidget?.context.path ?? null;
      return isTexPath(path) ? path : null;
    };

    const openCompiledPdf = (
      texPath: string,
      editorWidget: IDocumentWidget<FileEditor> | null | undefined,
    ): void => {
      if (editorWidget) {
        openPdfPreviewBesideTexEditor(
          app,
          docManager,
          texPath,
          editorWidget,
          { activate: true },
        );
        return;
      }

      const pdfPath = pdfPathForTex(texPath);
      linkPdfToTexSource(pdfPath, texPath);
      docManager.openOrReveal(pdfPath, LivePdfWidgetFactory.NAME);
    };

    const runCompile = async (
      texPath: string,
      editorWidget: IDocumentWidget<FileEditor> | null | undefined,
      options: { silent?: boolean } = {},
    ): Promise<boolean> => {
      const { silent = false } = options;
      const pdfPath = pdfPathForTex(texPath);
      const fileName = PathExt.basename(texPath);

      beginCompileGlow(texPath);

      try {
        if (editorWidget?.context.model.dirty) {
          await editorWidget.context.save();
        }

        const compilePromise = compileTex(texPath, texEngine);

        if (!silent) {
          Notification.promise(compilePromise, {
            pending: { message: `Compiling ${fileName}…` },
            success: {
              message: (result) =>
                `Compiled ${PathExt.basename(pdfPath)} (${formatEngineLabel((result as TexCompileResult).engine)})`,
            },
            error: {
              message: (reason) =>
                reason instanceof Error
                  ? reason.message
                  : "TeX compile request failed",
            },
          });
        }

        const result = await compilePromise;

        if (!result.ok) {
          if (silent) {
            Notification.error(`Compile failed: ${fileName}`, { autoClose: 4000 });
          } else {
            await showCompileLog(result.log);
          }

          return false;
        }

        openCompiledPdf(texPath, editorWidget);
        return true;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "TeX compile failed";

        if (silent) {
          Notification.error(message, { autoClose: 4000 });
        } else {
          await showCompileLog(message);
        }

        return false;
      } finally {
        endCompileGlow(texPath);
      }
    };

    const texAutoReloadStates = new WeakMap<
      IDocumentWidget<FileEditor>,
      TexAutoReloadState
    >();

    const getTexAutoReloadState = (
      widget: IDocumentWidget<FileEditor>,
    ): TexAutoReloadState => {
      let state = texAutoReloadStates.get(widget);

      if (!state) {
        state = {
          enabled: true,
          pollTimer: null,
          lastModified: widget.context.contentsModel?.last_modified ?? "",
          syncPolling: () => {
            /* assigned below */
          },
        };
        texAutoReloadStates.set(widget, state);

        const contents = docManager.services.contents;

        const reloadFromDisk = async (): Promise<void> => {
          if (
            !state!.enabled ||
            widget.isDisposed ||
            !isTexPath(widget.context.path) ||
            !widget.context.isReady
          ) {
            return;
          }

          try {
            await widget.context.revert();
            state!.lastModified =
              widget.context.contentsModel?.last_modified ?? state!.lastModified;
          } catch {
            // Ignore transient errors while the file is being rewritten.
          }
        };

        const poll = async (): Promise<void> => {
          if (
            !state!.enabled ||
            widget.isDisposed ||
            !isTexPath(widget.context.path) ||
            !widget.context.isReady
          ) {
            return;
          }

          try {
            const model = await contents.get(widget.context.path, {
              content: false,
            });

            if (model.last_modified !== state!.lastModified) {
              state!.lastModified = model.last_modified;
              await reloadFromDisk();
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

        const onFileChanged = (): void => {
          if (!state!.enabled) {
            return;
          }

          state!.lastModified =
            widget.context.contentsModel?.last_modified ?? state!.lastModified;
          void reloadFromDisk();
        };

        widget.context.fileChanged.connect(onFileChanged);
        syncPolling();

        widget.disposed.connect(() => {
          stopPolling();
          widget.context.fileChanged.disconnect(onFileChanged);
          texAutoReloadStates.delete(widget);
        });

        state.syncPolling = syncPolling;
      }

      return state;
    };

    toolbarRegistry.addFactory<IDocumentWidget<FileEditor>>(
      "Editor",
      "tex-auto-reload",
      (widget) => {
        const state = getTexAutoReloadState(widget);
        const wrap = createTexAutoReloadSwitch(state.enabled, (enabled) => {
          state.enabled = enabled;
          state.syncPolling();
        });

        bindTexToolbarVisibility(widget, wrap);
        return wrap;
      },
    );

    toolbarRegistry.addFactory<IDocumentWidget<FileEditor>>(
      "Editor",
      "tex-toc",
      (widget) => {
        const button = new ToolbarButton({
          className: "jp-KuusiTexCompile-toc",
          label: "Contents",
          tooltip: "Show or hide the LaTeX document outline sidebar",
          onClick: () => {
            const host = ensureTexOutline(widget);

            if (!host) {
              return;
            }

            const visible = host.toggleVisible();
            button.node.setAttribute("aria-pressed", visible ? "true" : "false");
          },
        });

        button.node.setAttribute("aria-pressed", "true");
        bindTexToolbarVisibility(widget, button);
        return button;
      },
    );

    toolbarRegistry.addFactory<IDocumentWidget<FileEditor>>(
      "Editor",
      "tex-help",
      (widget) => {
        const button = new ToolbarButton({
          className: "jp-KuusiTexCompile-help",
          label: "Help",
          tooltip: "How to install pdflatex, xelatex, and synctex for Compile",
          onClick: () => {
            void showTexInstallHelp();
          },
        });

        bindTexToolbarVisibility(widget, button);
        return button;
      },
    );

    toolbarRegistry.addFactory<IDocumentWidget<FileEditor>>(
      "Editor",
      "compile-tex",
      (widget) => {
        const button = new ToolbarButton({
          className: "jp-KuusiTexCompile-compile",
          label: "Compile",
          tooltip:
            "Compile with pdflatex or xelatex (auto-detect ctex/fontspec) and open PDF preview",
          onClick: () => {
            const texPath = widget.context.path;

            if (!isTexPath(texPath)) {
              return;
            }

            void runCompile(texPath, widget);
          },
        });

        compileButtons.set(widget, button);
        widget.disposed.connect(() => {
          compileButtons.delete(widget);
        });

        bindTexToolbarVisibility(widget, button);
        return button;
      },
    );

    app.commands.addCommand(TOGGLE_TEX_OUTLINE_COMMAND, {
      label: "Toggle LaTeX outline",
      caption: "Show or hide the LaTeX document outline sidebar",
      isEnabled: () => Boolean(getTexPath()),
      isVisible: () => Boolean(getTexPath()),
      execute: () => {
        const widget = editorTracker.currentWidget;

        if (!widget || !isTexPath(widget.context.path)) {
          return;
        }

        ensureTexOutline(widget)?.toggleVisible();
      },
    });

    app.commands.addCommand(TEX_INSTALL_HELP_COMMAND, {
      label: "TeX install help",
      caption: "How to install pdflatex, xelatex, and synctex for Kuusi Compile",
      isEnabled: () => Boolean(getTexPath()),
      isVisible: () => Boolean(getTexPath()),
      execute: () => showTexInstallHelp(),
    });

    app.commands.addCommand(COMPILE_TEX_COMMAND, {
      label: "Compile TeX",
      caption:
        "Compile with pdflatex or xelatex (auto-detect ctex/fontspec) and open PDF preview",
      isEnabled: () => Boolean(getTexPath()),
      isVisible: () => Boolean(getTexPath()),
      execute: async () => {
        const texPath = getTexPath();

        if (!texPath) {
          return;
        }

        await runCompile(texPath, editorTracker.currentWidget ?? undefined);
      },
    });

    app.commands.addCommand(OPEN_TEX_WORKSPACE_COMMAND, {
      label: "Open LaTeX editor",
      caption:
        "Open the .tex file in the editor (compile to generate and open the PDF)",
      execute: (args: { path?: string }) => {
        const texPath =
          args.path ?? editorTracker.currentWidget?.context.path ?? null;

        if (!isTexPath(texPath)) {
          return null;
        }

        return openTexEditorWithPdfPreview(app, docManager, texPath);
      },
    });

    console.info("jupyterlab-kuusi: TeX compile activated");
  },
};

export default texCompilePlugin;
