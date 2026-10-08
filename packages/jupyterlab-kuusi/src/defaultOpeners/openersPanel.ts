import { getKuusiBundle } from "../kuusiI18n";
import type { DefaultOpenersManager } from "./defaultOpenersManager";
import type { DefaultOpenersState } from "./defaultOpenersState";
import { effectiveDefaultOpenersState } from "./openersStateForRelease";
import {
  getEnabledRenderViews,
  getRenderViewOrder,
  normalizeEnabledRenderViews,
} from "../renderViewOrder";

const viewLabels = (): Record<string, string> => {
  const trans = getKuusiBundle();

  return {
    article: trans.__("Article"),
    book: trans.__("Book"),
    mindmap: trans.__("Mind Map"),
    slides: trans.__("Slides"),
  };
};

const createViewOrderSection = (manager: DefaultOpenersManager): HTMLElement => {
  const section = document.createElement("div");
  section.className = "jp-KuusiViewOrder";
  const trans = getKuusiBundle();
  const labels = viewLabels();

  const title = document.createElement("p");
  title.className = "jp-KuusiDefaultOpeners-intro";
  title.textContent = trans.__(
    "Choose which views appear in the view menu and their order, left to right. The first enabled view opens by default.",
  );
  section.appendChild(title);

  const list = document.createElement("div");
  list.className = "jp-KuusiViewOrder-list";
  section.appendChild(list);

  let order = getRenderViewOrder() as string[];
  let enabled = getEnabledRenderViews() as string[];

  const render = (): void => {
    list.textContent = "";
    order.forEach((id, index) => {
      const row = document.createElement("div");
      row.className = "jp-KuusiViewOrder-item";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "jp-KuusiViewOrder-check";
      check.checked = enabled.includes(id);
      check.setAttribute("aria-label", `${trans.__("Show")} ${labels[id] ?? id}`);
      check.addEventListener("change", () => {
        enabled = check.checked
          ? [...enabled, id]
          : enabled.filter((entry) => entry !== id);
        // Mirror the manager's rule that at least one view stays enabled.
        enabled = normalizeEnabledRenderViews(enabled);
        void manager.setEnabledViews(enabled);
        render();
      });

      const label = document.createElement("span");
      label.className = "jp-KuusiViewOrder-label";
      label.textContent = `${index + 1}. ${labels[id] ?? id}`;

      const makeButton = (text: string, aria: string, delta: number) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "jp-KuusiViewOrder-btn";
        btn.textContent = text;
        btn.setAttribute("aria-label", `${aria} ${labels[id] ?? id}`);
        btn.disabled = index + delta < 0 || index + delta >= order.length;
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          const next = [...order];
          const [moved] = next.splice(index, 1);
          next.splice(index + delta, 0, moved);
          order = next;
          render();
          void manager.setViewOrder(order);
        });
        return btn;
      };

      row.append(
        check,
        label,
        makeButton("←", trans.__("Move left"), -1),
        makeButton("→", trans.__("Move right"), 1),
      );
      list.appendChild(row);
    });
  };

  render();
  return section;
};

type OpenerRow = {
  key: keyof DefaultOpenersState;
  label: string;
  description: string;
};

const getOpenerRows = (): OpenerRow[] => {
  const trans = getKuusiBundle();

  return [
    {
      key: "notebook",
      label: trans.__("Notebooks (.ipynb)"),
      description: trans.__("Kuusi View: Article / Book / Mind Map / Slides"),
    },
    {
      key: "markdown",
      label: trans.__("Markdown (.md)"),
      description: trans.__("Kuusi View: Article / Book / Slides / Mind Map"),
    },
  ];
};

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
  intro.textContent = getKuusiBundle().__(
    "Choose which file types should use Kuusi when opened from the file browser.",
  );
  wrap.appendChild(intro);

  const list = document.createElement("div");
  list.className = "jp-KuusiDefaultOpeners-list";
  wrap.appendChild(list);

  const visibleRows = getOpenerRows();

  let draft = effectiveDefaultOpenersState(manager.state);

  for (const row of visibleRows) {
    list.appendChild(
      createToggleRow(row, draft[row.key], (enabled) => {
        draft = { ...draft, [row.key]: enabled };
        void manager.setState(draft);
      }),
    );
  }

  wrap.appendChild(createViewOrderSection(manager));

  return wrap;
};
