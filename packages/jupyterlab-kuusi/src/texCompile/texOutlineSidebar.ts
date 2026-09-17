import {
  findActiveOutlineLine,
  parseTexOutline,
  type TexOutlineEntry,
} from "./parseTexOutline";

export type TexOutlineSidebarOptions = {
  onSelectLine: (line: number) => void;
};

export class TexOutlineSidebar {
  readonly node: HTMLDivElement;

  private _list: HTMLDivElement;
  private _empty: HTMLDivElement;
  private _entries: TexOutlineEntry[] = [];
  private _activeLine = -1;
  private _visible = true;
  private _onSelectLine: (line: number) => void;

  constructor(options: TexOutlineSidebarOptions) {
    this._onSelectLine = options.onSelectLine;
    this.node = document.createElement("div");
    this.node.className = "jp-KuusiLivePdf-nav jp-KuusiTexOutline-nav";

    const modeSwitch = document.createElement("div");
    modeSwitch.className =
      "jp-KuusiLivePdf-navMode jp-KuusiOutlineNav-modeSingle";
    modeSwitch.setAttribute("role", "tablist");
    modeSwitch.setAttribute("aria-label", "Navigation mode");

    const contentsTab = document.createElement("button");
    contentsTab.type = "button";
    contentsTab.className = "jp-KuusiLivePdf-navModeButton is-active";
    contentsTab.textContent = "Contents";
    contentsTab.setAttribute("role", "tab");
    contentsTab.setAttribute("aria-selected", "true");
    contentsTab.title = "LaTeX document outline";
    contentsTab.tabIndex = -1;
    modeSwitch.appendChild(contentsTab);

    this._list = document.createElement("div");
    this._list.className = "jp-KuusiLivePdf-navOutline";
    this._list.setAttribute("role", "tabpanel");
    this._list.setAttribute("aria-label", "Table of contents");

    this._empty = document.createElement("div");
    this._empty.className = "jp-KuusiLivePdf-navOutlineEmpty";
    this._empty.textContent = "No table of contents in this document.";

    const panels = document.createElement("div");
    panels.className = "jp-KuusiLivePdf-navPanels";
    panels.append(this._list, this._empty);

    this.node.append(modeSwitch, panels);
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this.node.classList.toggle("is-hidden", !visible);
    this.node.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  isVisible(): boolean {
    return this._visible;
  }

  toggleVisible(): boolean {
    this.setVisible(!this._visible);
    return this._visible;
  }

  updateSource(source: string): void {
    this._entries = parseTexOutline(source);
    this._render();
  }

  setCursorLine(line: number): void {
    const activeLine = findActiveOutlineLine(this._entries, line);
    this._setActiveLine(activeLine);
  }

  private _setActiveLine(line: number): void {
    this._activeLine = line;

    for (const button of Array.from(
      this.node.querySelectorAll<HTMLButtonElement>(
        ".jp-KuusiLivePdf-navOutlineItem",
      ),
    )) {
      const entryLine = Number.parseInt(button.dataset.line ?? "0", 10);
      button.classList.toggle("is-active", entryLine === line);
    }
  }

  private _render(): void {
    this._list.replaceChildren();

    if (this._entries.length === 0) {
      this._empty.hidden = false;
      this._list.hidden = true;
      return;
    }

    this._empty.hidden = true;
    this._list.hidden = false;
    this._appendEntries(this._entries, this._list, 0);
    this._setActiveLine(this._activeLine);
  }

  private _appendEntries(
    entries: TexOutlineEntry[],
    host: HTMLElement,
    depth: number,
  ): void {
    for (const entry of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jp-KuusiLivePdf-navOutlineItem";
      button.dataset.line = String(entry.line);
      button.style.paddingLeft = `${10 + depth * 12}px`;
      button.title = `Line ${entry.line}`;

      const label = document.createElement("span");
      label.className = "jp-KuusiLivePdf-navOutlineLabel";
      label.textContent = entry.title;
      button.appendChild(label);

      const lineTag = document.createElement("span");
      lineTag.className =
        "jp-KuusiLivePdf-navOutlinePage jp-KuusiTexOutline-lineTag";
      lineTag.textContent = String(entry.line);
      button.appendChild(lineTag);

      button.addEventListener("click", () => {
        this._setActiveLine(entry.line);
        this._onSelectLine(entry.line);
      });

      host.appendChild(button);

      if (entry.items.length > 0) {
        this._appendEntries(entry.items, host, depth + 1);
      }
    }
  }
}
