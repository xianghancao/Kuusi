import {
  buildTitleSlideMarkdown,
  parseSlidesDeckMeta,
  type SlidesDeckMeta,
} from "./slidesDeck";
import {
  toSlideUnit,
  type SlidesSlideUnit,
} from "./slidesSemantics";
import {
  slideStartsWithH1,
  splitMarkdownIntoSlides,
  type MarkdownSlideSplitMode,
} from "./splitMarkdownSlides";

export type SlidesDeckModel = {
  meta: SlidesDeckMeta;
  slides: SlidesSlideUnit[];
  /** True when a title slide was injected from YAML front matter. */
  injectedTitlePage: boolean;
};

const withOutlineLayout = (unit: SlidesSlideUnit): SlidesSlideUnit => {
  if (unit.layout !== "default") {
    return unit;
  }
  if (slideStartsWithH1(unit.source)) {
    return { ...unit, layout: "title" };
  }
  return unit;
};

export const buildSlidesDeckModel = (
  source: string,
  splitMode: MarkdownSlideSplitMode,
): SlidesDeckModel => {
  const { meta } = parseSlidesDeckMeta(source);
  const rawSlides = splitMarkdownIntoSlides(source, splitMode);

  let slides = rawSlides.map((raw) => withOutlineLayout(toSlideUnit(raw)));

  const hasH1Title = slides.some((slide) => slide.layout === "title");
  const wantTitlePage =
    Boolean(meta.title) && meta.titlePage !== false && !hasH1Title;

  if (wantTitlePage) {
    const injected = toSlideUnit(buildTitleSlideMarkdown(meta));
    slides = [injected, ...slides];
  }

  if (slides.length === 0) {
    slides = [{ source: "", layout: "default" }];
  }

  return { meta, slides, injectedTitlePage: wantTitlePage };
};
