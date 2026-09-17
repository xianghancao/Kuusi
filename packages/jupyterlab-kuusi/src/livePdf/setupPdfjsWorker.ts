import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs";

let configured = false;

export const setupPdfjsWorker = (): void => {
  if (configured) {
    return;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  configured = true;
};
