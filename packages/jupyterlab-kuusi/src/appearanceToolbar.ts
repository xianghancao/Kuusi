import {
  APPEARANCE_COLOR_SWATCHES,
  appendColorPickerSection,
} from "./colorPicker";
import type { KuusiTranslator } from "./kuusiI18n";
import {
  appendDropdownSectionRow,
  closeKuusiDropdownMenus,
} from "./formatToolbar";

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
  edgeArrowDirection: EdgeArrowDirection;
  edgeArrowStyle: EdgeArrowStyle;
  edgeWidth: string;
  edgeColor: string;
  nodeBorderStyle: BorderLineStyle;
  nodeBorderWidth: string;
  nodeBorderColor: string;
  nodeBorderCorner: NodeBorderCorner;
  nodeBorderRadius: string;
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  edgeStyle: "solid",
  edgeArrowDirection: "none",
  edgeArrowStyle: "triangle",
  edgeWidth: "3pt",
  edgeColor: "",
  nodeBorderStyle: "solid",
  nodeBorderWidth: "1px",
  nodeBorderColor: "",
  nodeBorderCorner: "rounded",
  nodeBorderRadius: "8px",
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

const NODE_BORDER_CORNERS: Array<{ value: NodeBorderCorner; label: string }> = [
  { value: "sharp", label: "Sharp" },
  { value: "rounded", label: "Rounded" },
  { value: "ellipse", label: "Ellipse" },
];

const NODE_BORDER_RADII = ["4px", "8px", "12px", "16px", "24px", "32px"];

const SVG_NS = "http://www.w3.org/2000/svg";

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
): SVGMarkerElement => {
  const marker = document.createElementNS(SVG_NS, "marker");
  marker.setAttribute("id", id);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", atStart ? "0" : "10");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "3.2");
  marker.setAttribute("markerHeight", "3.2");
  marker.setAttribute("markerUnits", "strokeWidth");
  marker.setAttribute("orient", atStart ? "auto-start-reverse" : "auto");
  appendArrowShape(marker, style);
  return marker;
};

/** Append SVG marker defs for the current arrow settings; returns marker URLs. */
export const appendEdgeArrowDefs = (
  svg: SVGSVGElement,
  settings: Pick<AppearanceSettings, "edgeArrowDirection" | "edgeArrowStyle">,
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
  const defs = document.createElementNS(SVG_NS, "defs");
  const result: { markerStart?: string; markerEnd?: string } = {};

  if (direction === "end" || direction === "both") {
    const id = `${uid}-end`;
    defs.appendChild(createEdgeMarker(id, style, false));
    result.markerEnd = `url(#${id})`;
  }

  if (direction === "start" || direction === "both") {
    const id = `${uid}-start`;
    defs.appendChild(createEdgeMarker(id, style, true));
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

export const applyAppearanceToScene = (
  scene: HTMLElement,
  settings: AppearanceSettings,
): void => {
  scene.dataset.kuusiEdgeStyle = settings.edgeStyle;
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

  setVar("--kuusi-edge-width", settings.edgeWidth);
  setVar("--kuusi-edge-color", settings.edgeColor);
  setVar("--kuusi-node-border-width", settings.nodeBorderWidth);
  setVar("--kuusi-node-border-color", settings.nodeBorderColor);
  setVar("--kuusi-node-border-radius", resolveNodeBorderRadius(settings));
};

const appendOptionItems = (
  root: HTMLElement,
  row: HTMLElement,
  items: Array<{
    label: string;
    isActive?: boolean;
    onSelect: () => void;
    preview?: HTMLElement;
  }>,
): void => {
  items.forEach(({ label, isActive, onSelect, preview }) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className =
      "jp-KuusiFormatDropdown-item jp-KuusiAppearanceOption-item";
    item.setAttribute("role", "menuitem");
    item.classList.toggle("is-active", Boolean(isActive));

    const labelEl = document.createElement("span");
    labelEl.className = "jp-KuusiAppearanceOption-label";
    labelEl.textContent = label;
    item.appendChild(labelEl);

    if (preview) {
      item.appendChild(preview);
    }

    item.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect();
    });
    row.appendChild(item);
  });
};

const createLineStylePreview = (style: EdgeLineStyle): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = `jp-KuusiAppearancePreview jp-KuusiAppearancePreview-line-style is-${style}`;
  preview.setAttribute("aria-hidden", "true");
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

const appendAppearanceColorPicker = (
  menu: HTMLElement,
  sectionLabel: string,
  currentColor: string,
  onSelect: (color: string) => void,
  customInputId: string,
): void => {
  appendColorPickerSection(
    menu,
    sectionLabel,
    currentColor,
    onSelect,
    APPEARANCE_COLOR_SWATCHES,
    {
      includeDefaultSwatch: true,
      customInputId,
      customDefault: "#1976d2",
    },
  );
};

const createGroupedDropdown = (
  root: HTMLElement,
  buttonLabel: string,
  title: string,
  buildMenu: (menu: HTMLElement) => void,
): HTMLElement => {
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
    "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu-wide jp-KuusiAppearanceDropdown-menu";
  menu.setAttribute("role", "menu");
  buildMenu(menu);

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeKuusiDropdownMenus(root);

    if (!isOpen) {
      menu.classList.add("is-open");
    }
  });

  wrapper.append(button, menu);
  return wrapper;
};

export const createAppearanceToolbar = (
  root: HTMLElement,
  getSettings: () => AppearanceSettings,
  onChange: (settings: AppearanceSettings) => void,
  t: KuusiTranslator,
): HTMLElement => {
  const toolbar = document.createElement("div");
  toolbar.className = "jp-KuusiNotebookMindMap-appearance-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", t.appearance());

  const patch = (partial: Partial<AppearanceSettings>) => {
    onChange({ ...getSettings(), ...partial });
  };

  const rebuild = () => {
    const openMenuLabels = new Set(
      Array.from(toolbar.querySelectorAll(".jp-KuusiAppearanceDropdown-menu.is-open"))
        .map((menu) => menu.previousElementSibling)
        .filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement)
        .map((button) => button.getAttribute("aria-label"))
        .filter((label): label is string => Boolean(label)),
    );
    const settings = getSettings();

    toolbar.replaceChildren(
      createGroupedDropdown(root, t.line(), t.connectorLineAppearance(), (menu) => {
        appendOptionItems(
          root,
          appendDropdownSectionRow(menu, "Style"),
          EDGE_LINE_STYLES.map(({ value, label }) => ({
            label,
            isActive: settings.edgeStyle === value,
            preview: createLineStylePreview(value),
            onSelect: () => {
              patch({ edgeStyle: value });
              rebuild();
            },
          })),
        );
        appendOptionItems(
          root,
          appendDropdownSectionRow(menu, "Arrow"),
          EDGE_ARROW_DIRECTIONS.map(({ value, label }) => ({
            label,
            isActive: settings.edgeArrowDirection === value,
            preview: createArrowDirectionPreview(value),
            onSelect: () => {
              patch({ edgeArrowDirection: value });
              rebuild();
            },
          })),
        );
        appendOptionItems(
          root,
          appendDropdownSectionRow(menu, "Arrow style"),
          EDGE_ARROW_STYLES.map(({ value, label }) => ({
            label,
            isActive: settings.edgeArrowStyle === value,
            preview: createArrowStylePreview(value),
            onSelect: () => {
              patch({
                edgeArrowStyle: value,
                edgeArrowDirection:
                  settings.edgeArrowDirection === "none"
                    ? "end"
                    : settings.edgeArrowDirection,
              });
              rebuild();
            },
          })),
        );
        appendOptionItems(
          root,
          appendDropdownSectionRow(menu, "Width"),
          EDGE_WIDTHS.map((width) => ({
            label: width,
            isActive: settings.edgeWidth === width,
            preview: createLineWidthPreview(width),
            onSelect: () => {
              patch({ edgeWidth: width });
              rebuild();
            },
          })),
        );
        appendAppearanceColorPicker(
          menu,
          "Color",
          settings.edgeColor,
          (color) => {
            patch({ edgeColor: color });
            rebuild();
          },
          "jp-KuusiAppearanceEdgeColor-input",
        );
      }),
      createGroupedDropdown(root, "Border", t.nodeBorderAppearance(), (menu) => {
        appendOptionItems(
          root,
          appendDropdownSectionRow(menu, "Style"),
          BORDER_LINE_STYLES.map(({ value, label }) => ({
            label,
            isActive: settings.nodeBorderStyle === value,
            preview: createBorderStylePreview(value),
            onSelect: () => {
              patch({ nodeBorderStyle: value });
              rebuild();
            },
          })),
        );
        appendOptionItems(
          root,
          appendDropdownSectionRow(menu, "Width"),
          NODE_BORDER_WIDTHS.map((width) => ({
            label: width,
            isActive: settings.nodeBorderWidth === width,
            preview: createBorderWidthPreview(width),
            onSelect: () => {
              patch({ nodeBorderWidth: width });
              rebuild();
            },
          })),
        );
        appendOptionItems(
          root,
          appendDropdownSectionRow(menu, "Corner"),
          NODE_BORDER_CORNERS.map(({ value, label }) => ({
            label,
            isActive: settings.nodeBorderCorner === value,
            preview: createBorderCornerPreview(value),
            onSelect: () => {
              patch({ nodeBorderCorner: value });
              rebuild();
            },
          })),
        );
        appendOptionItems(
          root,
          appendDropdownSectionRow(menu, "Roundness"),
          NODE_BORDER_RADII.map((radius) => ({
            label: radius,
            isActive:
              settings.nodeBorderCorner === "rounded" &&
              settings.nodeBorderRadius === radius,
            preview: createBorderRadiusPreview(radius),
            onSelect: () => {
              patch({
                nodeBorderCorner: "rounded",
                nodeBorderRadius: radius,
              });
              rebuild();
            },
          })),
        );
        appendAppearanceColorPicker(
          menu,
          "Color",
          settings.nodeBorderColor,
          (color) => {
            patch({ nodeBorderColor: color });
            rebuild();
          },
          "jp-KuusiAppearanceBorderColor-input",
        );
      }),
    );

    toolbar.querySelectorAll(".jp-KuusiAppearanceDropdown").forEach((wrapper) => {
      const button = wrapper.querySelector(".jp-KuusiAppearanceDropdown-btn");
      const menu = wrapper.querySelector(".jp-KuusiAppearanceDropdown-menu");
      const label = button?.getAttribute("aria-label");

      if (menu && label && openMenuLabels.has(label)) {
        menu.classList.add("is-open");
      }
    });
  };

  rebuild();

  document.addEventListener("click", () => {
    closeKuusiDropdownMenus(root);
  });

  return toolbar;
};
