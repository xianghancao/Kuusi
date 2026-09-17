import { Widget } from "@lumino/widgets";
import { formatFileSize } from "./imageFormat";
import type { ImageViewer } from "./imageViewer";

export type ImageExportFormat = "image/png" | "image/jpeg" | "image/webp";

export type ImageEditPopoverHandle = {
  widget: Widget;
  dispose: () => void;
};

const parseDimension = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

export const createImageEditPopover = (
  viewer: ImageViewer,
): ImageEditPopoverHandle => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiImageEditPopover");

  const panel = document.createElement("div");
  panel.className = "jp-KuusiImageEditPopover-panel";

  const title = document.createElement("div");
  title.className = "jp-KuusiImageEditPopover-title";
  title.textContent = "Export & save";

  const hint = document.createElement("p");
  hint.className = "jp-KuusiImageEditPopover-hint";
  hint.textContent =
    "Crop and resize, then save to the Jupyter file browser or download locally.";

  const sizeRow = document.createElement("div");
  sizeRow.className = "jp-KuusiImageEditPopover-row";

  const widthLabel = document.createElement("label");
  widthLabel.textContent = "Width";
  const widthInput = document.createElement("input");
  widthInput.type = "number";
  widthInput.min = "1";
  widthInput.className = "jp-KuusiImageEditPopover-input";

  const heightLabel = document.createElement("label");
  heightLabel.textContent = "Height";
  const heightInput = document.createElement("input");
  heightInput.type = "number";
  heightInput.min = "1";
  heightInput.className = "jp-KuusiImageEditPopover-input";

  const lockLabel = document.createElement("label");
  lockLabel.className = "jp-KuusiImageEditPopover-lock";
  const lockInput = document.createElement("input");
  lockInput.type = "checkbox";
  lockInput.checked = true;
  lockLabel.append(lockInput, document.createTextNode(" Lock aspect"));

  sizeRow.append(widthLabel, widthInput, heightLabel, heightInput, lockLabel);

  const formatRow = document.createElement("div");
  formatRow.className = "jp-KuusiImageEditPopover-row";
  const formatLabel = document.createElement("label");
  formatLabel.textContent = "Format";
  const formatSelect = document.createElement("select");
  formatSelect.className = "jp-KuusiImageEditPopover-select";
  for (const option of [
    { value: "image/png", label: "PNG" },
    { value: "image/jpeg", label: "JPEG" },
    { value: "image/webp", label: "WebP" },
  ]) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    formatSelect.appendChild(el);
  }
  formatRow.append(formatLabel, formatSelect);

  const qualityRow = document.createElement("div");
  qualityRow.className = "jp-KuusiImageEditPopover-row";
  const qualityLabel = document.createElement("label");
  qualityLabel.textContent = "Quality";
  const qualityInput = document.createElement("input");
  qualityInput.type = "range";
  qualityInput.min = "50";
  qualityInput.max = "100";
  qualityInput.value = "92";
  qualityInput.className = "jp-KuusiImageEditPopover-quality";
  qualityRow.append(qualityLabel, qualityInput);

  const estimate = document.createElement("div");
  estimate.className = "jp-KuusiImageEditPopover-estimate";
  estimate.textContent = "Estimated size: —";

  const actions = document.createElement("div");
  actions.className = "jp-KuusiImageEditPopover-actions";

  const cropBtn = document.createElement("button");
  cropBtn.type = "button";
  cropBtn.className = "jp-mod-styled jp-KuusiImageEditPopover-crop";
  cropBtn.textContent = "Crop…";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "jp-mod-styled jp-KuusiImageEditPopover-save";
  saveBtn.textContent = "Replace file";

  const saveCopyBtn = document.createElement("button");
  saveCopyBtn.type = "button";
  saveCopyBtn.className = "jp-mod-styled jp-KuusiImageEditPopover-saveCopy";
  saveCopyBtn.textContent = "Save copy";

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "jp-mod-styled jp-KuusiImageEditPopover-download";
  downloadBtn.textContent = "Download";

  actions.append(cropBtn, saveBtn, saveCopyBtn, downloadBtn);
  panel.append(title, hint, sizeRow, formatRow, qualityRow, estimate, actions);
  wrap.node.appendChild(panel);

  let estimateTimer: number | null = null;
  let syncing = false;

  const syncDimensionsFromViewer = (): void => {
    const dims = viewer.getEffectivePixelSize();
    syncing = true;
    widthInput.value = String(dims.width);
    heightInput.value = String(dims.height);
    syncing = false;
  };

  const scheduleEstimate = (): void => {
    if (estimateTimer !== null) {
      window.clearTimeout(estimateTimer);
    }

    estimateTimer = window.setTimeout(() => {
      estimateTimer = null;
      void viewer
        .estimateExportSize({
          outputWidth: parseDimension(widthInput.value, 1),
          outputHeight: parseDimension(heightInput.value, 1),
          mimeType: formatSelect.value as ImageExportFormat,
          quality: Number(qualityInput.value) / 100,
          useCrop: viewer.cropModeActive,
        })
        .then((bytes) => {
          estimate.textContent = `Estimated size: ${formatFileSize(bytes)}`;
        })
        .catch(() => {
          estimate.textContent = "Estimated size: —";
        });
    }, 200);
  };

  const onWidthChange = (): void => {
    if (syncing || !lockInput.checked) {
      scheduleEstimate();
      return;
    }

    const dims = viewer.getSourcePixelSize();
    const nextW = parseDimension(widthInput.value, dims.width);
    syncing = true;
    heightInput.value = String(
      Math.max(1, Math.round((nextW / dims.width) * dims.height)),
    );
    syncing = false;
    scheduleEstimate();
  };

  const onHeightChange = (): void => {
    if (syncing || !lockInput.checked) {
      scheduleEstimate();
      return;
    }

    const dims = viewer.getSourcePixelSize();
    const nextH = parseDimension(heightInput.value, dims.height);
    syncing = true;
    widthInput.value = String(
      Math.max(1, Math.round((nextH / dims.height) * dims.width)),
    );
    syncing = false;
    scheduleEstimate();
  };

  widthInput.addEventListener("input", onWidthChange);
  heightInput.addEventListener("input", onHeightChange);
  lockInput.addEventListener("change", scheduleEstimate);
  formatSelect.addEventListener("change", scheduleEstimate);
  qualityInput.addEventListener("input", scheduleEstimate);

  cropBtn.addEventListener("click", () => {
    const active = viewer.toggleCropMode();
    cropBtn.classList.toggle("is-active", active);
    cropBtn.textContent = active ? "Done crop" : "Crop…";
    syncDimensionsFromViewer();
    scheduleEstimate();
  });

  const exportOptions = () => ({
    outputWidth: parseDimension(widthInput.value, 1),
    outputHeight: parseDimension(heightInput.value, 1),
    mimeType: formatSelect.value as ImageExportFormat,
    quality: Number(qualityInput.value) / 100,
    useCrop: viewer.cropModeActive,
  });

  saveBtn.addEventListener("click", () => {
    void viewer.saveExportOverwrite(exportOptions());
  });

  saveCopyBtn.addEventListener("click", () => {
    void viewer.saveExportCopyInDirectory(exportOptions());
  });

  downloadBtn.addEventListener("click", () => {
    void viewer.downloadExport(exportOptions());
  });

  viewer.connectViewStateChange(() => {
    scheduleEstimate();
  });

  syncDimensionsFromViewer();
  scheduleEstimate();

  return {
    widget: wrap,
    dispose: () => {
      if (estimateTimer !== null) {
        window.clearTimeout(estimateTimer);
      }
    },
  };
};
