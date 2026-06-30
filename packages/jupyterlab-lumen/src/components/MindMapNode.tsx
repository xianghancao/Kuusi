import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Extension, type Editor } from "@tiptap/core";
import {
  Handle,
  NodeResizeControl,
  Position,
  ResizeControlVariant,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import {
  BlockMath,
  InlineMath as BaseInlineMath,
} from "@tiptap/extension-mathematics";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { isMarkdownLike, markdownToTiptapContent } from "lumen-kernel";
import { ListStyleAttributes } from "./tiptapExtensions";

const lowlight = createLowlight(common);
const blockMathSourcePattern = /^\s*\$\$\s*([\s\S]*?)\s*\$\$\s*$/;
const inlineMathSourcePattern =
  /(^|[^$])\$(?!\$)(?!\d+\$)([^$\n]+?)\$(?!\$)(?!\d)/g;
const textColorOptions = [
  { label: "Default color", value: null },
  { label: "Blue", value: "#2f6fed" },
  { label: "Red", value: "#d92d20" },
  { label: "Orange", value: "#f79009" },
  { label: "Green", value: "#039855" },
  { label: "Purple", value: "#7a5af8" },
  { label: "Teal", value: "#0e9384" },
  { label: "Gray", value: "#667085" },
];
const InlineMath = BaseInlineMath.extend({
  addInputRules() {
    return [];
  },
});

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

export type MindMapNodeData = Record<string, unknown> & {
  content: JSONContent;
  childCount: number;
  isCollapsed: boolean;
  isEditing: boolean;
  isSelected: boolean;
  onBlur: () => void;
  onEdit: () => void;
  onFocus: () => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onResizeStart: () => void;
  onToggleCollapse: () => void;
  onContentChange: (content: JSONContent) => void;
};

const hasImageFiles = (dataTransfer: DataTransfer) =>
  Array.from(dataTransfer.files).some((file) => file.type.startsWith("image/")) ||
  Array.from(dataTransfer.items).some(
    (item) => item.kind === "file" && item.type.startsWith("image/"),
  );

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

const normalizeWebUrl = (url: string) =>
  /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`;

const focusEditorAtEnd = (editor: Editor | null) => {
  if (!editor) {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (editor.isDestroyed) {
        return;
      }

      const endPosition = editor.state.doc.content.size;
      editor.commands.setTextSelection(endPosition);
      editor.commands.focus();
    });
  });
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

const MathSourceDecorations = Extension.create({
  name: "mathSourceDecorations",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (node.type.name === "paragraph") {
                const sourceMatch = node.textContent.match(blockMathSourcePattern);

                if (sourceMatch?.[1]?.trim()) {
                  decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      class: "math-source-block",
                    }),
                  );
                  return false;
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

                decorations.push(
                  Decoration.inline(from, from + latex.length + 2, {
                    class: "math-source-inline",
                  }),
                );
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

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
        return;
      }

      replacements.push({
        from: range.from,
        to: range.to,
        latex: sourceMatch[1].trim(),
      });
      return false;
    }

    const child = node.childCount === 1 ? node.child(0) : null;
    const latex =
      child?.type.name === "inlineMath" && typeof child.attrs.latex === "string"
        ? child.attrs.latex.trim()
        : "";

    if (latex.startsWith("$")) {
      replacements.push({
        from: pos,
        to: pos + node.nodeSize,
        latex: latex.replace(/^\$+|\$+$/g, "").trim(),
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

const findBlockMathSourceCursorPosition = (
  editor: Editor,
  insertPosition: number,
) => {
  let cursorPosition: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph" || node.textContent !== "$$$$") {
      return;
    }

    const distance = Math.abs(pos - insertPosition);

    if (distance < closestDistance) {
      closestDistance = distance;
      cursorPosition = pos + 3;
    }
  });

  return cursorPosition;
};

const insertTableShortcut = (editor: Editor | null, event: KeyboardEvent) => {
  if (!editor || event.key !== " ") {
    return false;
  }

  const { state } = editor;
  const { $from } = state.selection;

  if (!$from.parent.isTextblock) {
    return false;
  }

  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset);

  if (!textBeforeCursor.endsWith("|||")) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  editor
    .chain()
    .focus()
    .deleteRange({ from: state.selection.from - 3, to: state.selection.from })
    .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
    .run();
  return true;
};

export const MindMapNode = memo(
  ({ data }: NodeProps<Node<MindMapNodeData, "mindMapNode">>) => {
    const editorRef = useRef<Editor | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const attachmentInputRef = useRef<HTMLInputElement | null>(null);
    const addChildRef = useRef(data.onAddChild);
    const addSiblingRef = useRef(data.onAddSibling);
    const editNodeRef = useRef(data.onEdit);
    const isEditingMathSourceRef = useRef(false);
    const focusNodeRef = useRef(data.onFocus);
    const [isImageDragOver, setIsImageDragOver] = useState(false);
    const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false);
    const extensions = useMemo(
      () => [
        StarterKit.configure({
          codeBlock: false,
        }),
        ListStyleAttributes,
        MathSourceDecorations,
        TextStyle,
        Color,
        Underline,
        Link.configure({
          autolink: true,
          openOnClick: false,
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
          resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
        InlineMath.configure({
          onClick: (node, pos) => {
            isEditingMathSourceRef.current = true;
            editNodeRef.current();
            restoreMathSource(editorRef.current, node, pos);
          },
          katexOptions: {
            throwOnError: false,
          },
        }),
        BlockMath.configure({
          onClick: (node, pos) => {
            isEditingMathSourceRef.current = true;
            editNodeRef.current();
            restoreMathSource(editorRef.current, node, pos, true);
          },
          katexOptions: {
            displayMode: true,
            throwOnError: false,
          },
        }),
        Image.configure({
          allowBase64: true,
          inline: false,
          resize: {
            enabled: true,
            directions: ["bottom-right"],
            minWidth: 80,
            minHeight: 60,
            alwaysPreserveAspectRatio: true,
          },
        }),
        CodeBlockLowlight.configure({
          lowlight,
        }),
      ],
      [],
    );
    const editor = useEditor({
      extensions,
      content: data.content,
      editable: data.isEditing,
      editorProps: {
        attributes: {
          class: "node-editor",
        },
        handlePaste: (_view, event) => {
          const activeEditor = editorRef.current;

          if (!activeEditor) {
            return false;
          }

          const imageFiles = Array.from(event.clipboardData?.files ?? []).filter((file) =>
            file.type.startsWith("image/"),
          );

          if (imageFiles.length) {
            event.preventDefault();
            event.stopPropagation();
            data.onEdit();
            activeEditor.setEditable(true);
            void Promise.all(imageFiles.map(readFileAsDataUrl)).then((sources) => {
              sources.forEach((src, index) => {
                activeEditor
                  .chain()
                  .focus()
                  .setImage({ src, alt: imageFiles[index]?.name ?? "Pasted image" })
                  .run();
              });
              data.onContentChange(activeEditor.getJSON());
            });
            return true;
          }

          const text = event.clipboardData?.getData("text/plain") ?? "";

          if (!text || !isMarkdownLike(text)) {
            return false;
          }

          event.preventDefault();
          event.stopPropagation();
          data.onEdit();
          activeEditor.setEditable(true);
          activeEditor.chain().focus().insertContent(markdownToTiptapContent(text)).run();
          data.onContentChange(activeEditor.getJSON());
          return true;
        },
        handleKeyDown: (_view, event) => {
          if (event.isComposing) {
            return false;
          }

          const activeEditor = editorRef.current;

          if (insertTableShortcut(editorRef.current, event)) {
            return true;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (activeEditor) {
              data.onContentChange(activeEditor.getJSON());
              activeEditor.commands.blur();
            }
            data.onBlur();
            return true;
          }

          if (event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            addChildRef.current();
            return true;
          }

          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            addSiblingRef.current();
            return true;
          }

          return false;
        },
      },
      onFocus: data.onFocus,
      onBlur: ({ editor: focusedEditor }) => {
        isEditingMathSourceRef.current = false;
        while (normalizeMath(focusedEditor)) {
          // Keep normalizing until restored math sources settle into rendered nodes.
        }
        data.onContentChange(focusedEditor.getJSON());
        data.onBlur();
      },
      onUpdate: ({ editor: updatedEditor }) => {
        const protectedRange = findMathSourceRangeAtSelection(updatedEditor);
        isEditingMathSourceRef.current = Boolean(protectedRange);

        if (normalizeMath(updatedEditor, protectedRange)) {
          return;
        }

        data.onContentChange(updatedEditor.getJSON());
      },
      onSelectionUpdate: ({ editor: updatedEditor }) => {
        const protectedRange = findMathSourceRangeAtSelection(updatedEditor);
        isEditingMathSourceRef.current = Boolean(protectedRange);

        if (normalizeMath(updatedEditor, protectedRange)) {
          return;
        }
      },
    });

    useEffect(() => {
      editorRef.current = editor;
    }, [editor]);

    useEffect(() => {
      addChildRef.current = data.onAddChild;
    }, [data.onAddChild]);

    useEffect(() => {
      addSiblingRef.current = data.onAddSibling;
    }, [data.onAddSibling]);

    useEffect(() => {
      editNodeRef.current = data.onEdit;
    }, [data.onEdit]);

    useEffect(() => {
      focusNodeRef.current = data.onFocus;
    }, [data.onFocus]);

    useEffect(() => {
      editor?.setEditable(data.isEditing);
    }, [data.isEditing, editor]);

    useEffect(() => {
      if (!editor || editor.isFocused) {
        return;
      }

      editor.commands.setContent(data.content);
    }, [data.content, editor]);

    useEffect(() => {
      if (!editor || !data.isEditing || editor.isFocused) {
        return;
      }

      focusEditorAtEnd(editor);
    }, [data.isEditing, editor]);

    const handleImageDrop = (event: React.DragEvent<HTMLDivElement>) => {
      if (!editor || !hasImageFiles(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsImageDragOver(false);
      data.onFocus();
      editor.setEditable(true);

      Array.from(event.dataTransfer.files)
        .filter((file) => file.type.startsWith("image/"))
        .forEach((file) => {
          const reader = new FileReader();

          reader.onload = () => {
            const src = reader.result;

            if (typeof src !== "string") {
              return;
            }

            editor.chain().focus("end").setImage({ src, alt: file.name }).run();
            data.onContentChange(editor.getJSON());
          };
          reader.readAsDataURL(file);
        });
    };

    const enterEditMode = () => {
      data.onEdit();
      editor?.setEditable(true);
      focusEditorAtEnd(editor);
    };

    const runEditorCommand = (
      event: React.MouseEvent<HTMLButtonElement>,
      command: (activeEditor: Editor) => void,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      if (!editor) {
        return;
      }

      data.onEdit();
      editor.setEditable(true);
      command(editor);
      data.onContentChange(editor.getJSON());
    };

    const applyLink = (activeEditor: Editor) => {
      const currentHref = activeEditor.getAttributes("link").href;
      const rawUrl = window.prompt(
        "Enter web link",
        typeof currentHref === "string" ? currentHref : "",
      );

      if (rawUrl === null) {
        return;
      }

      const url = rawUrl.trim();

      if (!url) {
        activeEditor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }

      const href = normalizeWebUrl(url);

      if (activeEditor.state.selection.empty) {
        activeEditor
          .chain()
          .focus()
          .insertContent([
            {
              type: "text",
              text: url,
              marks: [
                {
                  type: "link",
                  attrs: {
                    href,
                    rel: "noopener noreferrer nofollow",
                    target: "_blank",
                  },
                },
              ],
            },
          ])
          .run();
        return;
      }

      activeEditor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href })
        .run();
    };

    const applyTextColor = (color: string | null) => {
      if (!editor) {
        return;
      }

      data.onEdit();
      editor.setEditable(true);
      const command = editor.chain().focus();

      if (color) {
        command.setColor(color).run();
      } else {
        command.unsetColor().run();
      }

      setIsColorPaletteOpen(false);
      data.onContentChange(editor.getJSON());
    };

    const insertImageFiles = async (files: FileList | null) => {
      if (!editor || !files?.length) {
        return;
      }

      data.onEdit();
      editor.setEditable(true);

      for (const file of Array.from(files).filter((item) =>
        item.type.startsWith("image/"),
      )) {
        const src = await readFileAsDataUrl(file);
        editor.chain().focus("end").setImage({ src, alt: file.name }).run();
      }

      data.onContentChange(editor.getJSON());
    };

    const insertAttachmentFiles = async (files: FileList | null) => {
      if (!editor || !files?.length) {
        return;
      }

      data.onEdit();
      editor.setEditable(true);

      for (const file of Array.from(files)) {
        const href = await readFileAsDataUrl(file);

        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "text",
              text: `[file] ${file.name}`,
              marks: [
                {
                  type: "link",
                  attrs: {
                    href,
                    rel: "noopener noreferrer nofollow",
                    target: "_blank",
                  },
                },
              ],
            },
            {
              type: "text",
              text: " ",
            },
          ])
          .run();
      }

      data.onContentChange(editor.getJSON());
    };

    const insertInlineMathSource = (activeEditor: Editor) => {
      isEditingMathSourceRef.current = true;
      activeEditor.commands.focus();

      const { from, to } = activeEditor.state.selection;
      const transaction = activeEditor.state.tr.insertText("$$", from, to);

      transaction.setSelection(TextSelection.create(transaction.doc, from + 1));

      activeEditor.view.dispatch(transaction);
      activeEditor.view.focus();
    };

    const insertBlockMathSource = (activeEditor: Editor) => {
      isEditingMathSourceRef.current = true;
      const insertPosition = activeEditor.state.selection.from;

      activeEditor
        .chain()
        .focus()
        .insertContent({
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "$$$$",
            },
          ],
        })
        .run();

      const cursorPosition = findBlockMathSourceCursorPosition(
        activeEditor,
        insertPosition,
      );

      if (cursorPosition !== null) {
        activeEditor.commands.setTextSelection(cursorPosition);
      }
    };

    const toggleBulletListStyle = (
      activeEditor: Editor,
      listStyle: "dash" | null,
    ) => {
      if (activeEditor.isActive("bulletList", { listStyle })) {
        activeEditor.chain().focus().toggleBulletList().run();
        return;
      }

      if (!activeEditor.isActive("bulletList")) {
        activeEditor.chain().focus().toggleBulletList().run();
      }

      activeEditor
        .chain()
        .focus()
        .updateAttributes("bulletList", { listStyle })
        .run();
    };

    const restoreMathSourceFromEvent = (
      event: React.MouseEvent<HTMLDivElement>,
    ) => {
      if (!editor) {
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

      isEditingMathSourceRef.current = true;
      data.onEdit();
      editor.setEditable(true);
      restoreMathSource(editor, node, pos, typeName === "blockMath");
      return true;
    };

    return (
      <div
        className={[
          "mind-node",
          data.isSelected ? "is-selected" : "",
          data.isEditing ? "is-editing" : "",
          isImageDragOver ? "is-image-drop-target" : "",
        ].join(" ")}
        onMouseDownCapture={(event) => {
          const target = event.target instanceof Element ? event.target : null;

          if (data.isEditing && target?.closest(".node-editor")) {
            return;
          }

          if (event.detail >= 2) {
            event.stopPropagation();
          }
        }}
        onDoubleClickCapture={(event) => {
          const target = event.target instanceof Element ? event.target : null;

          if (data.isEditing && target?.closest(".node-editor")) {
            return;
          }

          if (
            target?.closest(".collapse-node-button") ||
            target?.closest(".node-format-toolbar")
          ) {
            return;
          }

          if (restoreMathSourceFromEvent(event)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }

          if (isEditingMathSourceRef.current) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          enterEditMode();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          enterEditMode();
        }}
        onDragOverCapture={(event) => {
          if (hasImageFiles(event.dataTransfer)) {
            event.preventDefault();
            event.stopPropagation();
            setIsImageDragOver(true);
          }
        }}
        onDragEnterCapture={(event) => {
          if (hasImageFiles(event.dataTransfer)) {
            event.preventDefault();
            event.stopPropagation();
            setIsImageDragOver(true);
          }
        }}
        onDragLeaveCapture={(event) => {
          const nextTarget = event.relatedTarget;

          if (
            nextTarget instanceof HTMLElement &&
            event.currentTarget.contains(nextTarget)
          ) {
            return;
          }

          setIsImageDragOver(false);
        }}
        onDropCapture={handleImageDrop}
      >
        <Handle type="target" position={Position.Left} />
        {data.isSelected ? (
          <>
            <NodeResizeControl
              className="node-resize-control node-resize-control-right"
              minWidth={280}
              minHeight={78}
              maxWidth={760}
              maxHeight={640}
              position="right"
              resizeDirection="horizontal"
              variant={ResizeControlVariant.Line}
              onResizeStart={() => data.onResizeStart()}
            />
            <NodeResizeControl
              className="node-resize-control node-resize-control-bottom"
              minWidth={280}
              minHeight={78}
              maxWidth={760}
              maxHeight={640}
              position="bottom"
              resizeDirection="vertical"
              variant={ResizeControlVariant.Line}
              onResizeStart={() => data.onResizeStart()}
            />
            <NodeResizeControl
              className="node-resize-control node-resize-control-corner"
              minWidth={280}
              minHeight={78}
              maxWidth={760}
              maxHeight={640}
              position="bottom-right"
              onResizeStart={() => data.onResizeStart()}
            >
              <span aria-hidden="true" />
            </NodeResizeControl>
          </>
        ) : null}
        {data.isEditing ? (
          <div
            className="node-format-toolbar"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              title="Insert inline formula"
              onClick={(event) => runEditorCommand(event, insertInlineMathSource)}
            >
              $
            </button>
            <button
              type="button"
              title="Insert block formula"
              onClick={(event) => runEditorCommand(event, insertBlockMathSource)}
            >
              $$
            </button>
            <button
              type="button"
              title="Bold"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  activeEditor.chain().focus().toggleBold().run();
                })
              }
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              title="Italic"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  activeEditor.chain().focus().toggleItalic().run();
                })
              }
            >
              <em>I</em>
            </button>
            <button
              type="button"
              title="Underline"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  activeEditor.chain().focus().toggleUnderline().run();
                })
              }
            >
              <span className="toolbar-symbol-underline">U</span>
            </button>
            <button
              type="button"
              title="Strikethrough"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  activeEditor.chain().focus().toggleStrike().run();
                })
              }
            >
              <s>S</s>
            </button>
            <button
              type="button"
              title="Font color"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsColorPaletteOpen((current) => !current);
              }}
            >
              <span className="toolbar-symbol-color">A</span>
            </button>
            {isColorPaletteOpen ? (
              <div
                className="node-color-palette"
                aria-label="Font color choices"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {textColorOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className="node-color-swatch"
                    title={option.label}
                    aria-label={option.label}
                    style={option.value ? { backgroundColor: option.value } : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      applyTextColor(option.value);
                    }}
                  >
                    {option.value ? "" : "×"}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              title="Add web link"
              onClick={(event) => runEditorCommand(event, applyLink)}
            >
              ↗
            </button>
            <button
              type="button"
              title="Insert image"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                imageInputRef.current?.click();
              }}
            >
              ▧
            </button>
            <input
              ref={imageInputRef}
              className="node-toolbar-hidden-input"
              type="file"
              accept="image/*"
              aria-label="Choose image"
              multiple
              onChange={(event) => {
                void insertImageFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              title="Attach file"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                attachmentInputRef.current?.click();
              }}
            >
              ⎘
            </button>
            <input
              ref={attachmentInputRef}
              className="node-toolbar-hidden-input"
              type="file"
              aria-label="Choose attachment"
              multiple
              onChange={(event) => {
                void insertAttachmentFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              title="Toggle bulleted list"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  toggleBulletListStyle(activeEditor, null);
                })
              }
            >
              •
            </button>
            <button
              type="button"
              title="Toggle dashed list"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  toggleBulletListStyle(activeEditor, "dash");
                })
              }
            >
              –
            </button>
            <button
              type="button"
              title="Toggle numbered list"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  activeEditor.chain().focus().toggleOrderedList().run();
                })
              }
            >
              1.
            </button>
            <button
              type="button"
              title="Toggle block quote"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  activeEditor.chain().focus().toggleBlockquote().run();
                })
              }
            >
              ❝
            </button>
            <button
              type="button"
              title="Toggle task list"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  activeEditor.chain().focus().toggleTaskList().run();
                })
              }
            >
              ☑
            </button>
            <button
              type="button"
              title="Insert table"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  activeEditor
                    .chain()
                    .focus()
                    .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
                    .run();
                })
              }
            >
              ▦
            </button>
            <button
              type="button"
              title="Code block"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  activeEditor.chain().focus().toggleCodeBlock().run();
                })
              }
            >
              {"</>"}
            </button>
            <button
              type="button"
              title="Highlight text"
              onClick={(event) =>
                runEditorCommand(event, (activeEditor) => {
                  activeEditor.chain().focus().toggleHighlight().run();
                })
              }
            >
              ✦
            </button>
          </div>
        ) : null}
        {data.childCount > 0 ? (
          <button
            type="button"
            className="collapse-node-button"
            title={data.isCollapsed ? "Expand node" : "Collapse node"}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              data.onToggleCollapse();
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {data.isCollapsed ? "+" : "-"}
          </button>
        ) : null}
        <EditorContent
          editor={editor}
          className={
            data.isEditing
              ? "node-editor-shell nodrag nopan nowheel"
              : "node-editor-shell"
          }
          onPointerDown={
            data.isEditing ? (event) => event.stopPropagation() : undefined
          }
          onMouseDown={
            data.isEditing ? (event) => event.stopPropagation() : undefined
          }
          onMouseMove={
            data.isEditing
              ? (event) => event.stopPropagation()
              : (event) => {
                  if (restoreMathSourceFromEvent(event)) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }
          }
          onMouseUp={
            data.isEditing ? (event) => event.stopPropagation() : undefined
          }
          onDoubleClick={
            data.isEditing ? (event) => event.stopPropagation() : undefined
          }
        />
        <Handle type="source" position={Position.Right} />
      </div>
    );
  },
  (previous, next) => previous.data === next.data,
);
