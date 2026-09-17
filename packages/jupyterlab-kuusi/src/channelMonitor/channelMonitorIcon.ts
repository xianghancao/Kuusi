import { LabIcon } from "@jupyterlab/ui-components";

const CHANNEL_MONITOR_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22">
  <path
    fill="currentColor"
    d="M11 2a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V2zm0 4a5 5 0 0 0-5 5h2a3 3 0 1 1 3-3V6zm-1 6h2v5h-2v-5z"
  />
  <path fill="currentColor" d="M16.5 3.5 18 5l-4 4-1.5-1.5 4-4zM18 5l1.5 1.5-1 1L17 6l1-1z" opacity=".85"/>
</svg>`;

export const channelMonitorIcon = new LabIcon({
  name: "jupyterlab-kuusi:channel-monitor",
  svgstr: CHANNEL_MONITOR_ICON_SVG,
});
