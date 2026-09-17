import { Widget } from "@lumino/widgets";
import {
  isToolbarPopoverTarget,
  mountToolbarPopover,
  restoreToolbarPopover,
} from "./livePdfToolbarPopover";
import type { LivePdfViewer } from "./livePdfViewer";

const ZOOM_TRACK_PX = 150;
const ZOOM_THUMB_PX = 12;
const MIN_ZOOM_PERCENT = 50;
const MAX_ZOOM_PERCENT = 200;
const ZOOM_PERCENT_STEP = 10;
const ZOOM_TICKS = Array.from(
  { length: (MAX_ZOOM_PERCENT - MIN_ZOOM_PERCENT) / ZOOM_PERCENT_STEP + 1 },
  (_, index) => MIN_ZOOM_PERCENT + index * ZOOM_PERCENT_STEP,
);

type FitButton = {
  removeClass: (name: string) => void;
};

const percentToTrackBottom = (percent: number): number => {
  const ratio = (percent - MIN_ZOOM_PERCENT) / (MAX_ZOOM_PERCENT - MIN_ZOOM_PERCENT);

  return Math.max(0, Math.min(ZOOM_TRACK_PX, ratio * ZOOM_TRACK_PX));
};

const percentFromTrackClientY = (track: HTMLElement, clientY: number): number => {
  const rect = track.getBoundingClientRect();
  const ratio = 1 - (clientY - rect.top) / Math.max(1, rect.height);

  return Math.round(
    MIN_ZOOM_PERCENT +
      Math.max(0, Math.min(1, ratio)) * (MAX_ZOOM_PERCENT - MIN_ZOOM_PERCENT),
  );
};

const snapZoomPercent = (percent: number): number =>
  Math.min(
    MAX_ZOOM_PERCENT,
    Math.max(MIN_ZOOM_PERCENT, Math.round(percent / ZOOM_PERCENT_STEP) * ZOOM_PERCENT_STEP),
  );

const formatZoomTriggerLabel = (viewer: LivePdfViewer): string =>
  `${viewer.effectiveZoomPercent}%`;

const exitFitMode = (fitButton: FitButton): void => {
  fitButton.removeClass("is-active");
};

export const createZoomSliderControl = (
  viewer: LivePdfViewer,
  fitButton: FitButton,
): { widget: Widget; syncUi: () => void } => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiLivePdf-zoomSlider");

  const host = document.createElement("div");
  host.className = "jp-KuusiLivePdf-zoomSliderHost";

  const sliderWrap = document.createElement("div");
  sliderWrap.className = "jp-KuusiLivePdf-zoomSliderWrap";
  sliderWrap.style.setProperty("--kuusi-live-pdf-zoom-track", `${ZOOM_TRACK_PX}px`);
  sliderWrap.style.setProperty("--kuusi-live-pdf-zoom-thumb", `${ZOOM_THUMB_PX}px`);

  const rail = document.createElement("div");
  rail.className = "jp-KuusiLivePdf-zoomSliderRail";

  const ticks = document.createElement("div");
  ticks.className = "jp-KuusiLivePdf-zoomSliderTicks";

  for (const percent of ZOOM_TICKS) {
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "jp-KuusiLivePdf-zoomSliderTick";
    tick.textContent = percent % 50 === 0 ? `${percent}%` : "";
    tick.title = `${percent}%`;
    tick.setAttribute("aria-label", `${percent}%`);
    tick.style.bottom = `${percentToTrackBottom(percent)}px`;
    tick.addEventListener("click", (event) => {
      event.stopPropagation();
      exitFitMode(fitButton);
      viewer.setZoomPercent(percent);
      syncUi();
      closeSlider();
    });
    ticks.appendChild(tick);
  }

  const track = document.createElement("div");
  track.className = "jp-KuusiLivePdf-zoomSliderTrack";
  track.setAttribute("role", "slider");
  track.tabIndex = 0;
  track.setAttribute("aria-orientation", "vertical");
  track.setAttribute("aria-valuemin", String(MIN_ZOOM_PERCENT));
  track.setAttribute("aria-valuemax", String(MAX_ZOOM_PERCENT));

  const trackLine = document.createElement("div");
  trackLine.className = "jp-KuusiLivePdf-zoomSliderTrackLine";
  trackLine.setAttribute("aria-hidden", "true");

  const thumb = document.createElement("div");
  thumb.className = "jp-KuusiLivePdf-zoomSliderThumb";
  thumb.setAttribute("aria-hidden", "true");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "jp-KuusiLivePdf-zoomSliderTrigger";
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  trigger.title = "Zoom level";

  const applyFromPointer = (clientY: number): void => {
    exitFitMode(fitButton);
    viewer.setZoomPercent(snapZoomPercent(percentFromTrackClientY(track, clientY)));
    syncUi();
  };

  track.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    track.setPointerCapture(event.pointerId);
    applyFromPointer(event.clientY);
  });

  track.addEventListener("pointermove", (event) => {
    if (!track.hasPointerCapture(event.pointerId)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    applyFromPointer(event.clientY);
  });

  track.addEventListener("pointerup", (event) => {
    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }
  });

  track.addEventListener("keydown", (event) => {
    let next: number | null = null;
    const current = snapZoomPercent(viewer.zoomPercent);

    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      next = current + ZOOM_PERCENT_STEP;
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      next = current - ZOOM_PERCENT_STEP;
    } else if (event.key === "Home") {
      next = MAX_ZOOM_PERCENT;
    } else if (event.key === "End") {
      next = MIN_ZOOM_PERCENT;
    }

    if (next === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    exitFitMode(fitButton);
    viewer.setZoomPercent(next);
    syncUi();
  });

  const closeSlider = (): void => {
    sliderWrap.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    restoreToolbarPopover(host, sliderWrap, trigger);
    document.removeEventListener("click", onDocumentClick, true);
    window.removeEventListener("resize", closeSlider);
    window.removeEventListener("scroll", closeSlider, true);
  };

  const openSlider = (): void => {
    mountToolbarPopover(trigger, sliderWrap, "below");
    sliderWrap.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    syncUi();
    window.addEventListener("resize", closeSlider);
    window.addEventListener("scroll", closeSlider, true);
    window.requestAnimationFrame(() => {
      document.addEventListener("click", onDocumentClick, true);
    });
  };

  const onDocumentClick = (event: MouseEvent): void => {
    if (
      !isToolbarPopoverTarget(host, sliderWrap, event.target as Node)
    ) {
      closeSlider();
    }
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();

    if (sliderWrap.classList.contains("is-open")) {
      closeSlider();
    } else {
      openSlider();
    }
  });

  const syncThumb = (percent: number): void => {
    const snapped = snapZoomPercent(percent);
    thumb.style.bottom = `${percentToTrackBottom(snapped)}px`;
    track.setAttribute("aria-valuenow", String(snapped));
    track.setAttribute("aria-valuetext", `${snapped}%`);
    track.setAttribute("aria-label", `Zoom ${snapped}%`);
  };

  const syncUi = (): void => {
    const label = formatZoomTriggerLabel(viewer);
    trigger.textContent = label;
    trigger.setAttribute("aria-label", `Zoom: ${label}`);

    syncThumb(viewer.effectiveZoomPercent);
  };

  syncUi();

  track.append(trackLine, thumb);
  rail.append(ticks, track);
  sliderWrap.appendChild(rail);
  host.append(sliderWrap, trigger);
  wrap.node.appendChild(host);

  wrap.disposed.connect(() => {
    closeSlider();
    document.removeEventListener("click", onDocumentClick, true);
  });

  return { widget: wrap, syncUi };
};
