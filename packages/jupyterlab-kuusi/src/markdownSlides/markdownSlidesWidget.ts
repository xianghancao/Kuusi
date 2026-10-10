import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
} from "@jupyterlab/docregistry";
import {
  MimeModel,
  removeMath,
  replaceMath,
  renderHTML,
  type IRenderMime,
  type IRenderMimeRegistry,
} from "@jupyterlab/rendermime";
import type { Contents } from "@jupyterlab/services";
import type { Message } from "@lumino/messaging";
import { Signal, type ISignal } from "@lumino/signaling";
import { Widget } from "@lumino/widgets";

import { FACTORY_KUUSI_MARKDOWN_SLIDES } from "../defaultOpeners/constants";
import { createNotebookMarkdownContext } from "../notebookMarkdownContext";
import type { INotebookModel } from "@jupyterlab/notebook";
import { slidesIcon } from "../kuusiIcon";
import { createKuusiTranslator } from "../kuusiI18n";
import { applyKuusiTabIcon } from "../kuusiTabIcon";
import {
  type DocumentContextResolver,
  refreshMarkdownImageSources,
  wrapDocumentUrlResolver,
} from "../markdownResourceUrls";
import { ensureKuusiSlidesChrome } from "./slidesCapsule";
import type { SlidesDeckMeta } from "./slidesDeck";
import { buildSlidesDeckModel } from "./slidesModel";
import {
  applySlidesAppearance,
  slidesSettingsNeedOverflowReflow,
  slidesSettingsNeedSourceRebuild,
  type SlidesSettings,
  type SlidesSettingsManager,
} from "./slidesSettings";
import {
  composeTitlePageHtml,
  expandPresentationContainers,
  type SlidesSlideUnit,
} from "./slidesSemantics";
import { paginateSlideByFit } from "./slidesOverflow";
import { resolveSlideHeaderText } from "./slidesHeader";
import {
  formatPageNumberLabel,
  resolvePageNumberDisplay,
} from "../pageNumberStart";
import {
  slideIndexForSourceLine,
  sourceLineForSlideIndex,
} from "./splitMarkdownSlides";

type TextModel = DocumentRegistry.ICodeModel;

/**
 * True when the slide is only the YAML title page (H1 + optional author/date),
 * with no real body that must be preserved.
 */
const isMetaOnlyTitleSlide = (
  source: string,
  meta: SlidesDeckMeta,
): boolean => {
  if (!meta.title) {
    return false;
  }

  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("<!--"));

  if (lines.length === 0) {
    return false;
  }

  if (lines[0] !== `# ${meta.title}`) {
    return false;
  }

  for (const line of lines.slice(1)) {
    if (meta.author && (line === `**${meta.author}**` || line === meta.author)) {
      continue;
    }
    if (meta.date && line === meta.date) {
      continue;
    }
    return false;
  }

  return true;
};

export class MarkdownSlidesViewer extends Widget {
  private readonly _deck: HTMLElement;

  private readonly _stage: HTMLElement;

  private readonly _slideEl: HTMLElement;

  private readonly _stageHeader: HTMLElement;

  private readonly _stageHeaderTitle: HTMLElement;

  private readonly _footer: HTMLElement;

  private readonly _footerTitle: HTMLElement;

  private readonly _footerPage: HTMLElement;

  private readonly _progress: HTMLElement;

  private readonly _counter: HTMLElement;

  private readonly _prevBtn: HTMLButtonElement;

  private readonly _nextBtn: HTMLButtonElement;

  private readonly _nav: HTMLElement;

  private readonly _renderer: IRenderMime.IRenderer;

  private readonly _rendermime: IRenderMimeRegistry;

  private readonly _resolver: DocumentContextResolver;

  private _slides: SlidesSlideUnit[] = [{ source: "", layout: "default" }];

  /** Logical slides before overflow packing (# / ## / ### outline). */
  private _logicalSlides: SlidesSlideUnit[] = [{ source: "", layout: "default" }];

  private _meta: SlidesDeckMeta = {};

  private _index = 0;

  /** Logical slide index shown on each page (overflow splits share one). */
  private _pageLogical: number[] = [0];

  /** Logical slide to land on once overflow pagination finishes. */
  private _pendingLogical: number | null = null;

  private _source = "";

  private _injectedTitlePage = false;

  private readonly _userNavigated = new Signal<this, void>(this);

  private _renderToken = 0;

  private _overflowToken = 0;

  private _hosts: HTMLElement[] = [];

  private _measureHost: HTMLElement | null = null;

  private _resizeObserver: ResizeObserver | null = null;

  private _resizeTimer = 0;

  /** Last seen chrome heights while visible (measure title vs content slides). */
  private _lastHeaderH = 40;

  private _lastFooterH = 36;

  private _lastProgressH = 4;

  constructor(
    _context: DocumentRegistry.IContext<TextModel>,
    rendermime: IRenderMimeRegistry,
    contents: Contents.IManager,
    private _settings: SlidesSettingsManager,
  ) {
    super();
    this.addClass("jp-KuusiMarkdownSlidesViewer");
    this.node.tabIndex = 0;

    this._resolver = wrapDocumentUrlResolver(
      _context.urlResolver as DocumentContextResolver,
      contents,
    );
    this._rendermime = rendermime.clone({ resolver: this._resolver });
    this._renderer = this._rendermime.createRenderer("text/html");

    const t = createKuusiTranslator();

    this._deck = document.createElement("div");
    this._deck.className = "jp-KuusiMarkdownSlides-deck";

    this._stage = document.createElement("div");
    this._stage.className = "jp-KuusiMarkdownSlides-stage";
    this._stage.setAttribute("role", "region");
    this._stage.setAttribute("aria-label", t.slidesStage());

    this._slideEl = document.createElement("div");
    this._slideEl.className =
      "jp-KuusiMarkdownSlides-slide jp-RenderedHTMLCommon jp-RenderedMarkdown";
    this._stage.appendChild(this._slideEl);

    this._stageHeader = document.createElement("div");
    this._stageHeader.className = "jp-KuusiSlides-stageHeader";
    this._stageHeader.hidden = true;
    this._stageHeaderTitle = document.createElement("span");
    this._stageHeaderTitle.className = "jp-KuusiSlides-stageHeaderTitle";
    this._stageHeader.appendChild(this._stageHeaderTitle);
    this._stage.appendChild(this._stageHeader);

    this._footer = document.createElement("div");
    this._footer.className = "jp-KuusiSlides-footer";
    this._footer.hidden = true;
    this._footerTitle = document.createElement("span");
    this._footerTitle.className = "jp-KuusiSlides-footerTitle";
    this._footerPage = document.createElement("span");
    this._footerPage.className = "jp-KuusiSlides-footerPage";
    this._footer.append(this._footerTitle, this._footerPage);
    this._stage.appendChild(this._footer);

    this._progress = document.createElement("div");
    this._progress.className = "jp-KuusiSlides-progress";
    this._progress.setAttribute("aria-hidden", "true");
    this._progress.hidden = true;
    this._stage.appendChild(this._progress);

    this._nav = document.createElement("div");
    this._nav.className = "jp-KuusiMarkdownSlides-nav";

    this._prevBtn = document.createElement("button");
    this._prevBtn.type = "button";
    this._prevBtn.className = "jp-KuusiMarkdownSlides-navBtn";
    this._prevBtn.textContent = "‹";
    this._prevBtn.title = t.slidesPrevious();
    this._prevBtn.setAttribute("aria-label", t.slidesPrevious());
    this._prevBtn.addEventListener("click", () =>
      this._navigate(this._index - 1),
    );

    this._counter = document.createElement("span");
    this._counter.className = "jp-KuusiMarkdownSlides-counter";

    this._nextBtn = document.createElement("button");
    this._nextBtn.type = "button";
    this._nextBtn.className = "jp-KuusiMarkdownSlides-navBtn";
    this._nextBtn.textContent = "›";
    this._nextBtn.title = t.slidesNext();
    this._nextBtn.setAttribute("aria-label", t.slidesNext());
    this._nextBtn.addEventListener("click", () =>
      this._navigate(this._index + 1),
    );

    this._nav.append(this._prevBtn, this._counter, this._nextBtn);
    // Nav sits outside the zoom target so page controls stay chrome-sized.
    this._deck.appendChild(this._stage);
    this.node.append(this._deck, this._nav);

    this.node.addEventListener("keydown", this._onKeyDown);
    this.node.addEventListener("pointerdown", this._onPointerDown);
    this._stage.addEventListener("click", () => {
      if (window.getSelection()?.isCollapsed !== false) {
        this._userNavigated.emit();
      }
    });

    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => {
        window.clearTimeout(this._resizeTimer);
        this._resizeTimer = window.setTimeout(() => {
          void this._reflowOverflow().then(() => {
            void this._renderCurrent();
          });
        }, 120);
      });
      this._resizeObserver.observe(this._stage);
    }
  }

  get slideCount(): number {
    return this._slides.length;
  }

  get currentIndex(): number {
    return this._index;
  }

  /** Fires when the user changes or clicks the slide (not on programmatic moves). */
  get userNavigated(): ISignal<this, void> {
    return this._userNavigated;
  }

  /** Index of the outline slide (before overflow splitting) on screen. */
  get currentLogicalIndex(): number {
    return this._pageLogical[this._index] ?? 0;
  }

  /** Outline slide that contains a 0-based line of the current source. */
  logicalIndexForSourceLine(line: number): number {
    const base = slideIndexForSourceLine(
      this._source,
      line,
      this._settings.settings.splitMode,
    );
    const logical = base + (this._injectedTitlePage ? 1 : 0);
    return Math.max(0, Math.min(logical, this._logicalSlides.length - 1));
  }

  /** 0-based source line where the slide on screen starts. */
  sourceLineForCurrentSlide(): number {
    const splitIndex =
      this.currentLogicalIndex - (this._injectedTitlePage ? 1 : 0);

    return splitIndex < 0
      ? 0
      : sourceLineForSlideIndex(
          this._source,
          splitIndex,
          this._settings.settings.splitMode,
        );
  }

  /**
   * Show the slide containing `line`. Re-splits only when the source changed,
   * so moving the editor cursor does not repaginate the deck.
   */
  showSourceLine(source: string, line: number): void {
    if (source !== this._source) {
      this.refreshFromSource(source, line);
      return;
    }

    const logical = this.logicalIndexForSourceLine(line);

    if (this._pendingLogical !== null) {
      this._pendingLogical = logical;
      // Still jump if pages for this outline slide already exist, so editor
      // sync is not frozen while a reflow is in flight.
      const page = this._pageLogical.indexOf(logical);
      if (page >= 0) {
        this._index = page;
        void this._renderCurrent();
      }
      return;
    }

    if (this.currentLogicalIndex === logical) {
      return;
    }

    const page = this._pageLogical.indexOf(logical);

    if (page >= 0) {
      this.goTo(page);
    }
  }

  /** The on-screen slide frame (slide + header/footer/progress). */
  get stageNode(): HTMLElement {
    return this._stage;
  }

  /**
   * Render every slide in the live stage one at a time and call `visit` after
   * each has mounted; the previously shown slide is restored afterwards.
   */
  async forEachRenderedSlide(
    visit: (index: number, count: number) => Promise<void>,
  ): Promise<void> {
    const original = this._index;
    const count = this._slides.length;

    try {
      for (let i = 0; i < count && !this.isDisposed; i += 1) {
        this._index = i;
        await this._renderCurrent();
        await visit(i, count);
      }
    } finally {
      if (!this.isDisposed) {
        this._index = Math.min(original, Math.max(0, this._slides.length - 1));
        await this._renderCurrent();
      }
    }
  }

  dispose(): void {
    window.clearTimeout(this._resizeTimer);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._measureHost?.remove();
    this._measureHost = null;
    this.node.removeEventListener("keydown", this._onKeyDown);
    this.node.removeEventListener("pointerdown", this._onPointerDown);
    this._renderer.dispose();
    Signal.clearData(this);
    super.dispose();
    // JupyterLab keeps a closed widget's toolbar element, which keeps this
    // subtree alive as detached DOM; empty it.
    this.node.replaceChildren();
  }

  goTo(index: number): void {
    if (this._slides.length === 0) {
      return;
    }

    const next = Math.max(0, Math.min(index, this._slides.length - 1));
    if (next === this._index && this._slideEl.childElementCount > 0) {
      this._syncNav();
      return;
    }

    // Explicit navigation cancels an in-flight open-center pending anchor.
    this._pendingLogical = null;
    this._index = next;
    void this._renderCurrent();
  }

  /** Re-run overflow pagination after typography / chrome changes. */
  reflowOverflow(): void {
    void this._reflowOverflow().then(() => {
      if (!this.isDisposed) {
        void this._renderCurrent();
      }
    });
  }

  refreshFromSource(source: string, preferLine?: number): void {
    const splitMode = this._settings.settings.splitMode;
    const model = buildSlidesDeckModel(source, splitMode);
    const currentLogical = this._pendingLogical ?? this.currentLogicalIndex;
    this._source = source;
    this._injectedTitlePage = model.injectedTitlePage;
    this._meta = model.meta;
    this._logicalSlides = model.slides;
    this._slides = model.slides;
    this._pageLogical = model.slides.map((_, index) => index);

    const target =
      preferLine !== undefined
        ? this.logicalIndexForSourceLine(preferLine)
        : currentLogical;
    this._index = Math.max(0, Math.min(target, this._slides.length - 1));
    this._pendingLogical = this._index;

    this._hosts.forEach((host) => this.applySettingsAppearance(host));
    void this._reflowOverflow().then(() => {
      void this._renderCurrent();
    });
  }

  applySettingsAppearance(host: HTMLElement): void {
    if (!this._hosts.includes(host)) {
      this._hosts.push(host);
    }
    applySlidesAppearance(host, this._effectiveSettings());
  }

  /** Header / footer / progress / counter without remounting the slide. */
  syncSettingsChrome(): void {
    const slide = this._slides[this._index];
    this._syncNav();

    if (slide) {
      this._syncFooter(slide);
    }
  }

  /** Build a multi-page HTML tree for Export / print (all slides). */
  async buildExportRoot(): Promise<HTMLElement> {
    const root = document.createElement("div");
    root.className =
      "jp-KuusiMarkdownSlides-exportDeck jp-KuusiMarkdownSlides";
    const settings = this._effectiveSettings();
    applySlidesAppearance(root, settings);

    for (let i = 0; i < this._slides.length; i += 1) {
      const page = document.createElement("section");
      page.className =
        "jp-KuusiMarkdownSlides-exportPage jp-KuusiMarkdownSlides-slide jp-RenderedHTMLCommon jp-RenderedMarkdown";
      page.dataset.kuusiSlidesLayout = this._slides[i].layout;
      const html = await this._renderSlideHtml(this._slides[i], settings);
      await this._mountSlideHtml(page, html);
      root.appendChild(page);
    }

    return root;
  }

  protected onAfterShow(msg: Message): void {
    super.onAfterShow(msg);
    this._requestKeyboardFocus();
    void this._reflowOverflow().then(() => {
      void this._renderCurrent();
    });
  }

  private async _reflowOverflow(): Promise<void> {
    const token = ++this._overflowToken;
    const logical = this._logicalSlides;
    if (logical.length === 0) {
      this._pendingLogical = null;
      return;
    }

    const anchorLogical = this._pendingLogical ?? this.currentLogicalIndex;
    const subPage =
      this._pendingLogical === null
        ? Math.max(0, this._index - this._pageLogical.indexOf(anchorLogical))
        : 0;

    const stageReady =
      this._stage.clientWidth >= 40 && this._stage.clientHeight >= 40;
    if (!stageReady) {
      this._slides = logical;
      this._pageLogical = logical.map((_, index) => index);
      this._index = Math.max(0, Math.min(anchorLogical, logical.length - 1));
      // Keep pending so a later resize can finish anchoring; clear only if
      // we never expect a usable stage (resize observer will retry).
      return;
    }

    const nextSlides: SlidesSlideUnit[] = [];
    const nextPageLogical: number[] = [];
    for (const [logicalIndex, slide] of logical.entries()) {
      if (token !== this._overflowToken || this.isDisposed) {
        return;
      }

      if (!slide.source.trim()) {
        nextSlides.push(slide);
        nextPageLogical.push(logicalIndex);
        continue;
      }

      // Meta-only YAML title pages are short; still run fit so oversized
      // composed title pages (rare) can split. H1+body title slides paginate.
      const pages = await paginateSlideByFit(slide.source, (markdown) =>
        this._markdownFitsStage(markdown, slide.layout),
      );

      if (token !== this._overflowToken || this.isDisposed) {
        return;
      }

      for (const [pageIndex, page] of pages.entries()) {
        nextSlides.push({
          source: page,
          // Continuations of a title slide should show normal chrome.
          layout:
            pageIndex === 0
              ? slide.layout
              : slide.layout === "title"
                ? "section"
                : slide.layout,
          footer: slide.footer,
        });
        nextPageLogical.push(logicalIndex);
      }
    }

    if (token !== this._overflowToken || this.isDisposed) {
      return;
    }

    if (nextSlides.length > 0) {
      this._slides = nextSlides;
      this._pageLogical = nextPageLogical;
    } else {
      this._slides = logical;
      this._pageLogical = logical.map((_, index) => index);
    }

    const first = this._pageLogical.indexOf(anchorLogical);
    const pages = this._pageLogical.filter((l) => l === anchorLogical).length;
    this._index =
      first >= 0
        ? first + Math.min(subPage, Math.max(0, pages - 1))
        : Math.max(0, Math.min(this._index, this._slides.length - 1));
    this._pendingLogical = null;
    this._syncNav();
  }

  private _ensureMeasureHost(): HTMLElement {
    if (!this._measureHost) {
      this._measureHost = document.createElement("div");
      this._measureHost.className =
        "jp-KuusiMarkdownSlides-measureHost jp-KuusiMarkdownSlides-slide jp-RenderedHTMLCommon jp-RenderedMarkdown";
      this._measureHost.setAttribute("aria-hidden", "true");
      this._deck.appendChild(this._measureHost);
    }
    return this._measureHost;
  }

  private _chromeHeightsForLayout(
    layout: SlidesSlideUnit["layout"],
  ): { header: number; footer: number; progress: number } {
    const settings = this._effectiveSettings();
    const isTitle = layout === "title";

    if (!this._stageHeader.hidden && this._stageHeader.offsetHeight > 0) {
      this._lastHeaderH = this._stageHeader.offsetHeight;
    }
    if (!this._footer.hidden && this._footer.offsetHeight > 0) {
      this._lastFooterH = this._footer.offsetHeight;
    }
    if (!this._progress.hidden && this._progress.offsetHeight > 0) {
      this._lastProgressH = this._progress.offsetHeight;
    }

    return {
      header:
        isTitle || !settings.showHeader ? 0 : this._lastHeaderH,
      footer:
        isTitle || !settings.showFooter ? 0 : this._lastFooterH,
      progress: settings.showProgress ? this._lastProgressH : 0,
    };
  }

  private async _markdownFitsStage(
    markdown: string,
    layout: SlidesSlideUnit["layout"],
  ): Promise<boolean> {
    const width = this._slideEl.clientWidth || this._stage.clientWidth;
    const chrome = this._chromeHeightsForLayout(layout);
    const height = Math.max(
      40,
      this._stage.clientHeight - chrome.header - chrome.footer - chrome.progress,
    );
    if (width < 40) {
      return true;
    }

    const host = this._ensureMeasureHost();
    host.dataset.kuusiSlidesLayout = layout;
    host.style.width = `${width}px`;
    host.style.height = `${height}px`;

    const settings = this._effectiveSettings();
    const slidesRoot =
      this.node.closest(".jp-KuusiMarkdownSlides") ?? this.node;
    applySlidesAppearance(slidesRoot as HTMLElement, settings);

    try {
      // Same mount path as the live stage (renderHTML + images + math).
      const html = await expandPresentationContainers(markdown, (md) =>
        this._renderMarkdown(md),
      );
      host.replaceChildren();
      await this._mountSlideHtml(host, html);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      return !(host.scrollHeight > host.clientHeight + 2);
    } catch {
      // Prefer splitting over silent clip when measure fails.
      return false;
    }
  }

  private _effectiveSettings(): SlidesSettings {
    const settings = this._settings.settings;
    if (this._meta.theme) {
      return { ...settings, theme: this._meta.theme };
    }
    return settings;
  }

  private _requestKeyboardFocus(): void {
    if (this.isDisposed || !this.isVisible) {
      return;
    }

    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active === this.node || this.node.contains(active))
    ) {
      return;
    }

    if (
      active instanceof HTMLElement &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT" ||
        active.isContentEditable)
    ) {
      return;
    }

    this.node.focus({ preventScroll: true });
  }

  private _syncNav(): void {
    const settings = this._effectiveSettings();
    const total = Math.max(1, this._slides.length);
    const label = formatPageNumberLabel(
      this._index,
      total,
      settings.pageNumberStart,
      true,
    );
    this._counter.textContent = label || "—";
    this._prevBtn.disabled = this._index <= 0;
    this._nextBtn.disabled = this._index >= this._slides.length - 1;

    const showProgress = settings.showProgress && this._slides.length > 0;
    this._progress.hidden = !showProgress;
    if (showProgress) {
      const numbered = resolvePageNumberDisplay(
        this._index,
        total,
        settings.pageNumberStart,
      );
      const pct = numbered.show
        ? (numbered.page / numbered.pages) * 100
        : 0;
      this._progress.style.width = `${pct}%`;
      if (this._progress.offsetHeight > 0) {
        this._lastProgressH = this._progress.offsetHeight;
      }
    }
  }

  private _syncFooter(slide: SlidesSlideUnit): void {
    const settings = this._effectiveSettings();
    const deckWantsFooter =
      this._meta.footer ?? Boolean(this._meta.shortTitle || this._meta.title);
    const slideWantsFooter = slide.footer;
    const deckAllows =
      slideWantsFooter !== undefined ? slideWantsFooter : deckWantsFooter;
    const isTitle = slide.layout === "title";
    const deckTitle = this._meta.shortTitle || this._meta.title || "";
    const headerTitle = resolveSlideHeaderText(
      settings.headerSource,
      settings.headerCustomText,
      this._slides.map((unit) => unit.source),
      this._index,
    );

    const showHeader =
      settings.showHeader && !isTitle && Boolean(headerTitle);
    this._stageHeader.hidden = !showHeader;
    if (showHeader) {
      this._stageHeaderTitle.textContent = headerTitle;
      if (this._stageHeader.offsetHeight > 0) {
        this._lastHeaderH = this._stageHeader.offsetHeight;
      }
    }
    this._stage.classList.toggle("has-stage-header", showHeader);

    const total = Math.max(1, this._slides.length);
    const pageLabel = formatPageNumberLabel(
      this._index,
      total,
      settings.pageNumberStart,
      settings.pageNumberStyle,
    );
    const showPage =
      settings.showPageNumber && deckAllows && !isTitle && Boolean(pageLabel);
    const showFooter =
      deckAllows &&
      !isTitle &&
      ((settings.showFooter && Boolean(deckTitle)) || showPage);

    this._footer.hidden = !showFooter;
    this._stage.classList.toggle("has-stage-footer", showFooter);
    this._footer.dataset.kuusiSlidesPageAlign = settings.pageNumberAlign;
    if (!showFooter) {
      return;
    }

    if (this._footer.offsetHeight > 0) {
      this._lastFooterH = this._footer.offsetHeight;
    }

    this._footerTitle.textContent = settings.showFooter ? deckTitle : "";
    this._footerTitle.hidden = !this._footerTitle.textContent;
    this._footerPage.hidden = !showPage || !pageLabel;
    this._footerPage.textContent = showPage && pageLabel ? pageLabel : "";
  }

  private async _renderMarkdown(markdown: string): Promise<string> {
    const parser = this._rendermime.markdownParser;
    if (parser) {
      // Match JupyterLab's renderMarkdown: protect math from the MD parser,
      // then restore delimiters for the latex typesetter.
      const parts = removeMath(markdown);
      const html = await parser.render(parts.text);
      return replaceMath(html, parts.math);
    }

    const renderer = this._rendermime.createRenderer("text/markdown");
    const mimeModel = new MimeModel({
      data: { "text/markdown": markdown },
      trusted: true,
    });
    try {
      await renderer.renderModel(mimeModel);
      return renderer.node.innerHTML;
    } finally {
      renderer.dispose();
    }
  }

  /** Mount HTML into a host and run URL rewrite + MathJax/KaTeX typesetting. */
  private async _mountSlideHtml(
    host: HTMLElement,
    html: string,
  ): Promise<void> {
    await renderHTML({
      host,
      source: html,
      trusted: true,
      sanitizer: this._rendermime.sanitizer,
      resolver: this._rendermime.resolver,
      linkHandler: this._rendermime.linkHandler,
      shouldTypeset: true,
      latexTypesetter: this._rendermime.latexTypesetter,
    });
    await refreshMarkdownImageSources(host, this._resolver);
  }

  private async _renderSlideHtml(
    slide: SlidesSlideUnit,
    _settings: SlidesSettings,
  ): Promise<string> {
    const source = slide.source.trim();

    if (slide.layout === "title" && this._meta.title && !source) {
      return composeTitlePageHtml(
        this._meta.title,
        this._meta.author,
        this._meta.date,
      );
    }

    // Only the YAML title page (H1 + optional author/date) uses the composed
    // title chrome. H1 slides with real body keep their markdown intact.
    if (
      slide.layout === "title" &&
      this._meta.title &&
      isMetaOnlyTitleSlide(source, this._meta)
    ) {
      return composeTitlePageHtml(
        this._meta.title,
        this._meta.author,
        this._meta.date,
      );
    }

    if (!source) {
      return "";
    }

    return expandPresentationContainers(source, (md) =>
      this._renderMarkdown(md),
    );
  }

  private async _renderCurrent(): Promise<void> {
    const token = ++this._renderToken;
    const slide = this._slides[this._index] ?? {
      source: "",
      layout: "default" as const,
    };
    this._syncNav();
    this._syncFooter(slide);

    this._stage.dataset.kuusiSlidesLayout = slide.layout;
    this._slideEl.dataset.kuusiSlidesLayout = slide.layout;
    this._slideEl.classList.toggle(
      "jp-KuusiMarkdownSlides-slide--title",
      slide.layout === "title",
    );
    this._slideEl.classList.toggle(
      "jp-KuusiMarkdownSlides-slide--section",
      slide.layout === "section",
    );
    this._slideEl.classList.toggle(
      "jp-KuusiMarkdownSlides-slide--columns",
      slide.layout === "columns",
    );

    try {
      const html = await this._renderSlideHtml(slide, this._effectiveSettings());
      if (token !== this._renderToken || this.isDisposed) {
        return;
      }

      this._slideEl.replaceChildren();
      this._renderer.node.replaceChildren();
      this._slideEl.appendChild(this._renderer.node);
      await this._mountSlideHtml(this._renderer.node, html);

      if (token !== this._renderToken || this.isDisposed) {
        return;
      }
    } catch (error) {
      console.warn("jupyterlab-kuusi: Failed to render slide", error);
      this._slideEl.textContent = slide.source;
    }
  }

  private _onPointerDown = (): void => {
    this._requestKeyboardFocus();
  };

  private _onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      this._navigate(this._index + 1);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      this._navigate(this._index - 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      this._navigate(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      this._navigate(this._slides.length - 1);
    }
  };

  private _navigate(index: number): void {
    const before = this._index;
    this.goTo(index);

    if (this._index !== before) {
      this._userNavigated.emit();
    }
  }
}

export class MarkdownSlidesDocumentWidget extends DocumentWidget<
  MarkdownSlidesViewer,
  TextModel
> {
  private _contentStale = true;

  private _lastSettings: SlidesSettings;

  constructor(
    options: DocumentWidget.IOptions<MarkdownSlidesViewer, TextModel>,
    private _settings: SlidesSettingsManager,
  ) {
    super(options);
    this.addClass("jp-KuusiMarkdownSlidesDocument");
    applyKuusiTabIcon(this.title, slidesIcon, "Kuusi Markdown Slides");

    // Mount capsule chrome on the viewer (content), not the Document shell —
    // Lumino BoxLayout fills the document with an absolute content pane that
    // otherwise paints over a header appended to this.node.
    this._lastSettings = this._settings.settings;
    ensureKuusiSlidesChrome(this, this.content.node, this._settings);
    this.content.applySettingsAppearance(this.node);
    this.content.applySettingsAppearance(this.content.node);

    const refresh = (force = false): void => {
      if (this.isDisposed) {
        return;
      }

      if (!force && !this.isVisible) {
        this._contentStale = true;
        return;
      }

      this._contentStale = false;
      this.content.refreshFromSource(this.context.model.toString());
    };

    const onContentChanged = (): void => {
      refresh(false);
    };

    const onSettings = (): void => {
      const next = this._settings.settings;
      const previous = this._lastSettings;
      this._lastSettings = next;

      this.content.applySettingsAppearance(this.node);
      this.content.applySettingsAppearance(this.content.node);
      this.content.syncSettingsChrome();

      if (slidesSettingsNeedSourceRebuild(previous, next)) {
        if (!this.isVisible) {
          this._contentStale = true;
          return;
        }

        this.content.refreshFromSource(this.context.model.toString());
        this._contentStale = false;
        return;
      }

      if (slidesSettingsNeedOverflowReflow(previous, next)) {
        if (!this.isVisible) {
          this._contentStale = true;
          return;
        }

        this.content.reflowOverflow();
        this._contentStale = false;
      }
    };

    void this.context.ready.then(() => {
      refresh(true);
    });

    this.context.model.contentChanged.connect(onContentChanged);
    const settingsConn = this._settings.changed.connect(onSettings);

    this.disposed.connect(() => {
      this.context.model.contentChanged.disconnect(onContentChanged);
      settingsConn.disconnect();
    });
  }

  protected onAfterShow(msg: Message): void {
    super.onAfterShow(msg);

    if (this._contentStale && !this.isDisposed) {
      this._contentStale = false;
      this.content.refreshFromSource(this.context.model.toString());
    }
  }
}

export class MarkdownSlidesWidgetFactory extends ABCWidgetFactory<
  MarkdownSlidesDocumentWidget,
  TextModel
> {
  static readonly NAME = FACTORY_KUUSI_MARKDOWN_SLIDES;

  constructor(
    options: DocumentRegistry.IWidgetFactoryOptions<MarkdownSlidesDocumentWidget>,
    private _rendermime: IRenderMimeRegistry,
    private _contents: Contents.IManager,
    private _settings: SlidesSettingsManager,
  ) {
    super(options);
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<TextModel>,
  ): MarkdownSlidesDocumentWidget {
    const content = new MarkdownSlidesViewer(
      context,
      this._rendermime,
      this._contents,
      this._settings,
    );

    return new MarkdownSlidesDocumentWidget(
      { content, context },
      this._settings,
    );
  }
}

/** Same Slides viewer for `.ipynb`: the notebook is flattened to markdown. */
export class NotebookSlidesWidgetFactory extends MarkdownSlidesWidgetFactory {
  protected createNewWidget(
    context: DocumentRegistry.IContext<TextModel>,
  ): MarkdownSlidesDocumentWidget {
    return super.createNewWidget(
      createNotebookMarkdownContext(
        context as unknown as DocumentRegistry.IContext<INotebookModel>,
      ) as DocumentRegistry.IContext<TextModel>,
    );
  }
}
