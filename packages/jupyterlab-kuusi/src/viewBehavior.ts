/** How the canvas behaves when you open it, zoom it, and scroll it. */

export type WheelBehavior = "pan" | "zoom";

/**
 * Where the camera goes when a mind map opens:
 * - `selected`: center the active node (the long-standing behavior)
 * - `root`: center the map root
 * - `fit`: zoom out so the whole map is visible
 * - `last`: restore the zoom and position this file had when it was closed
 */
export type OpenViewMode = "selected" | "root" | "fit" | "last";

export const WHEEL_BEHAVIORS: readonly WheelBehavior[] = ["pan", "zoom"];
export const OPEN_VIEW_MODES: readonly OpenViewMode[] = [
  "selected",
  "root",
  "fit",
  "last",
];

export const ZOOM_MIN_LIMITS = { min: 5, max: 100, step: 5, default: 20 };
export const ZOOM_MAX_LIMITS = { min: 100, max: 800, step: 50, default: 200 };
export const WHEEL_SPEED_LIMITS = { min: 0.25, max: 3, step: 0.05, default: 1 };

export type ViewBehaviorSettings = {
  zoomMinPercent: number;
  zoomMaxPercent: number;
  /** Multiplier on the built-in wheel / pinch zoom intensity. */
  wheelZoomSpeed: number;
  wheelBehavior: WheelBehavior;
  openView: OpenViewMode;
};

export const DEFAULT_VIEW_BEHAVIOR: ViewBehaviorSettings = {
  zoomMinPercent: ZOOM_MIN_LIMITS.default,
  zoomMaxPercent: ZOOM_MAX_LIMITS.default,
  wheelZoomSpeed: WHEEL_SPEED_LIMITS.default,
  wheelBehavior: "pan",
  openView: "selected",
};

const clampStep = (
  value: unknown,
  limits: { min: number; max: number; step: number; default: number },
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return limits.default;
  }

  const stepped = Math.round(value / limits.step) * limits.step;
  const clamped = Math.min(limits.max, Math.max(limits.min, stepped));

  // Avoid 0.30000000000000004 from step arithmetic.
  return Math.round(clamped * 1000) / 1000;
};

export const isWheelBehavior = (value: unknown): value is WheelBehavior =>
  (WHEEL_BEHAVIORS as readonly unknown[]).includes(value);

export const isOpenViewMode = (value: unknown): value is OpenViewMode =>
  (OPEN_VIEW_MODES as readonly unknown[]).includes(value);

export const normalizeViewBehavior = (
  raw: Partial<Record<keyof ViewBehaviorSettings, unknown>>,
): ViewBehaviorSettings => {
  const zoomMinPercent = clampStep(raw.zoomMinPercent, ZOOM_MIN_LIMITS);
  const zoomMaxPercent = clampStep(raw.zoomMaxPercent, ZOOM_MAX_LIMITS);

  return {
    zoomMinPercent,
    // Limits already keep min ≤ 100 ≤ max; this guards direct config edits.
    zoomMaxPercent: Math.max(zoomMaxPercent, zoomMinPercent),
    wheelZoomSpeed: clampStep(raw.wheelZoomSpeed, WHEEL_SPEED_LIMITS),
    wheelBehavior: isWheelBehavior(raw.wheelBehavior)
      ? raw.wheelBehavior
      : DEFAULT_VIEW_BEHAVIOR.wheelBehavior,
    openView: isOpenViewMode(raw.openView)
      ? raw.openView
      : DEFAULT_VIEW_BEHAVIOR.openView,
  };
};

/** A remembered camera for one file (internal zoom scale + pan offsets). */
export type SavedView = { zoom: number; panX: number; panY: number; at: number };

const SAVED_VIEWS_KEY = "jupyterlab-kuusi:mindmap-views";
const MAX_SAVED_VIEWS = 50;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const readAll = (storage: StorageLike): Record<string, SavedView> => {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SAVED_VIEWS_KEY) ?? "{}");

    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, SavedView>)
      : {};
  } catch {
    return {};
  }
};

const isFiniteView = (view: unknown): view is SavedView =>
  Boolean(view) &&
  typeof view === "object" &&
  Number.isFinite((view as SavedView).zoom) &&
  Number.isFinite((view as SavedView).panX) &&
  Number.isFinite((view as SavedView).panY);

export const loadSavedView = (
  storage: StorageLike,
  path: string,
): SavedView | null => {
  const view = readAll(storage)[path];

  return isFiniteView(view) ? view : null;
};

export const saveView = (
  storage: StorageLike,
  path: string,
  view: Omit<SavedView, "at">,
  now = Date.now(),
): void => {
  const all = readAll(storage);
  all[path] = { ...view, at: now };

  // Keep only the most recently used files.
  const kept = Object.entries(all)
    .filter(([, value]) => isFiniteView(value))
    .sort(([, a], [, b]) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, MAX_SAVED_VIEWS);

  try {
    storage.setItem(SAVED_VIEWS_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage full or blocked: remembering the view is best-effort.
  }
};
