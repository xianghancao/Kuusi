/**
 * Presentation semantics for Markdown Slides.
 *
 * Directives (HTML comments at the top of a slide):
 *   <!-- _class: title -->
 *   <!-- _class: section -->
 *   <!-- _class: columns -->
 *   <!-- _footer: false -->
 *
 * Containers (preprocessed before Markdown render):
 *   ::: block Title
 *   body…
 *   :::
 *
 *   ::: alert Title
 *   ::: example Title
 *   ::: columns / ::: column  (two-up layout)
 */

export type SlidesLayoutKind = "default" | "title" | "section" | "columns";

export type SlidesSlideDirectives = {
  layout: SlidesLayoutKind;
  footer?: boolean;
};

export type SlidesSlideUnit = {
  /** Markdown / HTML after directive stripping (may still contain :::). */
  source: string;
  layout: SlidesLayoutKind;
  footer?: boolean;
};

const DIRECTIVE_RE =
  /^<!--\s*_?(class|layout|footer|paginate)\s*:\s*([^>]+?)\s*-->\s*$/i;

const isLayoutKind = (value: string): value is SlidesLayoutKind =>
  value === "default" ||
  value === "title" ||
  value === "section" ||
  value === "columns";

const parseFooterFlag = (raw: string): boolean | undefined => {
  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "yes" || value === "on" || value === "1") {
    return true;
  }
  if (value === "false" || value === "no" || value === "off" || value === "0") {
    return false;
  }
  return undefined;
};

/** Pull Marp-style HTML comment directives from the top of a slide. */
export const parseSlideDirectives = (
  source: string,
): { directives: SlidesSlideDirectives; body: string } => {
  const lines = source.split(/\r?\n/);
  let layout: SlidesLayoutKind = "default";
  let footer: boolean | undefined;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const match = line.match(DIRECTIVE_RE);
    if (!match) {
      break;
    }

    const key = match[1].toLowerCase();
    const value = match[2].trim().toLowerCase();

    if (key === "class" || key === "layout") {
      const normalized =
        value === "titlepage" || value === "title-page" ? "title" : value;
      if (isLayoutKind(normalized)) {
        layout = normalized;
      }
    } else if (key === "footer" || key === "paginate") {
      footer = parseFooterFlag(value);
    }

    index += 1;
  }

  while (index < lines.length && !lines[index].trim()) {
    index += 1;
  }

  return {
    directives: { layout, footer },
    body: lines.slice(index).join("\n"),
  };
};

export const toSlideUnit = (raw: string): SlidesSlideUnit => {
  const { directives, body } = parseSlideDirectives(raw);
  return {
    source: body,
    layout: directives.layout,
    footer: directives.footer,
  };
};

type ContainerKind = "block" | "alert" | "example" | "columns" | "column";

type ContainerNode = {
  kind: ContainerKind;
  title: string;
  body: string;
};

const OPEN_RE = /^:::\s*(block|alert|example|columns|column)(?:\s+(.*))?$/i;

/** Survives Markdown parsing; replaced with rendered widget HTML afterward. */
const widgetPlaceholder = (index: number): string =>
  `<div data-kuusi-slide-widget="${index}"></div>`;

const WIDGET_PLACEHOLDER_RE =
  /<div\s+data-kuusi-slide-widget="(\d+)"\s*><\/div>/gi;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Read a fenced ::: container with nesting (e.g. columns → column).
 * Code fences are ignored so `:::` inside fenced code does not close early.
 */
const readContainer = (
  sourceLines: string[],
  startKind: ContainerKind,
  startTitle: string,
  startIndex: number,
): { node: ContainerNode; nextIndex: number } | null => {
  const bodyLines: string[] = [];
  let j = startIndex + 1;
  let fence: string | null = null;
  let depth = 1;

  while (j < sourceLines.length) {
    const line = sourceLines[j];
    const trimmed = line.trim();

    if (fence !== null) {
      bodyLines.push(line);
      if (
        trimmed.startsWith(fence[0]) &&
        new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(line)
      ) {
        fence = null;
      }
      j += 1;
      continue;
    }

    const fenceOpen = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceOpen) {
      fence = fenceOpen[2];
      bodyLines.push(line);
      j += 1;
      continue;
    }

    if (trimmed === ":::") {
      depth -= 1;
      if (depth === 0) {
        return {
          node: {
            kind: startKind,
            title: startTitle,
            body: bodyLines.join("\n"),
          },
          nextIndex: j + 1,
        };
      }
      bodyLines.push(line);
      j += 1;
      continue;
    }

    if (OPEN_RE.test(trimmed)) {
      depth += 1;
    }

    bodyLines.push(line);
    j += 1;
  }

  return null;
};

/**
 * Expand ::: containers into HTML wrappers. Inner Markdown is rendered via
 * `renderMarkdown`. Widgets are injected through placeholders so nested
 * columns HTML is never split by a fragile outer-`</div>` regex.
 */
export const expandPresentationContainers = async (
  source: string,
  renderMarkdown: (markdown: string) => Promise<string>,
): Promise<string> => {
  const lines = source.split(/\r?\n/);
  const output: string[] = [];
  const widgets: string[] = [];
  let i = 0;

  const renderBodyHtml = async (markdown: string): Promise<string> => {
    if (!markdown.trim()) {
      return "";
    }
    // Nested ::: (e.g. columns → column → block) expand recursively.
    return expandPresentationContainers(markdown, renderMarkdown);
  };

  const renderContainerHtml = async (node: ContainerNode): Promise<string> => {
    if (node.kind === "columns") {
      const columnChunks = await splitColumns(node.body);
      return `<div class="jp-KuusiSlides-columns">${columnChunks.join("")}</div>`;
    }

    if (node.kind === "column") {
      const bodyHtml = await renderBodyHtml(node.body);
      return `<div class="jp-KuusiSlides-column">${bodyHtml}</div>`;
    }

    const kindClass =
      node.kind === "alert"
        ? "jp-KuusiSlides-block jp-KuusiSlides-block--alert"
        : node.kind === "example"
          ? "jp-KuusiSlides-block jp-KuusiSlides-block--example"
          : "jp-KuusiSlides-block jp-KuusiSlides-block--info";

    const titleHtml = node.title
      ? `<div class="jp-KuusiSlides-block-title">${escapeHtml(node.title)}</div>`
      : "";
    const bodyHtml = await renderBodyHtml(node.body);
    return `<aside class="${kindClass}">${titleHtml}<div class="jp-KuusiSlides-block-body">${bodyHtml}</div></aside>`;
  };

  const splitColumns = async (body: string): Promise<string[]> => {
    const colLines = body.split(/\r?\n/);
    const columns: string[] = [];
    let k = 0;
    let loose: string[] = [];

    const flushLoose = async (): Promise<void> => {
      const text = loose.join("\n").trim();
      loose = [];
      if (!text) {
        return;
      }
      columns.push(
        `<div class="jp-KuusiSlides-column">${await renderBodyHtml(text)}</div>`,
      );
    };

    while (k < colLines.length) {
      const open = colLines[k].trim().match(OPEN_RE);
      if (open && open[1].toLowerCase() === "column") {
        await flushLoose();
        const nested = readContainer(
          colLines,
          "column",
          (open[2] ?? "").trim(),
          k,
        );
        if (!nested) {
          loose.push(colLines[k]);
          k += 1;
          continue;
        }
        columns.push(await renderContainerHtml(nested.node));
        k = nested.nextIndex;
        continue;
      }
      loose.push(colLines[k]);
      k += 1;
    }

    await flushLoose();
    return columns;
  };

  while (i < lines.length) {
    const open = lines[i].trim().match(OPEN_RE);
    if (!open) {
      output.push(lines[i]);
      i += 1;
      continue;
    }

    const kind = open[1].toLowerCase() as ContainerKind;
    const title = (open[2] ?? "").trim();
    const parsed = readContainer(lines, kind, title, i);
    if (!parsed) {
      output.push(lines[i]);
      i += 1;
      continue;
    }

    if (output.length > 0 && output[output.length - 1].trim() !== "") {
      output.push("");
    }
    const widgetIndex = widgets.length;
    widgets.push(await renderContainerHtml(parsed.node));
    output.push(widgetPlaceholder(widgetIndex));
    output.push("");
    i = parsed.nextIndex;
  }

  const html = await renderMarkdown(output.join("\n"));
  if (widgets.length === 0) {
    return html;
  }

  return html.replace(WIDGET_PLACEHOLDER_RE, (_match, index: string) => {
    const widget = widgets[Number(index)];
    return widget ?? "";
  });
};

export const composeTitlePageHtml = (
  title: string,
  author?: string,
  date?: string,
): string => {
  const authorHtml = author
    ? `<p class="jp-KuusiSlides-titleAuthor">${escapeHtml(author)}</p>`
    : "";
  const dateHtml = date
    ? `<p class="jp-KuusiSlides-titleDate">${escapeHtml(date)}</p>`
    : "";
  return `<div class="jp-KuusiSlides-titlePage"><h1 class="jp-KuusiSlides-titleHeading">${escapeHtml(title)}</h1>${authorHtml}${dateHtml}</div>`;
};
