import { LabIcon } from "@jupyterlab/ui-components";
import { MIND_MAP_ICON_SVG } from "./kuusiIcon";

const KUUSI_LAUNCHER_MARKDOWN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22">
  <path fill="currentColor" d="M5 14.9h12l-6.1 6zm9.4-6.8c0-1.3-.1-2.9-.1-4.5-.4 1.4-.9 2.9-1.3 4.3l-1.3 4.3h-2L8.5 7.9c-.4-1.3-.7-2.9-1-4.3-.1 1.6-.1 3.2-.2 4.6L7 12.4H4.8l.7-11h3.3L10 5c.4 1.2.7 2.7 1 3.9.3-1.2.7-2.6 1-3.9l1.2-3.7h3.3l.6 11h-2.4z"/>
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

/** Notebook / ipynb tile — stacked cells. */
const KUUSI_LAUNCHER_NOTEBOOK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" fill="none">
  <rect x="3.5" y="2.5" width="15" height="17" rx="2.2" stroke="currentColor" stroke-width="1.6"/>
  <path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M6.5 7h9M6.5 11h9M6.5 15h6"/>
</svg>`;

/** Article tile — page with text lines. */
const KUUSI_LAUNCHER_ARTICLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" fill="none">
  <path stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M5.2 3.2h9.2L16.8 5.6v13.2H5.2z"/>
  <path stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M7.4 9h7.2M7.4 12h7.2M7.4 15h4.8"/>
</svg>`;

/** Book tile — open spread. */
const KUUSI_LAUNCHER_BOOK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" fill="none">
  <path stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M11 5.2C8.8 3.8 6.2 3.4 3.8 4v12.2c2.5-.7 5-.2 7.2 1.4 2.2-1.6 4.7-2.1 7.2-1.4V4c-2.4-.6-5-.2-7.2 1.2z"/>
  <path stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M11 5.4v12.2"/>
</svg>`;

export const kuusiLauncherNotebookIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-notebook",
  svgstr: KUUSI_LAUNCHER_NOTEBOOK_SVG,
});

export const kuusiLauncherArticleIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-article",
  svgstr: KUUSI_LAUNCHER_ARTICLE_SVG,
});

export const kuusiLauncherBookIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-book",
  svgstr: KUUSI_LAUNCHER_BOOK_SVG,
});

export const kuusiLauncherMarkdownIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-markdown",
  svgstr: KUUSI_LAUNCHER_MARKDOWN_SVG,
});

export const kuusiLauncherSettingsIcon = new LabIcon({
  name: "jupyterlab-kuusi:launcher-settings",
  svgstr: KUUSI_LAUNCHER_SETTINGS_SVG,
});
