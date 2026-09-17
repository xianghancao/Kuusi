import { isKuusiFullRelease } from "../releaseTier";
import type { DefaultOpenersManager } from "./defaultOpenersManager";
import type { DefaultOpenersState } from "./defaultOpenersState";
import { effectiveDefaultOpenersState } from "./openersStateForRelease";

type OpenerRow = {
  key: keyof DefaultOpenersState;
  label: string;
  description: string;
};

const OPENER_ROWS: OpenerRow[] = [
  {
    key: "notebook",
    label: "Notebooks (.ipynb)",
    description: "Open with Kuusi Mind Map",
  },
  {
    key: "markdown",
    label: "Markdown (.md)",
    description: "Open with Kuusi Markdown Preview",
  },
  {
    key: "tex",
    label: "LaTeX (.tex)",
    description: "Enable Kuusi TeX tools in the editor",
  },
  {
    key: "pdf",
    label: "PDF (.pdf)",
    description: "Open with Kuusi Live PDF",
  },
  {
    key: "image",
    label: "Images (PNG, JPEG, …)",
    description: "Open with Kuusi Image",
  },
  {
    key: "audio",
    label: "Audio (WebM, OGG, …)",
    description: "Open with Kuusi Voice",
  },
];

const createToggleRow = (
  row: OpenerRow,
  value: boolean,
  onChange: (enabled: boolean) => void,
): HTMLElement => {
  const section = document.createElement("div");
  section.className = "jp-KuusiDefaultOpeners-row jp-KuusiPanelWidget-toggle";

  const textWrap = document.createElement("div");
  textWrap.className = "jp-KuusiDefaultOpeners-rowText";

  const labelEl = document.createElement("span");
  labelEl.className = "jp-KuusiPanelWidget-toggleLabel";
  labelEl.textContent = row.label;

  const descriptionEl = document.createElement("span");
  descriptionEl.className = "jp-KuusiDefaultOpeners-rowDescription";
  descriptionEl.textContent = row.description;

  textWrap.append(labelEl, descriptionEl);

  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.className = "jp-KuusiPanelWidget-switch";
  switchBtn.setAttribute("role", "switch");
  switchBtn.setAttribute("aria-checked", value ? "true" : "false");
  switchBtn.setAttribute("aria-label", row.label);
  switchBtn.title = row.description;
  switchBtn.classList.toggle("is-on", value);

  const thumb = document.createElement("span");
  thumb.className = "jp-KuusiPanelWidget-switchThumb";
  thumb.setAttribute("aria-hidden", "true");
  switchBtn.appendChild(thumb);

  const sync = (enabled: boolean): void => {
    switchBtn.classList.toggle("is-on", enabled);
    switchBtn.setAttribute("aria-checked", enabled ? "true" : "false");
  };

  switchBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = !switchBtn.classList.contains("is-on");
    sync(next);
    onChange(next);
  });

  section.append(textWrap, switchBtn);
  return section;
};

export const createDefaultOpenersPanel = (
  manager: DefaultOpenersManager,
): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = "jp-KuusiDefaultOpeners";

  const intro = document.createElement("p");
  intro.className = "jp-KuusiDefaultOpeners-intro";
  intro.textContent =
    "Choose which file types should use Kuusi when opened from the file browser.";
  wrap.appendChild(intro);

  const list = document.createElement("div");
  list.className = "jp-KuusiDefaultOpeners-list";
  wrap.appendChild(list);

  const visibleRows = isKuusiFullRelease()
    ? OPENER_ROWS
    : OPENER_ROWS.filter((row) => row.key === "notebook");

  let draft = effectiveDefaultOpenersState(manager.state);

  for (const row of visibleRows) {
    list.appendChild(
      createToggleRow(row, draft[row.key], (enabled) => {
        draft = { ...draft, [row.key]: enabled };
        void manager.setState(draft);
      }),
    );
  }

  return wrap;
};
