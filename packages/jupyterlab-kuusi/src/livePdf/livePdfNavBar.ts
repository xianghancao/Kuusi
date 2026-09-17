import {
  isLivePdfNavMode,
  LIVE_PDF_NAV_MODE_OPTIONS,
  type LivePdfNavMode,
} from "./livePdfNavMode";
import type { PdfOutlineEntry } from "./livePdfOutline";

export type LivePdfNavBarHandlers = {
  onPageSelect: (page: number) => void;
  onSearchChange: (query: string) => void;
  onModeChange: (mode: LivePdfNavMode) => void;
};

export class LivePdfNavBar {
  readonly node: HTMLDivElement;

  private _handlers: LivePdfNavBarHandlers;
  private _mode: LivePdfNavMode = "thumbnails";
  private _modeButtons = new Map<LivePdfNavMode, HTMLButtonElement>();
  private _thumbList: HTMLDivElement;
  private _outlineList: HTMLDivElement;
  private _outlineEmpty: HTMLDivElement;
  private _searchInput: HTMLInputElement;
  private _thumbButtons = new Map<number, HTMLButtonElement>();
  private _outlineButtons: HTMLButtonElement[] = [];
  private _activePage = 1;

  constructor(handlers: LivePdfNavBarHandlers) {
    this._handlers = handlers;
    this.node = document.createElement("div");
    this.node.className = "jp-KuusiLivePdf-nav";

    const searchWrap = document.createElement("div");
    searchWrap.className = "jp-KuusiLivePdf-navSearch";

    this._searchInput = document.createElement("input");
    this._searchInput.type = "search";
    this._searchInput.className = "jp-KuusiLivePdf-navSearchInput";
    this._searchInput.placeholder = "Search in PDF…";
    this._searchInput.setAttribute("aria-label", "Search in PDF");
    this._searchInput.title = "Highlight matching text in the PDF";

    this._searchInput.addEventListener("input", () => {
      handlers.onSearchChange(this._searchInput.value);
    });
    this._searchInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });

    searchWrap.appendChild(this._searchInput);

    const modeSwitch = document.createElement("div");
    modeSwitch.className = "jp-KuusiLivePdf-navMode";
    modeSwitch.setAttribute("role", "tablist");
    modeSwitch.setAttribute("aria-label", "Navigation mode");

    for (const option of LIVE_PDF_NAV_MODE_OPTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jp-KuusiLivePdf-navModeButton";
      button.textContent = option.label;
      button.dataset.mode = option.value;
      button.setAttribute("role", "tab");
      button.title =
        option.value === "thumbnails"
          ? "Show page thumbnails"
          : "Show PDF table of contents";

      button.addEventListener("click", () => {
        this.setMode(option.value);
        handlers.onModeChange(option.value);
      });

      this._modeButtons.set(option.value, button);
      modeSwitch.appendChild(button);
    }

    this._thumbList = document.createElement("div");
    this._thumbList.className = "jp-KuusiLivePdf-navThumbs";
    this._thumbList.setAttribute("role", "tabpanel");
    this._thumbList.setAttribute("aria-label", "Page thumbnails");

    this._outlineList = document.createElement("div");
    this._outlineList.className = "jp-KuusiLivePdf-navOutline";
    this._outlineList.setAttribute("role", "tabpanel");
    this._outlineList.setAttribute("aria-label", "Table of contents");
    this._outlineList.hidden = true;

    this._outlineEmpty = document.createElement("div");
    this._outlineEmpty.className = "jp-KuusiLivePdf-navOutlineEmpty";
    this._outlineEmpty.textContent = "No table of contents in this PDF.";
    this._outlineEmpty.hidden = true;

    const panels = document.createElement("div");
    panels.className = "jp-KuusiLivePdf-navPanels";
    panels.append(this._thumbList, this._outlineList, this._outlineEmpty);

    this.node.append(searchWrap, modeSwitch, panels);
    this._syncModeUi();
  }

  get searchQuery(): string {
    return this._searchInput.value;
  }

  get mode(): LivePdfNavMode {
    return this._mode;
  }

  setMode(mode: LivePdfNavMode): void {
    if (!isLivePdfNavMode(mode)) {
      return;
    }

    this._mode = mode;
    this._syncModeUi();
  }

  setVisible(visible: boolean): void {
    this.node.classList.toggle("is-hidden", !visible);
    this.node.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  isVisible(): boolean {
    return !this.node.classList.contains("is-hidden");
  }

  setPageCount(pageCount: number): void {
    this._thumbList.replaceChildren();

    if (pageCount <= 0) {
      this._thumbButtons.clear();
      return;
    }

    const nextButtons = new Map<number, HTMLButtonElement>();

    for (let page = 1; page <= pageCount; page += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jp-KuusiLivePdf-navThumb";
      button.dataset.pageNumber = String(page);
      button.setAttribute("role", "tab");
      button.title = `Page ${page}`;

      const canvasHost = document.createElement("div");
      canvasHost.className = "jp-KuusiLivePdf-navThumbCanvas";
      button.appendChild(canvasHost);

      const label = document.createElement("span");
      label.className = "jp-KuusiLivePdf-navThumbLabel";
      label.textContent = String(page);
      button.appendChild(label);

      button.addEventListener("click", () => {
        this.setActivePage(page);
        this._handlers.onPageSelect(page);
      });

      this._thumbList.appendChild(button);
      nextButtons.set(page, button);
    }

    this._thumbButtons = nextButtons;
    this.setActivePage(Math.min(this._activePage, pageCount));
  }

  setOutline(entries: PdfOutlineEntry[]): void {
    this._outlineList.replaceChildren();
    this._outlineButtons = [];

    if (entries.length === 0) {
      this._outlineEmpty.hidden = this._mode !== "outline";
      return;
    }

    this._outlineEmpty.hidden = true;
    this._appendOutlineEntries(entries, this._outlineList, 0);
  }

  setActivePage(page: number): void {
    this._activePage = page;

    for (const [pageNumber, button] of this._thumbButtons) {
      const active = pageNumber === page;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }

    for (const button of this._outlineButtons) {
      const entryPage = Number.parseInt(button.dataset.pageNumber ?? "0", 10);
      button.classList.toggle("is-active", entryPage === page);
    }

    const activeButton = this._thumbButtons.get(page);

    if (activeButton && this._mode === "thumbnails") {
      activeButton.scrollIntoView({ block: "nearest" });
    }
  }

  setThumbnail(page: number, canvas: HTMLCanvasElement): void {
    const button = this._thumbButtons.get(page);

    if (!button) {
      return;
    }

    const host = button.querySelector(".jp-KuusiLivePdf-navThumbCanvas");

    if (!(host instanceof HTMLElement)) {
      return;
    }

    host.replaceChildren(canvas);
  }

  private _syncModeUi(): void {
    for (const [mode, button] of this._modeButtons) {
      const active = mode === this._mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }

    this._thumbList.hidden = this._mode !== "thumbnails";
    this._outlineList.hidden = this._mode !== "outline";
    this._outlineEmpty.hidden =
      this._mode !== "outline" || this._outlineList.childElementCount > 0;
  }

  private _appendOutlineEntries(
    entries: PdfOutlineEntry[],
    host: HTMLElement,
    depth: number,
  ): void {
    for (const entry of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jp-KuusiLivePdf-navOutlineItem";
      button.dataset.pageNumber = String(entry.page);
      button.style.paddingLeft = `${10 + depth * 12}px`;
      button.title = `Page ${entry.page}`;

      const label = document.createElement("span");
      label.className = "jp-KuusiLivePdf-navOutlineLabel";
      label.textContent = entry.title;
      button.appendChild(label);

      const pageTag = document.createElement("span");
      pageTag.className = "jp-KuusiLivePdf-navOutlinePage";
      pageTag.textContent = String(entry.page);
      button.appendChild(pageTag);

      button.addEventListener("click", () => {
        this.setActivePage(entry.page);
        this._handlers.onPageSelect(entry.page);
      });

      host.appendChild(button);
      this._outlineButtons.push(button);

      if (entry.items.length > 0) {
        this._appendOutlineEntries(entry.items, host, depth + 1);
      }
    }
  }
}
