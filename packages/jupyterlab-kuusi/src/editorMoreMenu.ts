import type { JupyterFrontEnd } from "@jupyterlab/application";
import type { IToolbarWidgetRegistry } from "@jupyterlab/apputils";
import { PathExt } from "@jupyterlab/coreutils";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import { Widget } from "@lumino/widgets";

import { FACTORY_EDITOR, FACTORY_NOTEBOOK } from "./defaultOpeners/constants";
import {
  closeKuusiDropdownMenus,
  openKuusiDropdownMenu,
} from "./formatToolbar";
import { createKuusiTranslator } from "./kuusiI18n";
import {
  getActiveLineSettings,
  setActiveLineSettings,
  type ActiveLineStyle,
} from "./activeLineSettings";
import { APPEARANCE_COLOR_SWATCHES } from "./colorPicker";
import { renderPanelWidgets } from "./panelWidgets";
import { createAutoReloadSwitch } from "./markdownPreview/autoReloadSwitch";
import {
  getNotebookAutoReloadEnabled,
  notebookAutoReloadChanged,
  setNotebookAutoReloadEnabled,
} from "./notebookAutoReloadRegistry";

const KUUSI_MORE_ITEM = "kuusi-more";

/**
 * “⋯” menu at the end of the Markdown editor and notebook toolbars. For now it
 * holds the Auto reload switch: re-read the file when it changes on disk
 * (skipped while there are unsaved edits).
 */
class KuusiMoreMenuWidget extends Widget {
  constructor(widget: IDocumentWidget, markdownOnly: boolean) {
    super();
    this.addClass("jp-KuusiRenderExport");
    this.addClass("jp-KuusiMoreMenu");

    const t = createKuusiTranslator();
    const dropdown = document.createElement("div");
    dropdown.className = "jp-KuusiFormatDropdown jp-KuusiRenderExport-dropdown";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "jp-KuusiRenderExport-trigger jp-KuusiMoreMenu-trigger";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-label", t.moreOptions());
    trigger.title = t.moreOptions();
    trigger.textContent = "⋯";

    const menu = document.createElement("div");
    menu.className =
      "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu--fixed jp-KuusiRenderExport-menu jp-KuusiRenderSync-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", t.moreOptions());
    menu.dataset.kuusiPortal = "true";

    const path = (): string => widget.context.path;
    const row = createAutoReloadSwitch(
      getNotebookAutoReloadEnabled(path()),
      "jp-KuusiRenderSync-live",
      t.autoReloadTitle(),
      (enabled) => {
        setNotebookAutoReloadEnabled(path(), enabled);
      },
      t.autoReload(),
    );
    menu.appendChild(row.node);

    if (markdownOnly) {
      const section = document.createElement("div");
      section.className = "jp-KuusiMoreMenu-lineNumber";
      const heading = document.createElement("div");
      heading.className = "jp-KuusiMoreMenu-heading";
      heading.textContent = t.lineNumberHighlight();
      section.appendChild(heading);
      const controls = document.createElement("div");
      section.appendChild(controls);
      const draw = (): void => {
        const current = getActiveLineSettings();
        controls.replaceChildren();
        renderPanelWidgets(controls, [
          {
            kind: "choice",
            value: current.style,
            options: (
              [
                ["default", t.lineStyleDefault()],
                ["highlight", t.lineStyleHighlight()],
                ["bold", t.lineStyleBold()],
                ["bar", t.lineStyleBar()],
                ["off", t.lineStyleOff()],
              ] as const
            ).map(([value, label]) => ({ value, label, title: label })),
            onChange: (value) => {
              setActiveLineSettings({ style: value as ActiveLineStyle });
              draw();
            },
          },
          {
            kind: "color",
            sectionLabel: t.lineNumberColor(),
            value: current.color,
            swatches: APPEARANCE_COLOR_SWATCHES,
            includeDefaultSwatch: true,
            onChange: (color) => {
              setActiveLineSettings({ color });
            },
          },
        ]);
      };
      draw();
      menu.appendChild(section);
    }

    const onChanged = (
      _: unknown,
      change: { path: string; enabled: boolean },
    ): void => {
      if (change.path === path()) {
        row.setEnabled(change.enabled);
      }
    };
    notebookAutoReloadChanged.connect(onChanged);

    // The editor also opens other text files; only Markdown gets this menu.
    const updateVisibility = (): void => {
      this.setHidden(
        markdownOnly && PathExt.extname(path()).toLowerCase() !== ".md",
      );
    };
    updateVisibility();
    widget.context.pathChanged.connect(updateVisibility);

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = menu.classList.contains("is-open");
      closeKuusiDropdownMenus(this.node);

      if (!isOpen) {
        row.setEnabled(getNotebookAutoReloadEnabled(path()));
        openKuusiDropdownMenu(menu, widget.node);
      }
    });

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node) || this.node.contains(target)) {
        return;
      }

      const el = target instanceof Element ? target : target.parentElement;
      if (el?.closest(".jp-KuusiFormatDropdown-menu.is-open")) {
        return;
      }

      closeKuusiDropdownMenus(this.node);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    this.disposed.connect(() => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      notebookAutoReloadChanged.disconnect(onChanged);
      widget.context.pathChanged.disconnect(updateVisibility);
    });
    widget.disposed.connect(() => {
      this.dispose();
    });

    dropdown.append(trigger, menu);
    this.node.appendChild(dropdown);
  }
}

export const registerKuusiEditorMoreMenu = (
  _app: JupyterFrontEnd,
  toolbarRegistry: IToolbarWidgetRegistry,
): void => {
  toolbarRegistry.addFactory<IDocumentWidget>(
    FACTORY_NOTEBOOK,
    KUUSI_MORE_ITEM,
    (widget) => new KuusiMoreMenuWidget(widget, false),
  );
  toolbarRegistry.addFactory<IDocumentWidget>(
    FACTORY_EDITOR,
    KUUSI_MORE_ITEM,
    (widget) => new KuusiMoreMenuWidget(widget, true),
  );
};
