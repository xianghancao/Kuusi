import * as pdfjs from "pdfjs-dist";
import type { LivePdfLinkService } from "./livePdfLinkService";

export async function renderPdfPageAnnotations(
  page: pdfjs.PDFPageProxy,
  viewport: pdfjs.PageViewport,
  linkService: LivePdfLinkService,
): Promise<HTMLDivElement | null> {
  const annotations = await page.getAnnotations({ intent: "display" });

  if (annotations.length === 0) {
    return null;
  }

  const layerViewport = viewport.clone({ dontFlip: true });
  const div = document.createElement("div");
  div.className = "annotationLayer jp-KuusiLivePdf-annotationLayer";
  pdfjs.setLayerDimensions(div, layerViewport, false, false);

  const layer = new pdfjs.AnnotationLayer({
    div,
    page,
    viewport: layerViewport,
    accessibilityManager: null,
    annotationCanvasMap: null,
    annotationEditorUIManager: null,
    structTreeLayer: null,
  });

  await layer.render({
    annotations,
    div,
    page,
    viewport: layerViewport,
    linkService: linkService as never,
    renderForms: false,
    imageResourcesPath: "",
    enableScripting: false,
    hasJSActions: false,
    fieldObjects: null,
  });

  return div;
}
