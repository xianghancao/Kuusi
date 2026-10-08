import { Signal } from "@lumino/signaling";

import type { KuusiRenderViewId } from "./kuusiRenderViews";

export const DEFAULT_RENDER_VIEW_ORDER: readonly KuusiRenderViewId[] = [
  "article",
  "book",
  "mindmap",
  "slides",
];

let order: KuusiRenderViewId[] = [...DEFAULT_RENDER_VIEW_ORDER];

const changed = new Signal<unknown, KuusiRenderViewId[]>({});

/** Keep known ids once each, then append any that are missing. */
export const normalizeRenderViewOrder = (raw: unknown): KuusiRenderViewId[] => {
  const seen = new Set<KuusiRenderViewId>();
  const next: KuusiRenderViewId[] = [];

  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (
        (DEFAULT_RENDER_VIEW_ORDER as readonly unknown[]).includes(id) &&
        !seen.has(id as KuusiRenderViewId)
      ) {
        seen.add(id as KuusiRenderViewId);
        next.push(id as KuusiRenderViewId);
      }
    }
  }

  for (const id of DEFAULT_RENDER_VIEW_ORDER) {
    if (!seen.has(id)) {
      next.push(id);
    }
  }

  return next;
};

export const getRenderViewOrder = (): KuusiRenderViewId[] => [...order];

export const setRenderViewOrder = (next: unknown): void => {
  order = normalizeRenderViewOrder(next);
  changed.emit(getRenderViewOrder());
};

export const onRenderViewOrderChanged = (
  listener: () => void,
): { disconnect: () => void } => {
  const handler = (): void => listener();
  changed.connect(handler);
  return { disconnect: () => changed.disconnect(handler) };
};

/** Views offered to users by default; Book / Slides stay opt-in in Settings. */
export const DEFAULT_ENABLED_RENDER_VIEWS: readonly KuusiRenderViewId[] = [
  "article",
  "mindmap",
];

let enabled: KuusiRenderViewId[] = [...DEFAULT_ENABLED_RENDER_VIEWS];

const enabledChanged = new Signal<unknown, KuusiRenderViewId[]>({});

export const normalizeEnabledRenderViews = (
  raw: unknown,
): KuusiRenderViewId[] => {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_ENABLED_RENDER_VIEWS];
  }
  // Never leave the switcher empty.
  const ids = DEFAULT_RENDER_VIEW_ORDER.filter((id) => raw.includes(id));
  return ids.length ? [...ids] : [...DEFAULT_ENABLED_RENDER_VIEWS];
};

export const getEnabledRenderViews = (): KuusiRenderViewId[] => [...enabled];

export const isRenderViewEnabled = (id: KuusiRenderViewId): boolean =>
  enabled.includes(id);

export const setEnabledRenderViews = (next: unknown): void => {
  enabled = normalizeEnabledRenderViews(next);
  enabledChanged.emit(getEnabledRenderViews());
};

export const onEnabledRenderViewsChanged = (
  listener: () => void,
): { disconnect: () => void } => {
  const handler = (): void => listener();
  enabledChanged.connect(handler);
  return { disconnect: () => enabledChanged.disconnect(handler) };
};
