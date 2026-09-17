import { APPEARANCE_COLOR_SWATCHES } from "./colorPicker";
import type { KuusiTranslator } from "./kuusiI18n";
import { closeKuusiDropdownMenus, openKuusiDropdownMenu } from "./formatToolbar";
import type { PanelWidget } from "./panelWidgets";
import { renderPanelWidgets } from "./panelWidgets";
import { mountSecondaryMenu, type SecondaryMenuController } from "./secondaryMenu";
import { LAYOUT_NODE_WIDTH, type EdgeRouteStyle } from "kuusi-kernel";

export type { EdgeRouteStyle };

export type EdgeLineStyle =
  | "solid"
  | "dashed"
  | "dotted"
  | "long-dash"
  | "dash-dot"
  | "dense-dot"
  | "sparse-dash";

export type BorderLineStyle = "solid" | "dashed" | "dotted";

export type EdgeArrowDirection = "none" | "end" | "start" | "both";

export type EdgeArrowStyle =
  | "triangle"
  | "stealth"
  | "diamond"
  | "circle"
  | "open";

export type NodeBorderCorner = "sharp" | "rounded" | "ellipse";

/** @deprecated Use EdgeLineStyle or BorderLineStyle */
export type LineStyle = EdgeLineStyle;

export type AppearanceSettings = {
  edgeStyle: EdgeLineStyle;
  edgeRoute: EdgeRouteStyle;
  edgeArrowDirection: EdgeArrowDirection;
  edgeArrowStyle: EdgeArrowStyle;
  edgeWidth: string;
  edgeColor: string;
  /** Default node fill for the whole map; empty uses theme. */
  nodeFillColor: string;
  nodeBorderStyle: BorderLineStyle;
  nodeBorderWidth: string;
  nodeBorderColor: string;
  nodeBorderCorner: NodeBorderCorner;
  nodeBorderRadius: string;
  /** Selected-node glow ring color; empty uses theme brand color. */
  selectionGlowColor: string;
  /** Selected-node glow ring width (e.g. `2px`). */
  selectionGlowWidth: string;
  /** Hover-node edge glow; empty follows border color or blue when border unset. */
  hoverGlowColor: string;
  /** Hover-node glow ring width (same scale as selection glow). */
  hoverGlowWidth: string;
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  edgeStyle: "solid",
  edgeRoute: "orthogonal",
  edgeArrowDirection: "none",
  edgeArrowStyle: "triangle",
  edgeWidth: "3pt",
  edgeColor: "",
  nodeFillColor: "",
  nodeBorderStyle: "solid",
  nodeBorderWidth: "1px",
  nodeBorderColor: "",
  nodeBorderCorner: "rounded",
  nodeBorderRadius: "8px",
  selectionGlowColor: "",
  selectionGlowWidth: "2px",
  hoverGlowColor: "",
  hoverGlowWidth: "1px",
};

const EDGE_LINE_STYLES: Array<{ value: EdgeLineStyle; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "long-dash", label: "Long dash" },
  { value: "dash-dot", label: "Dash dot" },
  { value: "dense-dot", label: "Dense dot" },
  { value: "sparse-dash", label: "Sparse dash" },
];

const EDGE_ROUTE_STYLES: Array<{ value: EdgeRouteStyle; label: string }> = [
  { value: "straight", label: "Straight" },
  { value: "curve", label: "Curve" },
  { value: "orthogonal", label: "Orthogonal" },
  { value: "rounded-orthogonal", label: "Rounded" },
];

const BORDER_LINE_STYLES: Array<{ value: BorderLineStyle; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const EDGE_ARROW_DIRECTIONS: Array<{
  value: EdgeArrowDirection;
  label: string;
}> = [
  { value: "none", label: "None" },
  { value: "end", label: "To child" },
  { value: "start", label: "To parent" },
  { value: "both", label: "Both" },
];

const EDGE_ARROW_STYLES: Array<{ value: EdgeArrowStyle; label: string }> = [
  { value: "triangle", label: "Triangle" },
  { value: "stealth", label: "Stealth" },
  { value: "diamond", label: "Diamond" },
  { value: "circle", label: "Circle" },
  { value: "open", label: "Open" },
];

const EDGE_WIDTHS = ["1pt", "2pt", "3pt", "4pt", "5pt", "6pt", "8pt", "10pt"];
const NODE_BORDER_WIDTHS = ["1px", "2px", "3px", "4px", "5px", "6pt", "8pt", "10pt"];

const NODE_BORDER_RADII = ["4px", "8px", "12px", "16px", "24px", "32px"];

type NodeBorderCornerOption =
  | { kind: "sharp"; label: string }
  | { kind: "ellipse"; label: string }
  | { kind: "radius"; radius: string; label: string };

/** Sharp + radius presets + ellipse in one Corner row. */
const NODE_BORDER_CORNER_OPTIONS: NodeBorderCornerOption[] = [
  { kind: "sharp", label: "Sharp" },
  ...NODE_BORDER_RADII.map(
    (radius): NodeBorderCornerOption => ({
      kind: "radius",
      radius,
      label: radius,
    }),
  ),
  { kind: "ellipse", label: "Ellipse" },
];

const SVG_NS = "http://www.w3.org/2000/svg";

/** Convert appearance edge width (e.g. `3pt`) to SVG user-space pixels. */
export const parseEdgeWidthPx = (width: string): number => {
  const match = width.trim().match(/^([\d.]+)\s*(pt|px|mm)?$/i);

  if (!match) {
    return 4;
  }

  const value = Number.parseFloat(match[1]);

  if (!Number.isFinite(value) || value <= 0) {
    return 4;
  }

  const unit = (match[2] ?? "px").toLowerCase();

  if (unit === "pt") {
    return value * (96 / 72);
  }

  if (unit === "mm") {
    return value * (96 / 25.4);
  }

  return value;
};

const tipRefXForStyle = (style: EdgeArrowStyle): string => {
  if (style === "circle") {
    return "8.5";
  }

  if (style === "diamond") {
    return "9.5";
  }

  if (style === "open") {
    return "9";
  }

  // triangle / stealth — sit slightly inside the tip so the stroke
  // terminates under the filled head instead of floating past it.
  return "9";
};

const appendArrowShape = (
  marker: SVGMarkerElement,
  style: EdgeArrowStyle,
): void => {
  if (style === "circle") {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", "5");
    circle.setAttribute("cy", "5");
    circle.setAttribute("r", "3.5");
    circle.setAttribute("fill", "context-stroke");
    marker.appendChild(circle);
    return;
  }

  const path = document.createElementNS(SVG_NS, "path");

  if (style === "stealth") {
    path.setAttribute("d", "M 0 0 L 10 5 L 0 10 L 3 5 Z");
  } else if (style === "diamond") {
    path.setAttribute("d", "M 1 5 L 5 1 L 10 5 L 5 9 Z");
  } else if (style === "open") {
    path.setAttribute("d", "M 1 1 L 9 5 L 1 9");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "context-stroke");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    marker.appendChild(path);
    return;
  } else {
    path.setAttribute("d", "M 0 0 L 10 5 L 0 10 Z");
  }

  path.setAttribute("fill", "context-stroke");
  marker.appendChild(path);
};

const createEdgeMarker = (
  id: string,
  style: EdgeArrowStyle,
  atStart: boolean,
  edgeWidthPx: number,
): SVGMarkerElement => {
  const marker = document.createElementNS(SVG_NS, "marker");
  // userSpaceOnUse keeps arrows locked to the path under CSS zoom/pan.
  // strokeWidth + CSS `pt` stroke often drifts when the scene is scaled.
  const size = Math.max(10, edgeWidthPx * 3.6);
  const tipRefX = tipRefXForStyle(style);

  marker.setAttribute("id", id);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", tipRefX);
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", String(size));
  marker.setAttribute("markerHeight", String(size));
  marker.setAttribute("markerUnits", "userSpaceOnUse");
  marker.setAttribute("orient", atStart ? "auto-start-reverse" : "auto");
  marker.setAttribute("overflow", "visible");
  appendArrowShape(marker, style);
  return marker;
};

/** Append SVG marker defs for the current arrow settings; returns marker URLs. */
export const appendEdgeArrowDefs = (
  svg: SVGSVGElement,
  settings: Pick<
    AppearanceSettings,
    "edgeArrowDirection" | "edgeArrowStyle" | "edgeWidth"
  >,
): { markerStart?: string; markerEnd?: string } => {
  const direction = settings.edgeArrowDirection;
  const style = settings.edgeArrowStyle;

  if (direction === "none") {
    return {};
  }

  if (!svg.dataset.kuusiMarkerUid) {
    svg.dataset.kuusiMarkerUid = `m${Math.random().toString(36).slice(2, 9)}`;
  }

  const uid = svg.dataset.kuusiMarkerUid;
  const edgeWidthPx = parseEdgeWidthPx(settings.edgeWidth);
  const defs = document.createElementNS(SVG_NS, "defs");
  const result: { markerStart?: string; markerEnd?: string } = {};

  if (direction === "end" || direction === "both") {
    const id = `${uid}-end`;
    defs.appendChild(createEdgeMarker(id, style, false, edgeWidthPx));
    result.markerEnd = `url(#${id})`;
  }

  if (direction === "start" || direction === "both") {
    const id = `${uid}-start`;
    defs.appendChild(createEdgeMarker(id, style, true, edgeWidthPx));
    result.markerStart = `url(#${id})`;
  }

  svg.appendChild(defs);
  return result;
};

export const resolveNodeBorderRadius = (
  settings: Pick<AppearanceSettings, "nodeBorderCorner" | "nodeBorderRadius">,
): string => {
  if (settings.nodeBorderCorner === "sharp") {
    return "0";
  }

  if (settings.nodeBorderCorner === "ellipse") {
    return "50%";
  }

  return settings.nodeBorderRadius || DEFAULT_APPEARANCE.nodeBorderRadius;
};

const parseCssRgb = (color: string): [number, number, number] | null => {
  const value = color.trim();
  const long = /^#([0-9a-f]{6})$/i.exec(value);

  if (long) {
    return [
      Number.parseInt(long[1].slice(0, 2), 16),
      Number.parseInt(long[1].slice(2, 4), 16),
      Number.parseInt(long[1].slice(4, 6), 16),
    ];
  }

  const short = /^#([0-9a-f]{3})$/i.exec(value);

  if (short) {
    const [r, g, b] = short[1];
    return [
      Number.parseInt(`${r}${r}`, 16),
      Number.parseInt(`${g}${g}`, 16),
      Number.parseInt(`${b}${b}`, 16),
    ];
  }

  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(value);

  if (rgb) {
    return [
      Number.parseFloat(rgb[1]),
      Number.parseFloat(rgb[2]),
      Number.parseFloat(rgb[3]),
    ];
  }

  return null;
};

const relativeLuminance = (r: number, g: number, b: number): number => {
  const toLinear = (channel: number): number => {
    const s = Math.min(255, Math.max(0, channel)) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  );
};

/**
 * Explicit light fills (e.g. Board `#ffffff`) need dark text under Jupyter Dark.
 * Empty fill keeps the theme’s default content color.
 */
export const resolveNodeForeground = (fillColor: string): string => {
  if (!fillColor) {
    return "";
  }

  const rgb = parseCssRgb(fillColor);

  if (!rgb) {
    return "";
  }

  return relativeLuminance(...rgb) > 0.55 ? "#212121" : "#f5f5f5";
};

export const applyAppearanceToScene = (
  scene: HTMLElement,
  settings: AppearanceSettings,
): void => {
  scene.dataset.kuusiEdgeStyle = settings.edgeStyle;
  scene.dataset.kuusiEdgeRoute = settings.edgeRoute;
  scene.dataset.kuusiEdgeArrowDirection = settings.edgeArrowDirection;
  scene.dataset.kuusiEdgeArrowStyle = settings.edgeArrowStyle;
  scene.dataset.kuusiNodeBorderStyle = settings.nodeBorderStyle;
  scene.dataset.kuusiNodeBorderCorner = settings.nodeBorderCorner;

  const setVar = (name: string, value: string) => {
    if (value) {
      scene.style.setProperty(name, value);
    } else {
      scene.style.removeProperty(name);
    }
  };

  const nodeForeground = resolveNodeForeground(settings.nodeFillColor);

  setVar("--kuusi-edge-width", settings.edgeWidth);
  setVar("--kuusi-edge-color", settings.edgeColor);
  setVar("--kuusi-node-background", settings.nodeFillColor);
  setVar("--kuusi-node-foreground", nodeForeground);
  setVar("--kuusi-node-border-width", settings.nodeBorderWidth);
  setVar("--kuusi-node-border-color", settings.nodeBorderColor);
  setVar("--kuusi-node-border-radius", resolveNodeBorderRadius(settings));
  setVar("--kuusi-selection-glow-color", settings.selectionGlowColor);
  setVar("--kuusi-selection-glow-width", settings.selectionGlowWidth);
  setVar("--kuusi-hover-glow-color", settings.hoverGlowColor);
  setVar("--kuusi-hover-glow-width", settings.hoverGlowWidth);
  scene.style.setProperty(
    "--kuusi-hover-glow-fallback",
    settings.nodeBorderColor.trim() ? settings.nodeBorderColor : "#1976d2",
  );

  if (nodeForeground) {
    scene.dataset.kuusiNodeContrast = "1";
  } else {
    delete scene.dataset.kuusiNodeContrast;
  }
};

const createLineStylePreview = (style: EdgeLineStyle): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = `jp-KuusiAppearancePreview jp-KuusiAppearancePreview-line-style is-${style}`;
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

const createEdgeRoutePreview = (route: EdgeRouteStyle): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = "jp-KuusiAppearancePreview jp-KuusiAppearancePreview-edge-route";
  preview.setAttribute("aria-hidden", "true");

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "56");
  svg.setAttribute("height", "28");
  svg.setAttribute("viewBox", "0 0 56 28");

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  switch (route) {
    case "straight":
      path.setAttribute("d", "M 6 6 L 50 22");
      break;
    case "curve":
      path.setAttribute("d", "M 6 6 C 28 6, 28 22, 50 22");
      break;
    case "orthogonal":
      path.setAttribute("d", "M 6 6 L 28 6 L 28 22 L 50 22");
      break;
    case "rounded-orthogonal":
      path.setAttribute("d", "M 6 6 L 22 6 Q 28 6 28 12 L 28 16 Q 28 22 34 22 L 50 22");
      break;
    default:
      path.setAttribute("d", "M 6 6 L 28 6 L 28 22 L 50 22");
  }

  svg.appendChild(path);
  preview.appendChild(svg);
  return preview;
};

const createArrowDirectionPreview = (
  direction: EdgeArrowDirection,
): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = `jp-KuusiAppearancePreview jp-KuusiAppearancePreview-arrow-direction is-${direction}`;
  preview.setAttribute("aria-hidden", "true");

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "56");
  svg.setAttribute("height", "12");
  svg.setAttribute("viewBox", "0 0 56 12");

  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", "8");
  line.setAttribute("y1", "6");
  line.setAttribute("x2", "48");
  line.setAttribute("y2", "6");
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-linecap", "round");
  svg.appendChild(line);

  const addHead = (x: number, pointingRight: boolean) => {
    const head = document.createElementNS(SVG_NS, "path");
    head.setAttribute(
      "d",
      pointingRight ? "M 0 0 L 8 4 L 0 8 Z" : "M 8 0 L 0 4 L 8 8 Z",
    );
    head.setAttribute("fill", "currentColor");
    head.setAttribute(
      "transform",
      `translate(${pointingRight ? x - 8 : x}, 2)`,
    );
    svg.appendChild(head);
  };

  if (direction === "end" || direction === "both") {
    addHead(48, true);
  }

  if (direction === "start" || direction === "both") {
    addHead(8, false);
  }

  preview.appendChild(svg);
  return preview;
};

const createArrowStylePreview = (style: EdgeArrowStyle): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = `jp-KuusiAppearancePreview jp-KuusiAppearancePreview-arrow-style is-${style}`;
  preview.setAttribute("aria-hidden", "true");

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "56");
  svg.setAttribute("height", "12");
  svg.setAttribute("viewBox", "0 0 56 12");

  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", "6");
  line.setAttribute("y1", "6");
  line.setAttribute("x2", "40");
  line.setAttribute("y2", "6");
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-linecap", "round");
  svg.appendChild(line);

  if (style === "circle") {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", "46");
    circle.setAttribute("cy", "6");
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", "currentColor");
    svg.appendChild(circle);
  } else {
    const head = document.createElementNS(SVG_NS, "path");

    if (style === "stealth") {
      head.setAttribute("d", "M 38 1 L 52 6 L 38 11 L 42 6 Z");
    } else if (style === "diamond") {
      head.setAttribute("d", "M 40 6 L 46 1 L 52 6 L 46 11 Z");
    } else if (style === "open") {
      head.setAttribute("d", "M 40 1 L 52 6 L 40 11");
      head.setAttribute("fill", "none");
      head.setAttribute("stroke", "currentColor");
      head.setAttribute("stroke-width", "1.5");
      head.setAttribute("stroke-linejoin", "round");
    } else {
      head.setAttribute("d", "M 38 1 L 52 6 L 38 11 Z");
    }

    if (style !== "open") {
      head.setAttribute("fill", "currentColor");
    }

    svg.appendChild(head);
  }

  preview.appendChild(svg);
  return preview;
};

const createLineWidthPreview = (width: string): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = "jp-KuusiAppearancePreview jp-KuusiAppearancePreview-line-width";
  preview.style.setProperty("--kuusi-preview-line-width", width);
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

const createBorderStylePreview = (style: BorderLineStyle): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = `jp-KuusiAppearancePreview jp-KuusiAppearancePreview-border-style is-${style}`;
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

const createBorderWidthPreview = (width: string): HTMLElement => {
  const preview = document.createElement("span");
  preview.className =
    "jp-KuusiAppearancePreview jp-KuusiAppearancePreview-border-width";
  preview.style.setProperty("--kuusi-preview-border-width", width);
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

const createBorderCornerPreview = (corner: NodeBorderCorner): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = `jp-KuusiAppearancePreview jp-KuusiAppearancePreview-border-corner is-${corner}`;
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

const createBorderRadiusPreview = (radius: string): HTMLElement => {
  const preview = document.createElement("span");
  preview.className =
    "jp-KuusiAppearancePreview jp-KuusiAppearancePreview-border-radius";
  preview.style.setProperty("--kuusi-preview-border-radius", radius);
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

export type AppearanceNodeFillApi = {
  /** Whether a node is selected for per-node fill. */
  hasSelection: () => boolean;
  /** Current selected node's fill (empty = inherit map default). */
  getSelectedFill: () => string;
  /** Persist fill on the selected node (`metadata.kuusi.frameStyle.background`). */
  setSelectedFill: (color: string) => void;
};

type LineSection = "style" | "route" | "arrow" | "arrowStyle" | "width" | "color";
type NodeSection =
  | "width"
  | "fill"
  | "border"
  | "corner"
  | "selection"
  | "hover";

let lastLineSection: LineSection = "style";
let lastNodeSection: NodeSection = "width";

export type NodeWidthMenuState = {
  equalNodeWidth: boolean;
  adaptiveNodeWidth: boolean;
  nodeWidth: number;
};

export type NodeWidthMenuApi = {
  getState: () => NodeWidthMenuState;
  onChange: (state: {
    equalNodeWidth?: boolean;
    adaptiveNodeWidth?: boolean;
    nodeWidth?: number;
  }) => void;
};

export const fillLineAppearanceMenu = (
  root: HTMLElement,
  menu: HTMLElement,
  getSettings: () => AppearanceSettings,
  onChange: (settings: AppearanceSettings) => void,
  onRebuild: () => void,
  t: KuusiTranslator,
): SecondaryMenuController<LineSection> => {
  return mountSecondaryMenu(menu, {
    ariaLabel: t.connectorLineAppearance(),
    sections: [
      { id: "style", label: t.style() },
      { id: "route", label: t.route() },
      { id: "arrow", label: t.arrow() },
      { id: "arrowStyle", label: t.arrowStyle() },
      { id: "width", label: t.width() },
      { id: "color", label: t.color() },
    ],
    getActive: () => lastLineSection,
    setActive: (id) => {
      lastLineSection = id;
    },
    fillSection: (id, panel) => {
      const settings = getSettings();
      const patch = (partial: Partial<AppearanceSettings>) => {
        onChange({ ...getSettings(), ...partial });
      };

      if (id === "style") {
        renderPanelWidgets(panel, [
          {
            kind: "choice",
            value: settings.edgeStyle,
            options: EDGE_LINE_STYLES.map(({ value, label }) => ({
              value,
              label,
              preview: () => createLineStylePreview(value),
            })),
            onChange: (value) => {
              patch({ edgeStyle: value as EdgeLineStyle });
              onRebuild();
            },
          },
        ]);
        return;
      }

      if (id === "route") {
        renderPanelWidgets(panel, [
          {
            kind: "choice",
            value: settings.edgeRoute,
            options: EDGE_ROUTE_STYLES.map(({ value, label }) => ({
              value,
              label,
              preview: () => createEdgeRoutePreview(value),
            })),
            onChange: (value) => {
              patch({ edgeRoute: value as EdgeRouteStyle });
              onRebuild();
            },
          },
        ]);
        return;
      }

      if (id === "arrow") {
        renderPanelWidgets(panel, [
          {
            kind: "choice",
            value: settings.edgeArrowDirection,
            options: EDGE_ARROW_DIRECTIONS.map(({ value, label }) => ({
              value,
              label,
              preview: () => createArrowDirectionPreview(value),
            })),
            onChange: (value) => {
              patch({ edgeArrowDirection: value as EdgeArrowDirection });
              onRebuild();
            },
          },
        ]);
        return;
      }

      if (id === "arrowStyle") {
        renderPanelWidgets(panel, [
          {
            kind: "choice",
            value: settings.edgeArrowStyle,
            options: EDGE_ARROW_STYLES.map(({ value, label }) => ({
              value,
              label,
              preview: () => createArrowStylePreview(value),
            })),
            onChange: (value) => {
              patch({
                edgeArrowStyle: value as EdgeArrowStyle,
                edgeArrowDirection:
                  settings.edgeArrowDirection === "none"
                    ? "end"
                    : settings.edgeArrowDirection,
              });
              onRebuild();
            },
          },
        ]);
        return;
      }

      if (id === "width") {
        renderPanelWidgets(panel, [
          {
            kind: "choice",
            value: settings.edgeWidth,
            options: EDGE_WIDTHS.map((width) => ({
              value: width,
              label: width,
              preview: () => createLineWidthPreview(width),
            })),
            onChange: (value) => {
              patch({ edgeWidth: value });
              onRebuild();
            },
          },
        ]);
        return;
      }

      renderPanelWidgets(panel, [
        {
          kind: "color",
          sectionLabel: t.color(),
          value: settings.edgeColor,
          swatches: APPEARANCE_COLOR_SWATCHES,
          includeDefaultSwatch: true,
          customInputId: "jp-KuusiAppearanceEdgeColor-input",
          customDefault: "#1976d2",
          onChange: (color) => {
            patch({ edgeColor: color });
            onRebuild();
          },
        },
      ]);
    },
  });
};

export const fillNodeAppearanceMenu = (
  root: HTMLElement,
  menu: HTMLElement,
  getSettings: () => AppearanceSettings,
  onChange: (settings: AppearanceSettings) => void,
  nodeFill: AppearanceNodeFillApi,
  nodeWidth: NodeWidthMenuApi,
  onRebuild: () => void,
  t: KuusiTranslator,
): SecondaryMenuController<NodeSection> => {
  return mountSecondaryMenu(menu, {
    ariaLabel: t.nodeAppearance(),
    sections: [
      { id: "width", label: t.width() },
      { id: "fill", label: t.fill() },
      { id: "border", label: t.border() },
      { id: "corner", label: t.corner() },
      { id: "selection", label: t.selection() },
      { id: "hover", label: t.hover() },
    ],
    getActive: () => lastNodeSection,
    setActive: (id) => {
      lastNodeSection = id;
    },
    fillSection: (id, panel) => {
      const settings = getSettings();
      const hasSelection = nodeFill.hasSelection();
      const selectedFill = hasSelection ? nodeFill.getSelectedFill() : "";
      const patch = (partial: Partial<AppearanceSettings>) => {
        onChange({ ...getSettings(), ...partial });
      };

      if (id === "width") {
        const widthState = nodeWidth.getState();
        renderPanelWidgets(panel, [
          {
            kind: "slider",
            label: widthState.adaptiveNodeWidth
              ? t.nodeWidthMax()
              : t.nodeWidth(),
            value: widthState.nodeWidth,
            min: LAYOUT_NODE_WIDTH.min,
            max: LAYOUT_NODE_WIDTH.max,
            valueSuffix: "px",
            onChange: (value) => {
              nodeWidth.onChange({ nodeWidth: value });
            },
          },
          {
            kind: "toggle",
            label: t.equalNodeWidth(),
            title: t.equalNodeWidthTitle(),
            value: widthState.equalNodeWidth,
            onChange: (equalNodeWidth) => {
              nodeWidth.onChange({ equalNodeWidth });
              onRebuild();
            },
          },
          {
            kind: "toggle",
            label: t.adaptiveNodeWidth(),
            title: t.adaptiveNodeWidthTitle(),
            value: widthState.adaptiveNodeWidth,
            onChange: (adaptiveNodeWidth) => {
              nodeWidth.onChange({ adaptiveNodeWidth });
              onRebuild();
            },
          },
        ]);
        return;
      }

      if (id === "fill") {
        const widgets: PanelWidget[] = [
          {
            kind: "color",
            sectionLabel: t.nodeFillDefault(),
            value: settings.nodeFillColor,
            swatches: APPEARANCE_COLOR_SWATCHES,
            includeDefaultSwatch: true,
            customInputId: "jp-KuusiAppearanceNodeFillDefault-input",
            customDefault: "#1976d2",
            onChange: (color) => {
              patch({ nodeFillColor: color });
              onRebuild();
            },
          },
        ];

        if (hasSelection) {
          widgets.push({
            kind: "color",
            sectionLabel: t.nodeFillSelected(),
            value: selectedFill,
            swatches: APPEARANCE_COLOR_SWATCHES,
            includeDefaultSwatch: true,
            customInputId: "jp-KuusiAppearanceNodeFillSelected-input",
            customDefault: "#1976d2",
            onChange: (color) => {
              nodeFill.setSelectedFill(color);
              onRebuild();
            },
          });
          renderPanelWidgets(panel, widgets);
          return;
        }

        renderPanelWidgets(panel, widgets);
        const hint = document.createElement("div");
        hint.className = "jp-KuusiAppearanceDropdown-hint";
        hint.textContent = t.nodeFillSelectHint();
        panel.appendChild(hint);
        return;
      }

      if (id === "border") {
        renderPanelWidgets(panel, [
          {
            kind: "choice",
            sectionLabel: t.nodeBorderStyle(),
            value: settings.nodeBorderStyle,
            options: BORDER_LINE_STYLES.map(({ value, label }) => ({
              value,
              label,
              preview: () => createBorderStylePreview(value),
            })),
            onChange: (value) => {
              patch({ nodeBorderStyle: value as BorderLineStyle });
              onRebuild();
            },
          },
          {
            kind: "choice",
            sectionLabel: t.nodeBorderWidth(),
            value: settings.nodeBorderWidth,
            options: NODE_BORDER_WIDTHS.map((width) => ({
              value: width,
              label: width,
              preview: () => createBorderWidthPreview(width),
            })),
            onChange: (value) => {
              patch({ nodeBorderWidth: value });
              onRebuild();
            },
          },
          {
            kind: "color",
            sectionLabel: t.nodeBorderColor(),
            value: settings.nodeBorderColor,
            swatches: APPEARANCE_COLOR_SWATCHES,
            includeDefaultSwatch: true,
            customInputId: "jp-KuusiAppearanceBorderColor-input",
            customDefault: "#1976d2",
            onChange: (color) => {
              patch({ nodeBorderColor: color });
              onRebuild();
            },
          },
        ]);
        return;
      }

      if (id === "corner") {
        const cornerValue =
          settings.nodeBorderCorner === "rounded"
            ? `rounded:${settings.nodeBorderRadius}`
            : settings.nodeBorderCorner;

        renderPanelWidgets(panel, [
          {
            kind: "choice",
            value: cornerValue,
            options: NODE_BORDER_CORNER_OPTIONS.map((option) => {
              if (option.kind === "sharp") {
                return {
                  value: "sharp",
                  label: option.label,
                  preview: () => createBorderCornerPreview("sharp"),
                };
              }

              if (option.kind === "ellipse") {
                return {
                  value: "ellipse",
                  label: option.label,
                  preview: () => createBorderCornerPreview("ellipse"),
                };
              }

              return {
                value: `rounded:${option.radius}`,
                label: option.label,
                preview: () => createBorderRadiusPreview(option.radius),
              };
            }),
            onChange: (value) => {
              if (value === "sharp" || value === "ellipse") {
                patch({ nodeBorderCorner: value });
              } else if (value.startsWith("rounded:")) {
                patch({
                  nodeBorderCorner: "rounded",
                  nodeBorderRadius: value.slice("rounded:".length),
                });
              }
              onRebuild();
            },
          },
        ]);
        return;
      }

      if (id === "hover") {
        renderPanelWidgets(panel, [
          {
            kind: "choice",
            sectionLabel: t.hoverGlowWidth(),
            value: settings.hoverGlowWidth,
            options: NODE_BORDER_WIDTHS.map((width) => ({
              value: width,
              label: width,
              preview: () => createBorderWidthPreview(width),
            })),
            onChange: (value) => {
              patch({ hoverGlowWidth: value });
              onRebuild();
            },
          },
          {
            kind: "color",
            sectionLabel: t.hoverGlowColor(),
            value: settings.hoverGlowColor,
            swatches: APPEARANCE_COLOR_SWATCHES,
            includeDefaultSwatch: true,
            customInputId: "jp-KuusiAppearanceHoverGlowColor-input",
            customDefault: settings.nodeBorderColor || "#888888",
            onChange: (color) => {
              patch({ hoverGlowColor: color });
              onRebuild();
            },
          },
        ]);
        const hint = document.createElement("div");
        hint.className = "jp-KuusiAppearanceDropdown-hint";
        hint.textContent = t.hoverGlowFollowsBorderHint();
        panel.appendChild(hint);
        return;
      }

      renderPanelWidgets(panel, [
        {
          kind: "choice",
          sectionLabel: t.selectionGlowWidth(),
          value: settings.selectionGlowWidth,
          options: NODE_BORDER_WIDTHS.map((width) => ({
            value: width,
            label: width,
            preview: () => createBorderWidthPreview(width),
          })),
          onChange: (value) => {
            patch({ selectionGlowWidth: value });
            onRebuild();
          },
        },
        {
          kind: "color",
          sectionLabel: t.selectionGlowColor(),
          value: settings.selectionGlowColor,
          swatches: APPEARANCE_COLOR_SWATCHES,
          includeDefaultSwatch: true,
          customInputId: "jp-KuusiAppearanceSelectionGlowColor-input",
          customDefault: "#1976d2",
          onChange: (color) => {
            patch({ selectionGlowColor: color });
            onRebuild();
          },
        },
      ]);
    },
  });
};

const createGroupedDropdown = <Id extends string>(
  root: HTMLElement,
  buttonLabel: string,
  title: string,
  buildMenu: (
    menu: HTMLElement,
    refreshPanel: () => void,
  ) => SecondaryMenuController<Id>,
): {
  wrapper: HTMLElement;
  remount: () => void;
  refreshPanel: () => void;
  isOpen: () => boolean;
} => {
  const wrapper = document.createElement("div");
  wrapper.className = "jp-KuusiFormatDropdown jp-KuusiAppearanceDropdown";

  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "jp-KuusiNotebookMindMap-format-btn jp-KuusiAppearanceDropdown-btn";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.setAttribute("aria-haspopup", "menu");
  button.textContent = buttonLabel;

  const menu = document.createElement("div");
  menu.className =
    "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu-wide jp-KuusiAppearanceDropdown-menu jp-KuusiSecondaryMenu-host";
  menu.setAttribute("role", "menu");

  let controller: SecondaryMenuController<Id> | null = null;

  const refreshPanel = (): void => {
    controller?.refresh();
  };

  const remount = (): void => {
    const wasOpen = menu.classList.contains("is-open");
    menu.replaceChildren();
    controller = buildMenu(menu, refreshPanel);

    if (wasOpen) {
      openKuusiDropdownMenu(menu, root);
    }
  };

  remount();

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeKuusiDropdownMenus(root);

    if (!isOpen) {
      refreshPanel();
      openKuusiDropdownMenu(menu, root);
    }
  });

  wrapper.append(button, menu);
  return {
    wrapper,
    remount,
    refreshPanel,
    isOpen: () => menu.classList.contains("is-open"),
  };
};

export type AppearanceToolbarHandle = {
  node: HTMLElement;
  /** Remount Line/Node shells (e.g. after notebook is ready). */
  refresh: () => void;
  /** Sync selection-dependent Node → Fill UI without remounting shells. */
  syncSelection: () => void;
};

export const createAppearanceToolbar = (
  root: HTMLElement,
  getSettings: () => AppearanceSettings,
  onChange: (settings: AppearanceSettings) => void,
  nodeFill: AppearanceNodeFillApi,
  nodeWidth: NodeWidthMenuApi,
  t: KuusiTranslator,
): AppearanceToolbarHandle => {
  const toolbar = document.createElement("div");
  toolbar.className = "jp-KuusiNotebookMindMap-appearance-toolbar";
  toolbar.setAttribute("role", "group");
  toolbar.setAttribute("aria-label", t.appearance());

  const lineDropdown = createGroupedDropdown(
    root,
    t.line(),
    t.connectorLineAppearance(),
    (menu, refreshPanel) =>
      fillLineAppearanceMenu(root, menu, getSettings, onChange, refreshPanel, t),
  );
  const nodeDropdown = createGroupedDropdown(
    root,
    t.node(),
    t.nodeAppearance(),
    (menu, refreshPanel) =>
      fillNodeAppearanceMenu(
        root,
        menu,
        getSettings,
        onChange,
        nodeFill,
        nodeWidth,
        refreshPanel,
        t,
      ),
  );

  toolbar.replaceChildren(lineDropdown.wrapper, nodeDropdown.wrapper);

  return {
    node: toolbar,
    refresh: () => {
      lineDropdown.remount();
      nodeDropdown.remount();
    },
    syncSelection: () => {
      if (nodeDropdown.isOpen()) {
        nodeDropdown.refreshPanel();
      }
    },
  };
};
