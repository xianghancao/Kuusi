import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { ICommandPalette } from "@jupyterlab/apputils";
import { DocumentRegistry } from "@jupyterlab/docregistry";
import { INotebookTracker } from "@jupyterlab/notebook";
import { LUMEN_FILE_EXTENSIONS } from "lumen-kernel";
import { LumenWidgetFactory } from "./widget";

namespace CommandIDs {
  export const openNotebookAsMindMap = "jupyterlab-lumen:open-notebook-as-mindmap";
}

const FILE_TYPE: DocumentRegistry.IFileType = {
  name: "lumen",
  displayName: "Lumen Mind Map",
  extensions: [...LUMEN_FILE_EXTENSIONS],
  mimeTypes: ["application/json"],
  contentType: "file",
  fileFormat: "text",
};

const plugin: JupyterFrontEndPlugin<void> = {
  id: "jupyterlab-lumen:plugin",
  description: "Open Lumen mind map files in JupyterLab.",
  autoStart: true,
  optional: [ICommandPalette, INotebookTracker],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette | null,
    notebookTracker: INotebookTracker | null,
  ) => {
    const { docRegistry } = app;

    docRegistry.addFileType(FILE_TYPE);
    docRegistry.addWidgetFactory(new LumenWidgetFactory());

    app.commands.addCommand(CommandIDs.openNotebookAsMindMap, {
      label: "Open Notebook as Lumen Mind Map",
      caption: "Convert the active notebook into a Lumen mind map file (MVP)",
      isEnabled: () => Boolean(notebookTracker?.currentWidget),
      execute: () => {
        const notebookPanel = notebookTracker?.currentWidget;

        if (!notebookPanel) {
          return;
        }

        void app.commands.execute("docmanager:open", {
          path: notebookPanel.context.path.replace(/\.ipynb$/i, ".lumen.json"),
        });
      },
    });

    if (palette) {
      palette.addItem({
        command: CommandIDs.openNotebookAsMindMap,
        category: "Lumen",
      });
    }

    console.info("jupyterlab-lumen: extension activated");
  },
};

export default plugin;
