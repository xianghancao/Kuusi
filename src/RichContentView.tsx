import { useEffect, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import type { Editor } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { ListStyleAttributes } from "./tiptapExtensions";

const lowlight = createLowlight(common);
const blockMathSourcePattern = /^\s*\$\$\s*([\s\S]*?)\s*\$\$\s*$/;
const inlineMathSourcePattern =
  /(^|[^$])\$(?!\$)(?!\d+\$)([^$\n]+?)\$(?!\$)(?!\d)/g;

type MathNodeLike = {
  attrs: {
    latex?: string;
  };
  nodeSize: number;
};

type MathSourceRange = {
  from: number;
  to: number;
};

const rangesOverlap = (left: MathSourceRange, right: MathSourceRange) =>
  left.from <= right.to && right.from <= left.to;

const isSelectionInRange = (
  selection: { from: number; to: number },
  range: MathSourceRange,
) => selection.from >= range.from && selection.to <= range.to;

const findMathSourceRangeAtSelection = (editor: Editor) => {
  const { selection, doc } = editor.state;
  let range: MathSourceRange | null = null;

  doc.descendants((node, pos) => {
    if (range) {
      return false;
    }

    if (node.type.name === "paragraph") {
      const sourceMatch = node.textContent.match(blockMathSourcePattern);

      if (sourceMatch?.[1]?.trim()) {
        const blockRange = { from: pos, to: pos + node.nodeSize };

        if (isSelectionInRange(selection, blockRange)) {
          range = blockRange;
          return false;
        }
      }
    }

    if (!node.isText || !node.text?.includes("$")) {
      return;
    }

    for (const match of node.text.matchAll(inlineMathSourcePattern)) {
      const prefix = match[1] ?? "";
      const latex = match[2]?.trim();

      if (!latex || match.index === undefined) {
        continue;
      }

      const from = pos + match.index + prefix.length;
      const inlineRange = { from, to: from + latex.length + 2 };

      if (isSelectionInRange(selection, inlineRange)) {
        range = inlineRange;
        return false;
      }
    }
  });

  return range;
};

const restoreMathSource = (
  editor: Editor | null,
  node: MathNodeLike,
  pos: number,
  block = false,
) => {
  const latex = node.attrs.latex;

  if (!editor || !latex) {
    return;
  }

  const source = block ? `$$${latex}$$` : `$${latex}$`;
  const cursorPosition = pos + source.length - 1;

  editor
    .chain()
    .focus()
    .insertContentAt({ from: pos, to: pos + node.nodeSize }, source, {
      updateSelection: false,
    })
    .setTextSelection(cursorPosition)
    .run();
};

const normalizeBlockMath = (
  editor: Editor,
  protectedRange: MathSourceRange | null = null,
) => {
  const blockMath = editor.schema.nodes.blockMath;

  if (!blockMath) {
    return false;
  }

  const replacements: Array<{ from: number; to: number; latex: string }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") {
      return;
    }

    const sourceMatch = node.textContent.match(blockMathSourcePattern);

    if (sourceMatch?.[1]?.trim()) {
      const range = { from: pos, to: pos + node.nodeSize };

      if (protectedRange && rangesOverlap(range, protectedRange)) {
        return false;
      }

      replacements.push({
        from: range.from,
        to: range.to,
        latex: sourceMatch[1].trim(),
      });
      return false;
    }
  });

  if (!replacements.length) {
    return false;
  }

  const tr = editor.state.tr;

  replacements
    .slice()
    .reverse()
    .forEach(({ from, to, latex }) => {
      tr.replaceWith(from, to, blockMath.create({ latex }));
    });

  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return true;
};

const normalizeInlineMath = (
  editor: Editor,
  protectedRange: MathSourceRange | null = null,
) => {
  const inlineMath = editor.schema.nodes.inlineMath;

  if (!inlineMath) {
    return false;
  }

  const replacements: Array<{ from: number; to: number; latex: string }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text?.includes("$")) {
      return;
    }

    for (const match of node.text.matchAll(inlineMathSourcePattern)) {
      const prefix = match[1] ?? "";
      const latex = match[2]?.trim();

      if (!latex || match.index === undefined) {
        continue;
      }

      const from = pos + match.index + prefix.length;
      const range = { from, to: from + latex.length + 2 };

      if (protectedRange && rangesOverlap(range, protectedRange)) {
        continue;
      }

      replacements.push({
        from: range.from,
        to: range.to,
        latex,
      });
    }
  });

  if (!replacements.length) {
    return false;
  }

  const tr = editor.state.tr;

  replacements
    .slice()
    .reverse()
    .forEach(({ from, to, latex }) => {
      tr.replaceWith(from, to, inlineMath.create({ latex }));
    });

  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return true;
};

const normalizeMath = (
  editor: Editor,
  protectedRange: MathSourceRange | null = null,
) => normalizeBlockMath(editor, protectedRange) || normalizeInlineMath(editor, protectedRange);

const findMathNodePosition = (
  editor: Editor,
  element: Element,
  typeName: "inlineMath" | "blockMath",
  latex: string,
) => {
  const domPos = editor.view.posAtDOM(element, 0);
  const candidatePositions = [domPos, domPos - 1, domPos + 1];

  for (const pos of candidatePositions) {
    if (pos < 0) {
      continue;
    }

    const node = editor.state.doc.nodeAt(pos);

    if (node?.type.name === typeName && node.attrs.latex === latex) {
      return pos;
    }
  }

  let fallbackPosition: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (
      node.type.name === typeName &&
      node.attrs.latex === latex &&
      fallbackPosition === null
    ) {
      fallbackPosition = pos;
      return false;
    }
  });

  return fallbackPosition;
};

type RichContentViewProps = {
  content: JSONContent;
  editable?: boolean;
  onBlur?: () => void;
  onContentChange?: (content: JSONContent) => void;
  onFocus?: () => void;
};

export function RichContentView({
  content,
  editable = false,
  onBlur,
  onContentChange,
  onFocus,
}: RichContentViewProps) {
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
      }),
      ListStyleAttributes,
      TextStyle,
      Color,
      Underline,
      Link.configure({
        autolink: true,
        openOnClick: !editable,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      Highlight,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
      InlineMath.configure({
        katexOptions: {
          throwOnError: false,
        },
      }),
      BlockMath.configure({
        katexOptions: {
          displayMode: true,
          throwOnError: false,
        },
      }),
      Image.configure({
        allowBase64: true,
        inline: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
    ],
    [editable],
  );
  const editor = useEditor({
    extensions,
    content,
    editable,
    editorProps: {
      attributes: {
        class: editable
          ? "rich-content-view is-editable"
          : "rich-content-view",
      },
    },
    onBlur: ({ editor: focusedEditor }) => {
      while (normalizeMath(focusedEditor)) {
        // Keep normalizing until restored math sources settle into rendered nodes.
      }
      onContentChange?.(focusedEditor.getJSON());
      onBlur?.();
    },
    onFocus,
    onUpdate: ({ editor: updatedEditor }) => {
      const protectedRange = findMathSourceRangeAtSelection(updatedEditor);

      if (normalizeMath(updatedEditor, protectedRange)) {
        return;
      }

      onContentChange?.(updatedEditor.getJSON());
    },
    onSelectionUpdate: ({ editor: updatedEditor }) => {
      const protectedRange = findMathSourceRangeAtSelection(updatedEditor);

      if (normalizeMath(updatedEditor, protectedRange)) {
        return;
      }
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (JSON.stringify(editor.getJSON()) === JSON.stringify(content)) {
      return;
    }

    editor?.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  const restoreMathSourceFromEvent = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!editable || !editor) {
      return false;
    }

    const target = event.target instanceof Element ? event.target : null;
    const mathElement = target?.closest(
      '[data-type="inline-math"], [data-type="block-math"]',
    );

    if (!mathElement || !event.currentTarget.contains(mathElement)) {
      return false;
    }

    const latex = mathElement.getAttribute("data-latex");
    const type = mathElement.getAttribute("data-type");

    if (!latex || (type !== "inline-math" && type !== "block-math")) {
      return false;
    }

    const typeName = type === "block-math" ? "blockMath" : "inlineMath";
    const pos = findMathNodePosition(editor, mathElement, typeName, latex);

    if (pos === null) {
      return false;
    }

    const node = editor.state.doc.nodeAt(pos);

    if (!node) {
      return false;
    }

    editor.setEditable(true);
    restoreMathSource(editor, node, pos, typeName === "blockMath");
    return true;
  };

  return (
    <EditorContent
      editor={editor}
      onMouseMove={(event) => {
        if (restoreMathSourceFromEvent(event)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    />
  );
}
