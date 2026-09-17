import { LabIcon } from "@jupyterlab/ui-components";

export const VOICE_RECORDER_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">
  <rect x="5.75" y="1.5" width="4.5" height="7.25" rx="2.25" stroke="currentColor" stroke-width="1.1"/>
  <path
    d="M3.25 7.25a4.75 4.75 0 0 0 9.5 0"
    stroke="currentColor"
    stroke-width="1.1"
    stroke-linecap="round"
  />
  <path d="M8 12v2.25M5.75 14.25h4.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
</svg>`;

export const voiceRecorderIcon = new LabIcon({
  name: "jupyterlab-kuusi:voice-recorder",
  svgstr: VOICE_RECORDER_ICON_SVG,
});
