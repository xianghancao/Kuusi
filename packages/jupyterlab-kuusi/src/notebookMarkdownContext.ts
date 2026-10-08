import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { INotebookModel } from "@jupyterlab/notebook";

export type NotebookContext = DocumentRegistry.IContext<INotebookModel>;

const joinSource = (source: unknown): string =>
  Array.isArray(source) ? source.join("") : String(source ?? "");

const notebookLanguage = (model: INotebookModel): string => {
  const metadata = model.getMetadata?.("language_info") as
    | { name?: string }
    | undefined;
  const kernelspec = model.getMetadata?.("kernelspec") as
    | { language?: string }
    | undefined;

  return metadata?.name ?? kernelspec?.language ?? "";
};

const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/gu;

const fenced = (text: string, language = ""): string => {
  const body = text.replace(ANSI_PATTERN, "").replace(/\s+$/u, "");
  const fence = body.includes("```") ? "~~~~" : "```";
  return `${fence}${language}\n${body}\n${fence}`;
};

const svgDataUri = (svg: string): string =>
  `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

/** Richest renderable representation of one output bundle, as markdown. */
const mimeBundleToMarkdown = (data: Record<string, unknown>): string => {
  const text = (mime: string): string => joinSource(data[mime]);

  for (const mime of ["image/png", "image/jpeg"]) {
    if (data[mime]) {
      return `![output](data:${mime};base64,${text(mime).replace(/\s+/gu, "")})`;
    }
  }

  if (data["image/svg+xml"]) {
    return `![output](${svgDataUri(text("image/svg+xml"))})`;
  }

  if (data["text/html"]) {
    // Blank lines would end the raw HTML block in markdown.
    return `<div>\n${text("text/html").replace(/\n\s*\n/gu, "\n")}\n</div>`;
  }

  if (data["text/markdown"]) {
    return text("text/markdown");
  }

  if (data["text/latex"]) {
    return `$$\n${text("text/latex").replace(/^\$+|\$+$/gu, "")}\n$$`;
  }

  if (data["text/plain"]) {
    return fenced(text("text/plain"));
  }

  return "";
};

type ArticleOutput = {
  output_type?: string;
  name?: string;
  text?: unknown;
  data?: Record<string, unknown>;
  ename?: string;
  evalue?: string;
  traceback?: unknown;
};

const outputToMarkdown = (output: ArticleOutput): string => {
  switch (output.output_type) {
    case "stream":
      return fenced(joinSource(output.text));
    case "execute_result":
    case "display_data":
      return mimeBundleToMarkdown(output.data ?? {});
    case "error":
      return fenced(
        Array.isArray(output.traceback) && output.traceback.length > 0
          ? joinSource(output.traceback.join("\n"))
          : `${output.ename ?? "Error"}: ${output.evalue ?? ""}`,
      );
    default:
      return "";
  }
};

/**
 * Flatten a notebook into one markdown document so the Article view can reuse
 * the exact Markdown Article renderer (same DOM, same capsule menus).
 * Code cells become fenced blocks followed by their outputs; raw cells become
 * plain preformatted blocks.
 */
export type NotebookArticleLayout = {
  markdown: string;
  /**
   * 0-based line in `markdown` where each cell's content starts, or -1 when
   * the cell contributes nothing (empty cell without outputs).
   */
  cellStarts: number[];
};

export const notebookArticleLayout = (
  model: INotebookModel,
): NotebookArticleLayout => {
  const language = notebookLanguage(model);
  const cells = ((model.toJSON() as { cells?: unknown[] } | null)?.cells ??
    []) as Array<{
    cell_type?: string;
    source?: unknown;
    outputs?: ArticleOutput[];
  }>;
  const parts: string[] = [];
  const cellStarts: number[] = [];
  let nextLine = 0;

  const push = (part: string): void => {
    parts.push(part);
    // Parts are joined by one blank line.
    nextLine += part.split("\n").length + 1;
  };

  for (const cell of cells) {
    const text = joinSource(cell.source).replace(/\s+$/u, "");
    const startLine = nextLine;

    if (cell.cell_type === "markdown" && text) {
      push(text);
    } else if (cell.cell_type === "raw" && text) {
      push(fenced(text, "text"));
    } else if (cell.cell_type === "code") {
      if (text) {
        push(fenced(text, language));
      }

      for (const output of cell.outputs ?? []) {
        const rendered = outputToMarkdown(output);

        if (rendered) {
          push(rendered);
        }
      }
    }

    cellStarts.push(nextLine > startLine ? startLine : -1);
  }

  return {
    markdown: parts.length > 0 ? `${parts.join("\n\n")}\n` : "",
    cellStarts,
  };
};

export const notebookToArticleMarkdown = (model: INotebookModel): string =>
  notebookArticleLayout(model).markdown;

/** Cell whose generated markdown contains a 0-based line (-1 if none). */
export const notebookCellForArticleLine = (
  layout: NotebookArticleLayout,
  line: number,
): number => {
  let cell = -1;

  layout.cellStarts.forEach((start, index) => {
    if (start >= 0 && start <= line) {
      cell = index;
    }
  });

  return cell;
};

/**
 * Context whose model reads as markdown text (`toString`) so Markdown-only
 * renderers (Article, Slides) can show a notebook. Everything else — path,
 * readiness, signals — is forwarded to the real notebook context and model.
 */
export const createNotebookMarkdownContext = (
  context: NotebookContext,
): DocumentRegistry.IContext<DocumentRegistry.IModel> => {
  const model = new Proxy(context.model, {
    get: (target, prop) => {
      if (prop === "toString") {
        return () => notebookToArticleMarkdown(target);
      }

      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return new Proxy(context, {
    get: (target, prop) =>
      prop === "model" ? model : Reflect.get(target, prop, target),
  }) as unknown as DocumentRegistry.IContext<DocumentRegistry.IModel>;
};
