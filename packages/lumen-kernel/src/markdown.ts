import type { JSONContent } from "./types";

const textToInlineContent = (text: string): JSONContent[] | undefined => {
  const content: JSONContent[] = [];
  const inlineMathPattern = /\$(?!\$)([^$\n]+?)\$/g;
  let cursor = 0;

  for (const match of text.matchAll(inlineMathPattern)) {
    const index = match.index ?? 0;
    const latex = match[1]?.trim();

    if (index > cursor) {
      content.push({ type: "text", text: text.slice(cursor, index) });
    }

    if (latex) {
      content.push({ type: "inlineMath", attrs: { latex } });
    } else {
      content.push({ type: "text", text: match[0] });
    }

    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    content.push({ type: "text", text: text.slice(cursor) });
  }

  return content.length ? content : undefined;
};

const paragraphFromMarkdown = (text: string): JSONContent => ({
  type: "paragraph",
  content: textToInlineContent(text),
});

export const isMarkdownLike = (text: string) =>
  /(^|\n)(#{1,6}\s|[-*]\s|\d+\.\s|- \[[ xX]\]\s|```|\$\$|!\[[^\]]*\]\([^)]+\))/.test(
    text,
  ) || /\$(?!\$)[^$\n]+?\$/.test(text);

export const markdownToTiptapContent = (markdown: string): JSONContent[] => {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: JSONContent[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    const fenceMatch = trimmed.match(/^```(\w+)?\s*$/);

    if (fenceMatch) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index]?.trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      blocks.push({
        type: "codeBlock",
        attrs: { language: fenceMatch[1] ?? null },
        content: codeLines.length
          ? [{ type: "text", text: codeLines.join("\n") }]
          : undefined,
      });
      continue;
    }

    if (trimmed.startsWith("$$")) {
      const latexLines = [trimmed.replace(/^\$\$/, "")];

      while (!latexLines[latexLines.length - 1]?.includes("$$") && index + 1 < lines.length) {
        index += 1;
        latexLines.push(lines[index] ?? "");
      }

      blocks.push({
        type: "blockMath",
        attrs: { latex: latexLines.join("\n").replace(/\$\$$/, "").trim() },
      });
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

    if (imageMatch?.[2]) {
      blocks.push({
        type: "image",
        attrs: {
          alt: imageMatch[1] ?? "",
          src: imageMatch[2],
        },
      });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch?.[2]) {
      blocks.push({
        type: "heading",
        attrs: { level: Math.min(6, headingMatch[1]?.length ?? 1) },
        content: textToInlineContent(headingMatch[2]),
      });
      continue;
    }

    const taskMatch = trimmed.match(/^- \[([ xX])\]\s+(.+)$/);

    if (taskMatch?.[2]) {
      const items: JSONContent[] = [];

      while (index < lines.length) {
        const currentMatch = lines[index]?.trim().match(/^- \[([ xX])\]\s+(.+)$/);

        if (!currentMatch?.[2]) {
          index -= 1;
          break;
        }

        items.push({
          type: "taskItem",
          attrs: { checked: currentMatch[1]?.toLowerCase() === "x" },
          content: [paragraphFromMarkdown(currentMatch[2])],
        });
        index += 1;
      }

      blocks.push({ type: "taskList", content: items });
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);

    if (bulletMatch?.[1]) {
      const items: JSONContent[] = [];

      while (index < lines.length) {
        const currentMatch = lines[index]?.trim().match(/^[-*]\s+(.+)$/);

        if (!currentMatch?.[1]) {
          index -= 1;
          break;
        }

        items.push({
          type: "listItem",
          content: [paragraphFromMarkdown(currentMatch[1])],
        });
        index += 1;
      }

      blocks.push({ type: "bulletList", content: items });
      continue;
    }

    blocks.push(paragraphFromMarkdown(trimmed));
  }

  return blocks.length ? blocks : [paragraphFromMarkdown(markdown)];
};
