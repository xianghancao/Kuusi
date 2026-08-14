import { LabIcon } from "@jupyterlab/ui-components";

/** Bold layered spruce — tuned for JupyterLab tab icons (~16–20px). */
const KUUSI_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <path fill="currentColor" d="M8 0.75 11.1 5.25H4.9Z"/>
  <path fill="currentColor" d="M8 3.5 12.6 8.75H3.4Z"/>
  <path fill="currentColor" d="M8 6.75 14.2 12.25H1.8Z"/>
  <rect fill="currentColor" x="7.1" y="12.35" width="1.8" height="2.9" rx="0.35"/>
</svg>`;

export const kuusiIcon = new LabIcon({
  name: "jupyterlab-kuusi:logo",
  svgstr: KUUSI_ICON_SVG,
});
