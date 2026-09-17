import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { ICommandPalette } from "@jupyterlab/apputils";
import {
  OPEN_CHANNEL_MONITOR_COMMAND,
  OPEN_CHANNEL_MONITOR_STANDALONE_COMMAND,
  openChannelMonitor,
  openChannelMonitorStandalone,
} from "./openChannelMonitor";
import { channelMonitorIcon } from "./channelMonitorIcon";

const PLUGIN_ID = "jupyterlab-kuusi:channel-monitor";

const channelMonitorPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: "Transfer speed / channel monitor (Thunderbolt, disk, SMB).",
  autoStart: true,
  optional: [ICommandPalette],
  activate: (app: JupyterFrontEnd, palette: ICommandPalette | null) => {
    if (!app.commands.hasCommand(OPEN_CHANNEL_MONITOR_COMMAND)) {
      app.commands.addCommand(OPEN_CHANNEL_MONITOR_COMMAND, {
        label: "Transfer speed",
        caption:
          "Monitor link and disk speeds; dual-pane copy over Thunderbolt or SMB",
        icon: channelMonitorIcon,
        execute: () => openChannelMonitor(app),
      });
    }

    if (!app.commands.hasCommand(OPEN_CHANNEL_MONITOR_STANDALONE_COMMAND)) {
      app.commands.addCommand(OPEN_CHANNEL_MONITOR_STANDALONE_COMMAND, {
        label: "Transfer speed (standalone window)",
        caption: "Open the legacy dashboard on http://127.0.0.1:8767/",
        icon: channelMonitorIcon,
        execute: () => openChannelMonitorStandalone(),
      });
    }

    palette?.addItem({
      command: OPEN_CHANNEL_MONITOR_COMMAND,
      category: "Kuusi",
    });
    palette?.addItem({
      command: OPEN_CHANNEL_MONITOR_STANDALONE_COMMAND,
      category: "Kuusi",
    });

    console.info("jupyterlab-kuusi: channel monitor activated");
  },
};

export default channelMonitorPlugin;
