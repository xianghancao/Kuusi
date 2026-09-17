import { LabIcon } from "@jupyterlab/ui-components";
import {
  KUUSI_IMAGE_ICON_SVG,
  LIVE_PDF_ICON_SVG,
  MIND_MAP_ICON_SVG,
} from "./kuusiIcon";
import { VOICE_RECORDER_ICON_SVG } from "./voiceRecorder/voiceIcon";

const KUUSI_LAUNCHER_MARKDOWN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22">
  <path fill="currentColor" d="M5 14.9h12l-6.1 6zm9.4-6.8c0-1.3-.1-2.9-.1-4.5-.4 1.4-.9 2.9-1.3 4.3l-1.3 4.3h-2L8.5 7.9c-.4-1.3-.7-2.9-1-4.3-.1 1.6-.1 3.2-.2 4.6L7 12.4H4.8l.7-11h3.3L10 5c.4 1.2.7 2.7 1 3.9.3-1.2.7-2.6 1-3.9l1.2-3.7h3.3l.6 11h-2.4z"/>
</svg>`;

/** Knuth TeX logotype (T + ε + χ); stroke thickens it at launcher/tab sizes. */
const KUUSI_LAUNCHER_TEX_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1028 590">
  <g
    class="jp-KuusiTexIcon-bold"
    fill="currentColor"
    stroke="currentColor"
    stroke-width="26"
    stroke-linejoin="round"
    paint-order="stroke fill"
  >
    <path d="M364.09 23.89H14.82L4.61 157.66h10.87c7.82-100.19 16.41-117.73 110.21-117.73 10.87 0 28.53 0 33.39 0 11.55 1.81 11.55 9.16 11.55 23.08V392.27c0 21.86-1.83 28.53-52.78 28.53h-17.17v14.61c29.02-.56 59.26-1.15 88.93-1.15 29.58 0 59.91 .59 88.91 1.15v-14.61h-16.88c-50.19 0-52-6.67-52-28.53V63.02c0-13.36 0-20.61 10.89-23.08h33.19c92.55 0 101.61 17.44 109.42 117.73h10.89"/>
    <path d="M667.6 414.32H656.73C643.47 504.01 635.65 552.76 529.26 552.76h-83.95c-24.16 0-25.3-3.05-25.3-23.86V359.83h57.06c57.06 0 62.5 20.91 62.5 71.96h9.72V274.44h-9.72c0 50.19-5.45 70.71-62.5 70.71H420V195.25c0-20.42 1.15-23.47 25.3-23.47h82.7c93.6 0 104.49 37.2 112.97 117.17H651.87L637.36 155.17H331.1v16.61c42.84 0 49.7 0 49.7 27.19v326.42c0 27.19-6.77 27.19-49.7 27.19v14.61h314.76"/>
    <path d="M830.66 206.51 920.15 77.13c8.96-12.7 27.19-38.84 76.82-39.5V23.03c-13.85 1.15-36.83 1.15-51.34 1.15-19.93 0-44.75 0-59.82-1.15v14.61c19.37 1.81 24.13 13.92 24.13 23.67 0 7.23-2.96 12.11-7.25 18.12L822.84 195.25 733.35 64.26c-4.2-6.59-4.79-8.5-4.79-10.31 0-5.45 6.59-15.75 26.62-16.32V23.03c-19.37 1.15-48.95 1.15-68.88 1.15-15.66 0-45.89 0-60.5-1.15v14.61c33.22 0 44.09 1.25 57.45 20.03l116.68 171.37-105.22 153.71c-25.96 37.59-65.26 38.25-76.82 38.25v14.61c13.82-1.15 36.83-1.15 51.34-1.15 16.32 0 44.75 0 59.82 1.15v-14.61c-18.71-1.81-24.13-13.92-24.13-23.67 0-7.82 2.96-12.11 6.01-16.41l96.75-141.2 105.22 154.66c4.76 6.69 4.76 8.5 4.76 10.31 0 4.76-5.42 15.17-26.6 16.41v14.61c19.37-1.15 48.95-1.15 68.88-1.15 15.66 0 45.89 0 60.57 1.15v-14.61c-38.74 0-44.84-2.96-56.86-20.03"/>
  </g>
</svg>`;

/** Settings gear — uses currentColor so Kuusi launcher CSS can tint it brand green. */
const KUUSI_LAUNCHER_SETTINGS_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22">
  <path
    fill="currentColor"
    d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.506.506 0 0 0 .12-.61l-1.92-3.32a.506.506 0 0 0-.59-.22l-2.39.96a6.7 6.7 0 0 0-1.62-.94l-.36-2.54a.506.506 0 0 0-.47-.42h-3.84c-.24 0-.43.17-.47.42l-.36 2.54a6.7 6.7 0 0 0-1.62.94l-2.39-.96a.506.506 0 0 0-.59.22l-1.92 3.32a.506.506 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.506.506 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.42.47.42h3.84c.24 0 .44-.17.47-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM11 15.6a4.6 4.6 0 1 1 0-9.2 4.6 4.6 0 0 1 0 9.2z"
  />
</svg>`;

export const kuusiLauncherMindMapIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-mindmap",
  svgstr: MIND_MAP_ICON_SVG,
});

export const kuusiLauncherMarkdownIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-markdown",
  svgstr: KUUSI_LAUNCHER_MARKDOWN_SVG,
});

export const kuusiLauncherTexIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-tex",
  svgstr: KUUSI_LAUNCHER_TEX_SVG,
});

export const kuusiLauncherLivePdfIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-live-pdf",
  svgstr: LIVE_PDF_ICON_SVG,
});

export const kuusiLauncherImageIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-image",
  svgstr: KUUSI_IMAGE_ICON_SVG,
});

export const kuusiLauncherVoiceIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-voice",
  svgstr: VOICE_RECORDER_ICON_SVG,
});

export const kuusiLauncherSettingsIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-settings",
  svgstr: KUUSI_LAUNCHER_SETTINGS_SVG,
});
