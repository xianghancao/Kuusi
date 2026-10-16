import {
  getCapsuleAutoCollapse,
  setCapsuleAutoCollapse,
} from "./capsuleCollapseSettings";
import type { KuusiTranslator } from "./kuusiI18n";
import { createAutoReloadSwitch } from "./markdownPreview/autoReloadSwitch";

export type CapsuleCollapseRow = {
  node: HTMLElement;
  /** Re-read the setting (another view's menu may have flipped it). */
  sync: () => void;
};

/** The "Auto collapse capsule" switch shown in a capsule logo's menu. */
export const createCapsuleCollapseRow = (
  t: KuusiTranslator,
): CapsuleCollapseRow => {
  const row = createAutoReloadSwitch(
    getCapsuleAutoCollapse(),
    "jp-KuusiRenderSync-live",
    t.capsuleAutoCollapseTitle(),
    (enabled) => {
      setCapsuleAutoCollapse(enabled);
    },
    t.capsuleAutoCollapse(),
  );

  return {
    node: row.node,
    sync: () => row.setEnabled(getCapsuleAutoCollapse()),
  };
};
