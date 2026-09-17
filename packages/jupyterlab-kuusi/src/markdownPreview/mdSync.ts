import type { MarkdownViewer } from "@jupyterlab/markdownviewer";
import type { IMarkdownParser, IRenderMime } from "@jupyterlab/rendermime";
import { TableOfContentsUtils } from "@jupyterlab/toc";
import type { IMarkdownHeading } from "@jupyterlab/toc/lib/utils/markdown";

export type MdSyncContext = {
  parser: IMarkdownParser | null;
  sanitizer: IRenderMime.ISanitizer;
};

type HeadingAnchor = {
  heading: IMarkdownHeading;
  element: HTMLElement;
  top: number;
};

const PREVIEW_SCROLL_PADDING_PX = 24;
const PREVIEW_ANCHOR_RATIO = 0.35;

const findScrollHost = (node: HTMLElement): HTMLElement => {
  let current: HTMLElement | null = node;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;

    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return node;
};

const getRenderedRoot = (viewer: MarkdownViewer): HTMLElement | null => {
  const root = viewer.renderer.node.querySelector(".jp-RenderedMarkdown");

  return root instanceof HTMLElement ? root : null;
};

const waitForRendered = async (viewer: MarkdownViewer): Promise<void> => {
  await viewer.ready;

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      viewer.rendered.disconnect(onRendered);
      resolve();
    }, 1500);

    const onRendered = (): void => {
      window.clearTimeout(timeout);
      viewer.rendered.disconnect(onRendered);
      resolve();
    };

    viewer.rendered.connect(onRendered);
  });
};

const getElementScrollTop = (
  scrollHost: HTMLElement,
  element: HTMLElement,
): number => {
  const hostRect = scrollHost.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  return elementRect.top - hostRect.top + scrollHost.scrollTop;
};

const resolveHeadingElement = async (
  root: HTMLElement,
  heading: IMarkdownHeading,
  ctx: MdSyncContext,
): Promise<HTMLElement | null> => {
  if (!ctx.parser) {
    return null;
  }

  const elementId = await TableOfContentsUtils.Markdown.getHeadingId(
    ctx.parser,
    heading.raw,
    heading.level,
    ctx.sanitizer,
  );

  if (!elementId) {
    return null;
  }

  const attribute =
    ctx.sanitizer.allowNamedProperties ?? false ? "id" : "data-jupyter-id";
  const selector = `h${heading.level}[${attribute}="${CSS.escape(elementId)}"]`;
  const element = root.querySelector(selector);

  return element instanceof HTMLElement ? element : null;
};

const buildHeadingAnchors = async (
  viewer: MarkdownViewer,
  source: string,
  ctx: MdSyncContext,
): Promise<HeadingAnchor[]> => {
  const root = getRenderedRoot(viewer);

  if (!root) {
    return [];
  }

  const headings = await TableOfContentsUtils.Markdown.parseHeadings(
    source,
    ctx.parser,
  );
  const scrollHost = findScrollHost(viewer.node);
  const anchors: HeadingAnchor[] = [];

  for (const heading of headings) {
    const element = await resolveHeadingElement(root, heading, ctx);

    if (!element) {
      continue;
    }

    anchors.push({
      heading,
      element,
      top: getElementScrollTop(scrollHost, element),
    });
  }

  return anchors;
};

const lineCount = (source: string): number =>
  Math.max(1, source.split(/\r?\n/).length);

const scrollByLineRatio = (
  scrollHost: HTMLElement,
  source: string,
  line: number,
): void => {
  const totalLines = lineCount(source);
  const ratio = line / Math.max(1, totalLines - 1);

  scrollHost.scrollTop =
    ratio * Math.max(0, scrollHost.scrollHeight - scrollHost.clientHeight);
};

export const scrollPreviewToEditorLine = async (
  viewer: MarkdownViewer,
  source: string,
  line: number,
  ctx: MdSyncContext,
): Promise<void> => {
  await waitForRendered(viewer);

  const root = getRenderedRoot(viewer);

  if (!root) {
    return;
  }

  const scrollHost = findScrollHost(viewer.node);
  const targetLine = Math.max(0, line);
  const anchors = await buildHeadingAnchors(viewer, source, ctx);

  if (anchors.length === 0) {
    scrollByLineRatio(scrollHost, source, targetLine);
    return;
  }

  let activeIndex = 0;

  for (let index = 0; index < anchors.length; index += 1) {
    if (anchors[index].heading.line <= targetLine) {
      activeIndex = index;
    }
  }

  const active = anchors[activeIndex];
  const next = anchors[activeIndex + 1];
  let targetTop = active.top;

  if (next && targetLine > active.heading.line) {
    const lineSpan = Math.max(1, next.heading.line - active.heading.line);
    const progress = Math.min(
      1,
      (targetLine - active.heading.line) / lineSpan,
    );

    targetTop = active.top + (next.top - active.top) * progress;
  } else if (targetLine > active.heading.line) {
    const totalLines = lineCount(source);
    const remainingLines = Math.max(0, totalLines - 1 - active.heading.line);
    const remainingScroll = Math.max(
      0,
      scrollHost.scrollHeight - scrollHost.clientHeight - active.top,
    );

    if (remainingLines > 0) {
      const progress = Math.min(
        1,
        (targetLine - active.heading.line) / remainingLines,
      );

      targetTop = active.top + remainingScroll * progress;
    }
  }

  scrollHost.scrollTop = Math.max(0, targetTop - PREVIEW_SCROLL_PADDING_PX);
};

export const findSourceLineFromPreview = async (
  source: string,
  viewer: MarkdownViewer,
  ctx: MdSyncContext,
): Promise<number> => {
  await waitForRendered(viewer);

  const root = getRenderedRoot(viewer);

  if (!root) {
    return 0;
  }

  const scrollHost = findScrollHost(viewer.node);
  const anchorTop =
    scrollHost.scrollTop + scrollHost.clientHeight * PREVIEW_ANCHOR_RATIO;
  const anchors = await buildHeadingAnchors(viewer, source, ctx);

  if (anchors.length === 0) {
    const totalLines = lineCount(source);
    const ratio =
      scrollHost.scrollTop /
      Math.max(1, scrollHost.scrollHeight - scrollHost.clientHeight);

    return Math.min(
      totalLines - 1,
      Math.max(0, Math.round(ratio * (totalLines - 1))),
    );
  }

  let activeIndex = 0;

  for (let index = 0; index < anchors.length; index += 1) {
    if (anchors[index].top <= anchorTop) {
      activeIndex = index;
    }
  }

  const active = anchors[activeIndex];
  const next = anchors[activeIndex + 1];

  if (!next || anchorTop <= active.top) {
    return active.heading.line;
  }

  const spanTop = next.top - active.top;

  if (spanTop <= 0) {
    return active.heading.line;
  }

  const progress = Math.min(1, Math.max(0, (anchorTop - active.top) / spanTop));
  const lineSpan = Math.max(1, next.heading.line - active.heading.line);

  return Math.min(
    lineCount(source) - 1,
    Math.max(0, Math.round(active.heading.line + lineSpan * progress)),
  );
};
