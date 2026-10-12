import { Signal } from "@lumino/signaling";

/**
 * How the line number of the cursor's line is marked in the Markdown editor
 * (one setting for every Markdown editor).
 */
export type ActiveLineStyle = "default" | "highlight" | "bold" | "bar" | "off";

export const ACTIVE_LINE_STYLES: readonly ActiveLineStyle[] = [
  "default",
  "highlight",
  "bold",
  "bar",
  "off",
];

export const isActiveLineStyle = (value: unknown): value is ActiveLineStyle =>
  typeof value === "string" &&
  (ACTIVE_LINE_STYLES as readonly string[]).includes(value);

export type ActiveLineSettings = { style: ActiveLineStyle; color: string };

let current: ActiveLineSettings = { style: "default", color: "" };

export const activeLineChanged = new Signal<unknown, ActiveLineSettings>({});

export const getActiveLineSettings = (): ActiveLineSettings => ({ ...current });

/** Stamp the choice on <body>; the stylesheet does the rest. */
const apply = (): void => {
  const body = document.body;

  if (!body) {
    return;
  }

  body.dataset.kuusiActiveLine = current.style;

  if (current.color) {
    body.style.setProperty("--kuusi-active-line-color", current.color);
  } else {
    body.style.removeProperty("--kuusi-active-line-color");
  }
};

/** Load without announcing a change (used when settings are read). */
export const loadActiveLineSettings = (next: Partial<ActiveLineSettings>): void => {
  current = {
    style: isActiveLineStyle(next.style) ? next.style : "default",
    color:
      typeof next.color === "string" && /^(#[0-9a-fA-F]{3,8})?$/.test(next.color)
        ? next.color
        : "",
  };
  apply();
};

export const setActiveLineSettings = (next: Partial<ActiveLineSettings>): void => {
  current = { ...current, ...next };
  apply();
  activeLineChanged.emit(getActiveLineSettings());
};
