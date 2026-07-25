import { appendDropdownSection, appendDropdownSectionRow } from "./formatToolbar";

export type ColorSwatch = {
  label: string;
  color: string;
};

export const APPEARANCE_COLOR_SWATCHES: ColorSwatch[] = [
  { label: "Default", color: "" },
  { label: "Red", color: "#d32f2f" },
  { label: "Orange", color: "#f57c00" },
  { label: "Amber", color: "#ffb300" },
  { label: "Green", color: "#388e3c" },
  { label: "Teal", color: "#00897b" },
  { label: "Blue", color: "#1976d2" },
  { label: "Tech Blue", color: "#00bcd4" },
  { label: "Purple", color: "#7b1fa2" },
  { label: "Pink", color: "#c2185b" },
  { label: "White", color: "#ffffff" },
  { label: "Gray", color: "#616161" },
  { label: "Black", color: "#212121" },
];

export const BACKGROUND_COLOR_SWATCHES: ColorSwatch[] = [
  { label: "Ice Blue", color: "#e3f2fd" },
  { label: "Tech Blue", color: "#d6ecff" },
  { label: "Mint", color: "#e0f2f1" },
  { label: "Lavender", color: "#ede7f6" },
  { label: "Sand", color: "#f5f0e6" },
  { label: "Rose", color: "#fce4ec" },
  { label: "Slate", color: "#eceff1" },
  { label: "Charcoal", color: "#37474f" },
  { label: "Midnight", color: "#1a237e" },
  { label: "Forest", color: "#1b5e20" },
];

const isPresetSwatchColor = (
  color: string,
  swatches: ColorSwatch[],
): boolean => swatches.some((swatch) => swatch.color === color);

export const appendColorPickerSection = (
  menu: HTMLElement,
  sectionLabel: string,
  currentColor: string,
  onSelect: (color: string) => void,
  swatches: ColorSwatch[],
  options?: {
    customInputId?: string;
    customDefault?: string;
    includeDefaultSwatch?: boolean;
  },
): void => {
  const includeDefault = options?.includeDefaultSwatch ?? false;
  const pickerSwatches = includeDefault
    ? swatches
    : swatches.filter((swatch) => swatch.color !== "");

  appendDropdownSection(menu, sectionLabel);
  const row = appendDropdownSectionRow(
    menu,
    "",
    "jp-KuusiFormatColorSwatches",
  );

  pickerSwatches.forEach(({ label, color }) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "jp-KuusiFormatColorSwatch";
    swatch.title = label;
    swatch.setAttribute("aria-label", label);
    swatch.classList.toggle("is-active", color === currentColor);

    if (color) {
      swatch.style.backgroundColor = color;
    } else {
      swatch.classList.add("jp-KuusiFormatColorSwatch-default");
    }

    swatch.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect(color);
    });
    row.appendChild(swatch);
  });

  const customRow = document.createElement("div");
  customRow.className = "jp-KuusiFormatColorCustom";

  const customInputId =
    options?.customInputId ??
    `jp-KuusiColorCustom-${Math.random().toString(36).slice(2, 9)}`;

  const customLabel = document.createElement("label");
  customLabel.className = "jp-KuusiFormatColorCustom-label";
  customLabel.textContent = "Custom";
  customLabel.setAttribute("for", customInputId);

  const customInput = document.createElement("input");
  customInput.type = "color";
  customInput.id = customInputId;
  customInput.className = "jp-KuusiFormatColorCustom-input";
  customInput.value = currentColor || options?.customDefault || "#1976d2";
  customInput.title = "Choose a custom color";
  customInput.classList.toggle(
    "is-active",
    Boolean(currentColor) &&
      !isPresetSwatchColor(currentColor, pickerSwatches),
  );

  customInput.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  customInput.addEventListener("input", (event) => {
    event.stopPropagation();
    onSelect(customInput.value);
  });

  customRow.append(customLabel, customInput);
  menu.appendChild(customRow);
};
