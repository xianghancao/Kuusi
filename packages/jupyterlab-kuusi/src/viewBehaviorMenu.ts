import type { KuusiTranslator } from "./kuusiI18n";
import { renderPanelWidgets } from "./panelWidgets";
import { mountSecondaryMenu } from "./secondaryMenu";
import {
  OPEN_VIEW_MODES,
  WHEEL_BEHAVIORS,
  WHEEL_SPEED_LIMITS,
  ZOOM_MAX_LIMITS,
  ZOOM_MIN_LIMITS,
  type OpenViewMode,
  type ViewBehaviorSettings,
  type WheelBehavior,
} from "./viewBehavior";

type ViewSection = "zoom" | "wheel" | "open";

let lastViewSection: ViewSection = "zoom";

export type ViewBehaviorApi = {
  get: () => ViewBehaviorSettings;
  update: (partial: Partial<ViewBehaviorSettings>) => void;
};

const openViewLabel = (mode: OpenViewMode, t: KuusiTranslator): string => {
  switch (mode) {
    case "root":
      return t.openViewRoot();
    case "fit":
      return t.openViewFit();
    case "last":
      return t.openViewLast();
    default:
      return t.openViewSelected();
  }
};

/** Zoom range · mouse wheel · where the camera starts when a map opens. */
export const fillViewBehaviorMenu = (
  host: HTMLElement,
  api: ViewBehaviorApi,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  mountSecondaryMenu<ViewSection>(host, {
    ariaLabel: t.viewBehavior(),
    sections: [
      { id: "zoom", label: t.zoomRange() },
      { id: "wheel", label: t.mouseWheel() },
      { id: "open", label: t.onOpen() },
    ],
    getActive: () => lastViewSection,
    setActive: (id) => {
      lastViewSection = id;
    },
    fillSection: (id, panel) => {
      const settings = api.get();

      if (id === "zoom") {
        renderPanelWidgets(panel, [
          {
            kind: "slider",
            label: t.zoomMinimum(),
            value: settings.zoomMinPercent,
            min: ZOOM_MIN_LIMITS.min,
            max: ZOOM_MIN_LIMITS.max,
            step: ZOOM_MIN_LIMITS.step,
            valueSuffix: "%",
            onChange: (value) => {
              api.update({ zoomMinPercent: value });
            },
          },
          {
            kind: "slider",
            label: t.zoomMaximum(),
            value: settings.zoomMaxPercent,
            min: ZOOM_MAX_LIMITS.min,
            max: ZOOM_MAX_LIMITS.max,
            step: ZOOM_MAX_LIMITS.step,
            valueSuffix: "%",
            onChange: (value) => {
              api.update({ zoomMaxPercent: value });
            },
          },
        ]);
        return;
      }

      if (id === "wheel") {
        renderPanelWidgets(panel, [
          {
            kind: "choice",
            sectionLabel: t.mouseWheel(),
            value: settings.wheelBehavior,
            options: WHEEL_BEHAVIORS.map((value) => ({
              value,
              label: value === "zoom" ? t.wheelZooms() : t.wheelPans(),
              title:
                value === "zoom" ? t.wheelZoomsTitle() : t.wheelPansTitle(),
            })),
            onChange: (value) => {
              api.update({ wheelBehavior: value as WheelBehavior });
              rebuild();
            },
          },
          {
            kind: "slider",
            label: t.wheelZoomSpeed(),
            value: settings.wheelZoomSpeed,
            min: WHEEL_SPEED_LIMITS.min,
            max: WHEEL_SPEED_LIMITS.max,
            step: WHEEL_SPEED_LIMITS.step,
            valueSuffix: "×",
            onChange: (value) => {
              api.update({ wheelZoomSpeed: value });
            },
          },
        ]);
        return;
      }

      renderPanelWidgets(panel, [
        {
          kind: "choice",
          sectionLabel: t.onOpen(),
          value: settings.openView,
          options: OPEN_VIEW_MODES.map((value) => ({
            value,
            label: openViewLabel(value, t),
          })),
          onChange: (value) => {
            api.update({ openView: value as OpenViewMode });
            rebuild();
          },
        },
      ]);
    },
  });
};
