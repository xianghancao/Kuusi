import { Signal } from "@lumino/signaling";

/**
 * Whether the view capsules (Article / Book / Slides / Mind Map headers) fold
 * into a small round Kuusi mark until the pointer reaches them. One setting
 * for every view; on by default.
 */
let autoCollapse = true;

export const capsuleAutoCollapseChanged = new Signal<unknown, boolean>({});

export const getCapsuleAutoCollapse = (): boolean => autoCollapse;

/** Stamp the choice on <body>; the stylesheet does the rest. */
const apply = (): void => {
  document.body?.setAttribute(
    "data-kuusi-capsule-collapse",
    autoCollapse ? "on" : "off",
  );
};

/** Load without announcing a change (used when settings are read). */
export const loadCapsuleAutoCollapse = (value: unknown): void => {
  autoCollapse = typeof value === "boolean" ? value : true;
  apply();
};

export const setCapsuleAutoCollapse = (value: boolean): void => {
  if (value === autoCollapse) {
    return;
  }

  autoCollapse = value;
  apply();
  capsuleAutoCollapseChanged.emit(value);
};
