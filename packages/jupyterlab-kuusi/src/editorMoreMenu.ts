import type { JupyterFrontEnd } from "@jupyterlab/application";
import type { IToolbarWidgetRegistry } from "@jupyterlab/apputils";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import { ToolbarButton, ellipsesIcon } from "@jupyterlab/ui-components";
import { PathExt } from "@jupyterlab/coreutils";
import { Menu } from "@lumino/widgets";

import { FACTORY_EDITOR, FACTORY_NOTEBOOK } from "./defaultOpeners/constants";
import { createKuusiTranslator } from "./kuusiI18n";
import {
  getNotebookAutoReloadEnabled,
  setNotebookAutoReloadEnabled,
} from "./notebookAutoReloadRegistry";

const TOGGLE_AUTO_RELOAD = "jupyterlab-kuusi:toggle-auto-reload";
const KUUSI_MORE_ITEM = "kuusi-more";

/**
 * “⋯” menu at the end of the Markdown editor and notebook toolbars. For now it
 * holds Auto reload: re-read the file when it changes on disk (skipped while
 * there are unsaved edits).
 */
export const registerKuusiEditorMoreMenu = (
  app: JupyterFrontEnd,
  toolbarRegistry: IToolbarWidgetRegistry,
): void => {
  const t = createKuusiTranslator();

  if (!app.commands.hasCommand(TOGGLE_AUTO_RELOAD)) {
    app.commands.addCommand(TOGGLE_AUTO_RELOAD, {
      label: () => t.autoReload(),
      caption: () => t.autoReloadTitle(),
      isToggled: (args) =>
        getNotebookAutoReloadEnabled(String(args.path ?? "")),
      execute: (args) => {
        const path = String(args.path ?? "");
        setNotebookAutoReloadEnabled(path, !getNotebookAutoReloadEnabled(path));
      },
    });
  }

  const create = (widget: IDocumentWidget): ToolbarButton => {
    const button = new ToolbarButton({
      className: "jp-KuusiMoreButton",
      icon: ellipsesIcon,
      tooltip: t.moreOptions(),
      onClick: () => {
        const menu = new Menu({ commands: app.commands });
        menu.addItem({
          command: TOGGLE_AUTO_RELOAD,
          args: { path: widget.context.path },
        });
        const rect = button.node.getBoundingClientRect();
        menu.open(rect.left, rect.bottom);
      },
    });

    return button;
  };

  toolbarRegistry.addFactory<IDocumentWidget>(
    FACTORY_NOTEBOOK,
    KUUSI_MORE_ITEM,
    (widget) => create(widget),
  );
  toolbarRegistry.addFactory<IDocumentWidget>(
    FACTORY_EDITOR,
    KUUSI_MORE_ITEM,
    (widget) => {
      const button = create(widget);
      // Markdown files only (the editor also opens other text files).
      const update = (): void => {
        button.setHidden(
          PathExt.extname(widget.context.path).toLowerCase() !== ".md",
        );
      };
      update();
      widget.context.pathChanged.connect(update);
      button.disposed.connect(() => {
        widget.context.pathChanged.disconnect(update);
      });
      return button;
    },
  );
};
