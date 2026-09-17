import type { JupyterFrontEnd } from "@jupyterlab/application";
import { MainAreaWidget } from "@jupyterlab/apputils";
import { ServerConnection } from "@jupyterlab/services";
import { UUID } from "@lumino/coreutils";
import { URLExt } from "@jupyterlab/coreutils";
import { applyKuusiTabIcon } from "../kuusiTabIcon";
import { ChannelMonitorPanel } from "./channelMonitorPanel";
import { channelMonitorIcon } from "./channelMonitorIcon";

export const OPEN_CHANNEL_MONITOR_COMMAND =
  "jupyterlab-kuusi:open-channel-monitor";

export const OPEN_CHANNEL_MONITOR_STANDALONE_COMMAND =
  "jupyterlab-kuusi:open-channel-monitor-standalone";

const ensureLegacyServer = async (): Promise<void> => {
  const settings = ServerConnection.makeSettings();
  const url = URLExt.join(
    settings.baseUrl,
    "jupyterlab-kuusi/channel-monitor/legacy/ensure",
  );
  const response = await ServerConnection.makeRequest(url, { method: "POST" }, settings);
  if (!response.ok) {
    console.warn("jupyterlab-kuusi: channel monitor legacy ensure failed", response.status);
  }
};

export const openChannelMonitor = async (
  app: JupyterFrontEnd,
): Promise<MainAreaWidget<ChannelMonitorPanel>> => {
  await ensureLegacyServer();

  const settings = ServerConnection.makeSettings();
  const pageUrl = URLExt.join(
    settings.baseUrl,
    "jupyterlab-kuusi/channel-monitor/",
  );

  const widget = new MainAreaWidget<ChannelMonitorPanel>({
    content: new ChannelMonitorPanel(pageUrl),
  });

  widget.id = `kuusi-channel-monitor-${UUID.uuid4()}`;
  widget.title.label = "Transfer speed";
  widget.title.closable = true;
  applyKuusiTabIcon(widget.title, channelMonitorIcon, "Kuusi Transfer speed");

  app.shell.add(widget, "main", { activate: true });

  return widget;
};

export const openChannelMonitorStandalone = async (): Promise<void> => {
  await ensureLegacyServer();
  window.open("http://127.0.0.1:8767/", "_blank", "noopener,noreferrer");
};
