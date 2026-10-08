import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { Widget } from "@lumino/widgets";

import {
  bindDocumentStatusChrome,
  slideCountFromWidget,
} from "../bindStatusChrome";
import { closeKuusiDropdownMenus } from "../formatToolbar";
import { createKuusiTranslator } from "../kuusiI18n";
import { slidesIcon } from "../kuusiIcon";
import { mountCssZoomRenderChrome } from "../renderViewChrome";
import { createTypographyCapsuleItems } from "../typographyCapsule";
import { createViewCapsuleLogo } from "../viewBrand";
import {
  mountViewCapsuleHeader,
  type ViewCapsuleHeader,
} from "../viewCapsule";
import {
  createSlidesPageToolbar,
  createSlidesThemeToolbar,
  createSlidesTypographyModel,
} from "./slidesMenus";
import {
  applySlidesAppearance,
  type SlidesSettingsManager,
} from "./slidesSettings";

type SlidesChromeBinding = {
  capsule: ViewCapsuleHeader;
  disposeStatusChrome: () => void;
  disposePlayFit?: () => void;
};

const chromeBindings = new WeakMap<object, SlidesChromeBinding>();

type SlidesChromeOwner = Widget & {
  context: DocumentRegistry.IContext<DocumentRegistry.IModel>;
  content?: Widget;
};

/** Fit the fixed stage into the desk with camera scale (play/fullscreen). */
const syncSlidesPlayFit = (host: HTMLElement): void => {
  const stage = host.querySelector<HTMLElement>(
    ".jp-KuusiMarkdownSlides-stage",
  );
  if (!stage) {
    return;
  }
  if (!host.classList.contains("is-kuusi-playing")) {
    stage.style.removeProperty("--kuusi-slides-play-scale");
    return;
  }
  const deck =
    host.querySelector<HTMLElement>(".jp-KuusiMarkdownSlides-deck") ?? host;
  const stageW = stage.offsetWidth || 960;
  const stageH = stage.offsetHeight || 540;
  const viewW = Math.max(1, deck.clientWidth);
  const viewH = Math.max(1, deck.clientHeight);
  const scale = Math.min(viewW / stageW, viewH / stageH);
  stage.style.setProperty(
    "--kuusi-slides-play-scale",
    String(Number.isFinite(scale) && scale > 0 ? scale : 1),
  );
};

const mountSlidesHeader = (
  widget: SlidesChromeOwner,
  host: HTMLElement,
  manager: SlidesSettingsManager,
): void => {
  if (chromeBindings.has(widget) || widget.isDisposed) {
    return;
  }

  const t = createKuusiTranslator();
  const typography = createSlidesTypographyModel(manager);
  const capsule = mountViewCapsuleHeader({
    host,
    headerClass: "jp-KuusiSlides-header",
    ariaLabel: t.slidesControls(),
    t,
    menuRoot: host,
    items: [
      {
        id: "brand",
        group: "brand",
        order: 10,
        create: () => createViewCapsuleLogo(slidesIcon, t.slidesControls()),
      },
      {
        id: "theme",
        group: "appearance",
        order: 10,
        create: () => createSlidesThemeToolbar(host, manager, t),
      },
      {
        id: "page",
        group: "appearance",
        order: 20,
        create: () => createSlidesPageToolbar(host, manager, t),
      },
      ...createTypographyCapsuleItems(host, typography, t),
    ],
  });
  const header = capsule.header;

  const playFitRo =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          syncSlidesPlayFit(host);
        })
      : null;
  playFitRo?.observe(host);

  const renderChrome = mountCssZoomRenderChrome(widget, host, t, {
    cornerAction: "play",
    documentClassName: "jp-KuusiMarkdownSlidesDocument",
    showTextCount: manager.settings.showTextCount,
    showPageCount: manager.settings.showPageCount,
    showFileSize: manager.settings.showFileSize,
    onCloseMenus: () => closeKuusiDropdownMenus(host),
    onActiveChange: (playing) => {
      host.classList.toggle("is-kuusi-playing", playing);
      header.hidden = playing;
      requestAnimationFrame(() => syncSlidesPlayFit(host));
    },
  });

  const disposeStatusChrome = bindDocumentStatusChrome({
    chrome: renderChrome,
    context: widget.context,
    manager,
    getPages: () =>
      slideCountFromWidget(widget.content ?? widget),
  });

  chromeBindings.set(widget, {
    capsule,
    disposeStatusChrome,
    disposePlayFit: () => {
      playFitRo?.disconnect();
      syncSlidesPlayFit(host);
    },
  });

  widget.disposed.connect(() => {
    const binding = chromeBindings.get(widget);

    if (!binding) {
      return;
    }

    binding.capsule.dispose();
    binding.disposeStatusChrome();
    binding.disposePlayFit?.();
    chromeBindings.delete(widget);
  });
};

export const ensureKuusiSlidesChrome = (
  widget: SlidesChromeOwner,
  host: HTMLElement,
  manager: SlidesSettingsManager,
): void => {
  applySlidesAppearance(host, manager.settings);
  mountSlidesHeader(widget, host, manager);
};
