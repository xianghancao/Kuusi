import type * as pdfjs from "pdfjs-dist";

const DEFAULT_LINK_REL = "noopener noreferrer nofollow";

export type LivePdfLinkHandlers = {
  goToPage: (page: number) => void;
  goToDestination: (dest: string | unknown[] | null) => Promise<void>;
  nextPage: () => void;
  previousPage: () => void;
  goToLastPage: () => void;
};

/**
 * Minimal pdf.js link service for annotation-layer hyperlinks.
 */
export class LivePdfLinkService {
  externalLinkEnabled = true;

  externalLinkTarget: string | null = "_blank";

  externalLinkRel = DEFAULT_LINK_REL;

  pdfDocument: pdfjs.PDFDocumentProxy | null = null;

  eventBus: null = null;

  constructor(private _handlers: LivePdfLinkHandlers) {}

  setDocument(pdfDocument: pdfjs.PDFDocumentProxy | null): void {
    this.pdfDocument = pdfDocument;
  }

  get pagesCount(): number {
    return this.pdfDocument?.numPages ?? 0;
  }

  get page(): number {
    return 1;
  }

  set page(_value: number) {
    // Page navigation is handled by LivePdfViewer callbacks.
  }

  get rotation(): number {
    return 0;
  }

  set rotation(_value: number) {
    // Rotation is not supported in Kuusi Live PDF yet.
  }

  get isInPresentationMode(): boolean {
    return false;
  }

  setHash(_hash: string): void {
    // URL hash navigation is not used in Kuusi Live PDF.
  }

  async goToDestination(dest: string | unknown[] | null): Promise<void> {
    await this._handlers.goToDestination(dest);
  }

  goToPage(pageNumber: number): void {
    this._handlers.goToPage(pageNumber);
  }

  addLinkAttributes(
    link: HTMLAnchorElement,
    url: string,
    newWindow = false,
  ): void {
    if (!url) {
      link.href = "";
      return;
    }

    if (this.externalLinkEnabled) {
      link.href = url;
      link.title = url;
    } else {
      link.href = "";
      link.title = `Disabled: ${url}`;
      link.onclick = () => false;
      return;
    }

    link.target = newWindow ? "_blank" : "_self";
    link.rel = this.externalLinkRel;
  }

  getDestinationHash(dest: string | unknown[] | null): string {
    if (typeof dest === "string") {
      if (dest.length > 0) {
        return this.getAnchorUrl(`#${escape(dest)}`);
      }
    } else if (Array.isArray(dest)) {
      const serialized = JSON.stringify(dest);

      if (serialized.length > 0) {
        return this.getAnchorUrl(`#${escape(serialized)}`);
      }
    }

    return this.getAnchorUrl("");
  }

  getAnchorUrl(anchor: string): string {
    return anchor;
  }

  executeNamedAction(action: string): void {
    switch (action) {
      case "NextPage":
        this._handlers.nextPage();
        break;
      case "PrevPage":
        this._handlers.previousPage();
        break;
      case "LastPage":
        this._handlers.goToLastPage();
        break;
      case "FirstPage":
        this._handlers.goToPage(1);
        break;
      default:
        break;
    }
  }

  executeSetOCGState(_action: unknown): void {
    // Optional content groups are not supported in Kuusi Live PDF yet.
  }
}
