import { LabIcon } from "@jupyterlab/ui-components";

const COMPRESS_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22">
  <path
    fill="currentColor"
    d="M4 3h9l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 1.5V9h5.5L12 4.5zM7 11h8v2H7v-2zm0 4h6v2H7v-2z"
  />
</svg>`;

export const compressIcon = new LabIcon({
  name: "jupyterlab-kuusi:compress",
  svgstr: COMPRESS_ICON_SVG,
});
