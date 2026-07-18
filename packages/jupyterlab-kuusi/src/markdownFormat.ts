import type { IMarkdownCellModel } from "@jupyterlab/cells";
import type { CodeEditor } from "@jupyterlab/codeeditor";
import { LEGACY_CELL_METADATA_KEY, parseMarkdownHeading } from "kuusi-kernel";

const LIST_PREFIX_PATTERN =
  /^(?:\d+\.\s+|[-*+–]\s+(?:\[[ xX]\]\s+)?)/;

const getSelectionOffsets = (
  editor: CodeEditor.IEditor,
): { start: number; end: number } => {
  const selection = editor.getSelection();
  return {
    start: editor.getOffsetAt(selection.start),
    end: editor.getOffsetAt(selection.end),
  };
};

const setSelectionOffsets = (
  editor: CodeEditor.IEditor,
  start: number,
  end: number,
): void => {
  const startPos = editor.getPositionAt(start);
  const endPos = editor.getPositionAt(end);

  if (startPos && endPos) {
    editor.setSelection({ start: startPos, end: endPos });
  }

  editor.focus();
};

const getSelectedText = (editor: CodeEditor.IEditor): string => {
  const { start, end } = getSelectionOffsets(editor);
  return editor.model.sharedModel.getSource().slice(start, end);
};

const replaceSourceRange = (
  editor: CodeEditor.IEditor,
  start: number,
  end: number,
  text: string,
): void => {
  const source = editor.model.sharedModel.getSource();
  editor.model.sharedModel.setSource(
    `${source.slice(0, start)}${text}${source.slice(end)}`,
  );
};

const insertAtCursor = (
  editor: CodeEditor.IEditor,
  text: string,
  selectStart?: number,
  selectEnd?: number,
): void => {
  const { start, end } = getSelectionOffsets(editor);
  replaceSourceRange(editor, start, end, text);

  if (selectStart !== undefined && selectEnd !== undefined) {
    setSelectionOffsets(editor, start + selectStart, start + selectEnd);
    return;
  }

  editor.focus();
};

const isInsideWrap = (
  source: string,
  offset: number,
  before: string,
  after: string,
): boolean => {
  const windowStart = Math.max(0, offset - 240);
  const windowEnd = Math.min(source.length, offset + 240);
  const chunk = source.slice(windowStart, windowEnd);
  const relativeOffset = offset - windowStart;
  const openIndex = chunk.lastIndexOf(before, relativeOffset);

  if (openIndex < 0) {
    return false;
  }

  const closeIndex = chunk.indexOf(after, openIndex + before.length);

  if (closeIndex < 0 || closeIndex < relativeOffset) {
    return false;
  }

  return (
    relativeOffset >= openIndex + before.length && relativeOffset <= closeIndex
  );
};

const toggleWrapSelection = (
  editor: CodeEditor.IEditor,
  before: string,
  after: string,
): void => {
  const { start, end } = getSelectionOffsets(editor);
  const source = editor.model.sharedModel.getSource();
  const selected = source.slice(start, end);
  const hasWrapAroundSelection =
    source.slice(start - before.length, start) === before &&
    source.slice(end, end + after.length) === after;

  if (hasWrapAroundSelection) {
    replaceSourceRange(
      editor,
      start - before.length,
      end + after.length,
      selected,
    );
    setSelectionOffsets(
      editor,
      start - before.length,
      start - before.length + selected.length,
    );
    return;
  }

  if (!selected && isInsideWrap(source, start, before, after)) {
    const windowStart = Math.max(0, start - 240);
    const chunk = source.slice(windowStart, Math.min(source.length, start + 240));
    const relativeOffset = start - windowStart;
    const openIndex = chunk.lastIndexOf(before, relativeOffset);
    const closeIndex = chunk.indexOf(after, openIndex + before.length);
    const unwrapStart = windowStart + openIndex;
    const unwrapEnd = windowStart + closeIndex + after.length;
    const contentStart = windowStart + openIndex + before.length;
    const contentEnd = windowStart + closeIndex;
    const content = source.slice(contentStart, contentEnd);
    replaceSourceRange(editor, unwrapStart, unwrapEnd, content);
    setSelectionOffsets(editor, unwrapStart, unwrapStart + content.length);
    return;
  }

  if (!selected) {
    insertAtCursor(editor, `${before}${after}`, before.length, before.length);
    return;
  }

  replaceSourceRange(editor, start, end, `${before}${selected}${after}`);
  setSelectionOffsets(
    editor,
    start + before.length,
    start + before.length + selected.length,
  );
};

const toggleHtmlWrap = (
  editor: CodeEditor.IEditor,
  openTag: string,
  closeTag: string,
): void => {
  toggleWrapSelection(editor, openTag, closeTag);
};

const getSelectedLineRange = (
  editor: CodeEditor.IEditor,
): { startLine: number; endLine: number } => {
  const selection = editor.getSelection();
  return {
    startLine: Math.min(selection.start.line, selection.end.line),
    endLine: Math.max(selection.start.line, selection.end.line),
  };
};

const stripLinePrefix = (line: string, pattern: RegExp): string => {
  const trimmedStart = line.trimStart();
  const leading = line.slice(0, line.length - trimmedStart.length);
  return `${leading}${trimmedStart.replace(pattern, "")}`;
};

const togglePrefixLines = (
  editor: CodeEditor.IEditor,
  prefix: string,
  stripPattern: RegExp,
  matches: (trimmedLine: string) => boolean,
): void => {
  const { startLine, endLine } = getSelectedLineRange(editor);
  const source = editor.model.sharedModel.getSource();
  const lines = source.split("\n");
  const selectedLines = lines.slice(startLine, endLine + 1);
  const allMatch = selectedLines.every((line) =>
    matches(line.trimStart()),
  );

  for (let line = startLine; line <= endLine; line += 1) {
    const lineText = lines[line] ?? "";

    if (allMatch) {
      lines[line] = stripLinePrefix(lineText, stripPattern);
      continue;
    }

    const trimmedStart = lineText.trimStart();
    const leading = lineText.slice(0, lineText.length - trimmedStart.length);
    const content = stripLinePrefix(lineText, stripPattern).slice(leading.length);
    lines[line] = `${leading}${prefix}${content.trimStart()}`;
  }

  editor.model.sharedModel.setSource(lines.join("\n"));
  editor.focus();
};

const applyListStyle = (
  editor: CodeEditor.IEditor,
  prefix: string,
): void => {
  const { startLine, endLine } = getSelectedLineRange(editor);
  const source = editor.model.sharedModel.getSource();
  const lines = source.split("\n");
  let index = 1;

  for (let line = startLine; line <= endLine; line += 1) {
    const lineText = lines[line] ?? "";
    const trimmedStart = lineText.trimStart();
    const leading = lineText.slice(0, lineText.length - trimmedStart.length);
    const content = trimmedStart.replace(LIST_PREFIX_PATTERN, "").trimStart();

    if (prefix === "numbered") {
      lines[line] = `${leading}${index}. ${content}`;
      index += 1;
      continue;
    }

    lines[line] = `${leading}${prefix}${content}`;
  }

  editor.model.sharedModel.setSource(lines.join("\n"));
  editor.focus();
};

const getHeadingLevel = (line: string): number | null => {
  const match = line.trimStart().match(/^(#{1,6})(?:\s+(.*))?$/);
  return match?.[1] ? match[1].length : null;
};

const applyHeading = (editor: CodeEditor.IEditor, level: number): void => {
  const { startLine, endLine } = getSelectedLineRange(editor);
  const source = editor.model.sharedModel.getSource();
  const lines = source.split("\n");

  for (let line = startLine; line <= endLine; line += 1) {
    const lineText = lines[line] ?? "";
    const trimmedStart = lineText.trimStart();
    const leading = lineText.slice(0, lineText.length - trimmedStart.length);
    const currentLevel = getHeadingLevel(lineText);
    const content = stripLinePrefix(lineText, /^#+\s*/).slice(leading.length);

    if (currentLevel === level) {
      lines[line] = `${leading}${content.trimStart()}`;
      continue;
    }

    lines[line] = `${leading}${"#".repeat(level)} ${content.trimStart()}`;
  }

  editor.model.sharedModel.setSource(lines.join("\n"));
  editor.focus();
};

const readCellKuusiMetadata = (
  cell: IMarkdownCellModel,
): Record<string, unknown> | null => {
  const kuusi = cell.getMetadata("kuusi");
  if (kuusi && typeof kuusi === "object") {
    return kuusi as Record<string, unknown>;
  }

  const legacy = cell.getMetadata(LEGACY_CELL_METADATA_KEY);
  if (legacy && typeof legacy === "object") {
    return legacy as Record<string, unknown>;
  }

  return null;
};

export const getMetadataOutlineHeadingLevel = (
  cell: IMarkdownCellModel,
): number | null => {
  const kuusi = readCellKuusiMetadata(cell);

  if (!kuusi) {
    return null;
  }

  const level = kuusi.headingLevel;

  if (typeof level !== "number" || level < 1 || level > 6) {
    return null;
  }

  return level;
};

const clearMetadataOutlineHeading = (cell: IMarkdownCellModel): void => {
  const kuusi = readCellKuusiMetadata(cell);

  if (!kuusi || typeof kuusi.headingLevel !== "number") {
    return;
  }

  const next = { ...kuusi };
  delete next.headingLevel;

  if (Object.keys(next).length === 0) {
    cell.deleteMetadata("kuusi");
  } else {
    cell.setMetadata("kuusi", next);
  }
};

export const applyOutlineHeading = (
  editor: CodeEditor.IEditor,
  cell: IMarkdownCellModel,
  level: number,
): void => {
  const source = editor.model.sharedModel.getSource();
  const markdownHeading = parseMarkdownHeading(source.trim());
  const metadataLevel = getMetadataOutlineHeadingLevel(cell);
  const effectiveLevel = markdownHeading?.level ?? metadataLevel;

  // Prefer markdown source as the single source of truth while editing.
  clearMetadataOutlineHeading(cell);

  // Metadata-only heading at this level → toggle off (leave empty / plain source).
  if (effectiveLevel === level && !markdownHeading) {
    editor.focus();
    return;
  }

  // Write / update / toggle `#` markers so the change is visible in the editor.
  applyHeading(editor, level);
};

const clearFormatting = (editor: CodeEditor.IEditor): void => {
  const { start, end } = getSelectionOffsets(editor);
  let text = editor.model.sharedModel.getSource().slice(start, end);

  if (!text) {
    return;
  }

  const patterns: Array<[RegExp, string]> = [
    [/\*\*(.+?)\*\*/g, "$1"],
    [/\*(.+?)\*/g, "$1"],
    [/~~(.+?)~~/g, "$1"],
    [/`([^`]+)`/g, "$1"],
    [/<u>(.*?)<\/u>/g, "$1"],
    [/<mark>(.*?)<\/mark>/g, "$1"],
    [/<span style="color:[^"]*">(.*?)<\/span>/g, "$1"],
    [/<a [^>]*>(.*?)<\/a>/g, "$1"],
  ];

  patterns.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  replaceSourceRange(editor, start, end, text);
  setSelectionOffsets(editor, start, start + text.length);
};

const makeTableRow = (cols: number, fill: string): string =>
  `| ${Array.from({ length: cols }, () => fill).join(" | ")} |`;

export const buildMarkdownTable = (rows: number, cols: number): string => {
  const safeRows = Math.max(1, Math.min(rows, 20));
  const safeCols = Math.max(1, Math.min(cols, 20));
  const lines = [makeTableRow(safeCols, " ")];

  if (safeRows > 1) {
    lines.push(makeTableRow(safeCols, "---"));
  }

  for (let row = 2; row < safeRows; row += 1) {
    lines.push(makeTableRow(safeCols, " "));
  }

  return `\n${lines.join("\n")}\n`;
};

export const DEFAULT_HTML_IMAGE_WIDTH = 400;
export const DEFAULT_HTML_IMAGE_HEIGHT = 300;
export const DEFAULT_LINK_URL = "https://";

export const buildHtmlImageSnippet = (
  alt: string,
  width = DEFAULT_HTML_IMAGE_WIDTH,
  height = DEFAULT_HTML_IMAGE_HEIGHT,
): string =>
  `<img src="${DEFAULT_LINK_URL}" alt="${alt}" width="${width}" height="${height}" />`;

export const buildHtmlLinkSnippet = (label: string): string =>
  `<a href="${DEFAULT_LINK_URL}">${label}</a>`;

export const MarkdownFormat = {
  bold: (editor: CodeEditor.IEditor) => toggleWrapSelection(editor, "**", "**"),
  italic: (editor: CodeEditor.IEditor) => toggleWrapSelection(editor, "*", "*"),
  underline: (editor: CodeEditor.IEditor) =>
    toggleHtmlWrap(editor, "<u>", "</u>"),
  strikethrough: (editor: CodeEditor.IEditor) =>
    toggleWrapSelection(editor, "~~", "~~"),
  inlineCode: (editor: CodeEditor.IEditor) =>
    toggleWrapSelection(editor, "`", "`"),
  highlight: (editor: CodeEditor.IEditor) =>
    toggleHtmlWrap(editor, "<mark>", "</mark>"),
  color: (editor: CodeEditor.IEditor, color: string) =>
    toggleHtmlWrap(
      editor,
      `<span style="color:${color}">`,
      "</span>",
    ),
  clearColor: (editor: CodeEditor.IEditor) => {
    const { start, end } = getSelectionOffsets(editor);
    const source = editor.model.sharedModel.getSource();
    const selected = source.slice(start, end);
    const stripped = selected.replace(
      /<span style="color:[^"]*">([\s\S]*?)<\/span>/g,
      "$1",
    );

    if (stripped !== selected) {
      replaceSourceRange(editor, start, end, stripped);
      setSelectionOffsets(editor, start, start + stripped.length);
      return;
    }

    const windowStart = Math.max(0, start - 160);
    const chunk = source.slice(windowStart, Math.min(source.length, start + 160));
    const relativeOffset = start - windowStart;
    const match = chunk.slice(0, relativeOffset).match(/<span style="color:[^"]*">$/);

    if (!match) {
      return;
    }

    const openIndex = windowStart + relativeOffset - match[0].length;
    const closeIndex = source.indexOf("</span>", start);

    if (closeIndex < 0) {
      return;
    }

    const contentStart = openIndex + match[0].length;
    const content = source.slice(contentStart, closeIndex);
    replaceSourceRange(editor, openIndex, closeIndex + "</span>".length, content);
    setSelectionOffsets(editor, openIndex, openIndex + content.length);
  },
  blockQuote: (editor: CodeEditor.IEditor) =>
    togglePrefixLines(
      editor,
      "> ",
      /^>\s+/,
      (line) => line.startsWith("> "),
    ),
  heading1: (editor: CodeEditor.IEditor) => applyHeading(editor, 1),
  heading2: (editor: CodeEditor.IEditor) => applyHeading(editor, 2),
  heading3: (editor: CodeEditor.IEditor) => applyHeading(editor, 3),
  heading4: (editor: CodeEditor.IEditor) => applyHeading(editor, 4),
  heading5: (editor: CodeEditor.IEditor) => applyHeading(editor, 5),
  heading6: (editor: CodeEditor.IEditor) => applyHeading(editor, 6),
  bulletedList: (editor: CodeEditor.IEditor) =>
    applyListStyle(editor, "- "),
  dashedList: (editor: CodeEditor.IEditor) =>
    applyListStyle(editor, "– "),
  numberedList: (editor: CodeEditor.IEditor) =>
    applyListStyle(editor, "numbered"),
  checkList: (editor: CodeEditor.IEditor) =>
    applyListStyle(editor, "- [ ] "),
  codeBlock: (editor: CodeEditor.IEditor) => {
    const snippet = "\n```\n\n```\n";
    insertAtCursor(editor, snippet, 5, 5);
  },
  clearFormatting,
  table: (editor: CodeEditor.IEditor, rows = 3, cols = 2) =>
    insertAtCursor(editor, buildMarkdownTable(rows, cols)),
  imageMarkdown: (editor: CodeEditor.IEditor) => {
    const alt = getSelectedText(editor) || "image";
    const snippet = `![${alt}](${DEFAULT_LINK_URL})`;
    const urlStart = snippet.indexOf(DEFAULT_LINK_URL);
    insertAtCursor(
      editor,
      snippet,
      urlStart,
      urlStart + DEFAULT_LINK_URL.length,
    );
  },
  imageHtml: (editor: CodeEditor.IEditor) => {
    const alt = getSelectedText(editor) || "image";
    const snippet = buildHtmlImageSnippet(alt);
    const urlStart = snippet.indexOf(DEFAULT_LINK_URL);
    insertAtCursor(
      editor,
      snippet,
      urlStart,
      urlStart + DEFAULT_LINK_URL.length,
    );
  },
  linkMarkdown: (editor: CodeEditor.IEditor) => {
    const label = getSelectedText(editor) || "link";
    const snippet = `[${label}](${DEFAULT_LINK_URL})`;
    const urlStart = snippet.indexOf(DEFAULT_LINK_URL);
    insertAtCursor(
      editor,
      snippet,
      urlStart,
      urlStart + DEFAULT_LINK_URL.length,
    );
  },
  linkHtml: (editor: CodeEditor.IEditor) => {
    const label = getSelectedText(editor) || "link";
    const snippet = buildHtmlLinkSnippet(label);
    const urlStart = snippet.indexOf(DEFAULT_LINK_URL);
    insertAtCursor(
      editor,
      snippet,
      urlStart,
      urlStart + DEFAULT_LINK_URL.length,
    );
  },
};
