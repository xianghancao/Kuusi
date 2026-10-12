/**
 * Add a bookmark tree (the “table of contents” in a PDF reader's sidebar) to a
 * PDF the browser printed. The print dialog writes the file itself, so the
 * bookmarks are appended afterwards as a PDF incremental update.
 *
 * The printed file names every Article heading as a destination (`/Dests`), so
 * each bookmark just points at one of them.
 */

export type PdfBookmark = {
  title: string;
  /** 1 = top level, 2 = nested under the previous level 1, … */
  level: number;
  /** Destination name written by the print (the heading's id). */
  anchor: string;
};

/** A link on a printed page, in px from the page's top-left. */
export type PdfLinkRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** External address. */
  uri?: string;
  /** Destination name (a heading anchor) inside the document. */
  anchor?: string;
};

export type PdfPageLinks = {
  widthPx: number;
  heightPx: number;
  /** Per page, in order. */
  pages: PdfLinkRect[][];
};

const latin1 = (bytes: Uint8Array): string => {
  let out = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  return out;
};

const toBytes = (text: string): Uint8Array => {
  const out = new Uint8Array(text.length);

  for (let i = 0; i < text.length; i += 1) {
    out[i] = text.charCodeAt(i) & 0xff;
  }

  return out;
};

/** PDF text string as UTF-16BE hex (`<FEFF…>`), so any script survives. */
const pdfText = (value: string): string => {
  let hex = "FEFF";

  for (let i = 0; i < value.length; i += 1) {
    hex += value.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  }

  return `<${hex}>`;
};

const objectBody = (text: string, id: number): string | null => {
  const marker = new RegExp(`(?:^|[\\r\\n])${id} 0 obj`, "g");
  let start = -1;
  let match: RegExpExecArray | null;

  while ((match = marker.exec(text)) !== null) {
    start = match.index + match[0].length;
  }

  if (start < 0) {
    return null;
  }

  const end = text.indexOf("endobj", start);
  return end < 0 ? null : text.slice(start, end);
};

type Tree = {
  bookmark: PdfBookmark;
  dest: string;
  children: Tree[];
  id: number;
};

/** Returns the new file, or null when the PDF has no usable headings/structure. */
export const addBookmarksToPdf = (
  source: Uint8Array,
  bookmarks: readonly PdfBookmark[],
  links?: PdfPageLinks | null,
): Uint8Array | null => {
  const text = latin1(source);
  const startxref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  const trailerAt = text.lastIndexOf("trailer");

  if (!startxref || trailerAt < 0) {
    return null;
  }

  const trailer = text.slice(trailerAt, startxref.index);
  const size = Number(/\/Size\s+(\d+)/.exec(trailer)?.[1]);
  const root = Number(/\/Root\s+(\d+)\s+0\s+R/.exec(trailer)?.[1]);
  const info = /\/Info\s+(\d+)\s+0\s+R/.exec(trailer)?.[1];

  if (!Number.isFinite(size) || !Number.isFinite(root)) {
    return null;
  }

  const catalog = objectBody(text, root);
  const destsId = Number(/\/Dests\s+(\d+)\s+0\s+R/.exec(catalog ?? "")?.[1]);
  const dests = Number.isFinite(destsId) ? objectBody(text, destsId) : null;

  if (!catalog || !dests) {
    return null;
  }

  // `/name [page 0 R /XYZ x y 0]` → explicit destination arrays.
  const table = new Map<string, string>();
  const entry = /\/([^\s/<>[\]()]+)\s*(\[[^\]]*\])/g;
  let found: RegExpExecArray | null;

  while ((found = entry.exec(dests)) !== null) {
    table.set(found[1], found[2]);
  }

  // Contents-page links are written as named destinations (`/Dest /name`) that
  // some viewers (Preview) do not follow; turn them into explicit destinations.
  const annotations = /(\d+) 0 obj\s*(<<(?:(?!>>)[\s\S])*?\/Subtype \/Link(?:(?!>>)[\s\S])*?\/Dest \/([^\s/<>[\]()]+)(?:(?!>>)[\s\S])*?>>)\s*endobj/g;
  const rewritten = new Map<number, string>();
  let annot: RegExpExecArray | null;

  while ((annot = annotations.exec(text)) !== null) {
    const dest = table.get(annot[3]);

    if (dest) {
      rewritten.set(
        Number(annot[1]),
        annot[2].replace(`/Dest /${annot[3]}`, `/Dest ${dest}`),
      );
    }
  }

  const items = bookmarks.flatMap((bookmark) => {
    const dest = table.get(bookmark.anchor);
    return dest ? [{ bookmark, dest }] : [];
  });

  if (items.length === 0) {
    return null;
  }

  // Nest by level.
  let next = size + 1;
  const rootNode: Tree = {
    bookmark: { title: "", level: 0, anchor: "" },
    dest: "",
    children: [],
    id: size,
  };
  const stack: Tree[] = [rootNode];

  items.forEach(({ bookmark, dest }) => {
    const node: Tree = { bookmark, dest, children: [], id: next };
    next += 1;

    while (stack.length > 1 && stack[stack.length - 1].bookmark.level >= bookmark.level) {
      stack.pop();
    }

    stack[stack.length - 1].children.push(node);
    stack.push(node);
  });

  const count = (node: Tree): number =>
    node.children.reduce((sum, child) => sum + 1 + count(child), 0);

  const objects = new Map<number, string>();
  const write = (node: Tree, parent: Tree | null, prev: Tree | null, following: Tree | null): void => {
    const first = node.children[0];
    const last = node.children[node.children.length - 1];
    const parts: string[] = [];

    if (parent === null) {
      parts.push("/Type /Outlines");
    } else {
      parts.push(`/Title ${pdfText(node.bookmark.title)}`);
      parts.push(`/Parent ${parent.id} 0 R`);
      parts.push(`/Dest ${node.dest}`);
    }

    if (prev) {
      parts.push(`/Prev ${prev.id} 0 R`);
    }

    if (following) {
      parts.push(`/Next ${following.id} 0 R`);
    }

    if (first) {
      parts.push(`/First ${first.id} 0 R /Last ${last.id} 0 R`);
      parts.push(`/Count ${count(node)}`);
    }

    objects.set(node.id, `<< ${parts.join(" ")} >>`);
    node.children.forEach((child, index) => {
      write(child, node, node.children[index - 1] ?? null, node.children[index + 1] ?? null);
    });
  };
  write(rootNode, null, null, null);

  rewritten.forEach((body, id) => {
    objects.set(id, body);
  });

  if (links) {
    const pagesId = Number(/\/Pages\s+(\d+)\s+0\s+R/.exec(catalog)?.[1]);
    const pagesBody = Number.isFinite(pagesId) ? objectBody(text, pagesId) : null;
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(pagesBody ?? "")?.[1] ?? "";
    const pageIds = [...kids.matchAll(/(\d+)\s+0\s+R/g)].map((m) => Number(m[1]));
    const escapeString = (value: string): string =>
      encodeURI(value).replace(/[\\()]/g, (c) => `\\${c}`);

    pageIds.forEach((pageId, index) => {
      const rects = links.pages[index];
      const pageBody = objectBody(text, pageId);

      if (!rects || rects.length === 0 || !pageBody) {
        return;
      }

      const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(
        pageBody,
      );
      const widthPt = box ? Number(box[3]) - Number(box[1]) : 0;
      const heightPt = box ? Number(box[4]) - Number(box[2]) : 0;

      if (widthPt <= 0 || heightPt <= 0) {
        return;
      }

      const scaleX = widthPt / links.widthPx;
      const scaleY = heightPt / links.heightPx;
      const refs: string[] = [];

      rects.forEach((link) => {
        const left = link.x * scaleX;
        const right = (link.x + link.width) * scaleX;
        const top = heightPt - link.y * scaleY;
        const bottom = heightPt - (link.y + link.height) * scaleY;
        const action = link.uri
          ? `/A << /S /URI /URI (${escapeString(link.uri)}) >>`
          : link.anchor && table.get(link.anchor)
            ? `/Dest ${table.get(link.anchor)}`
            : "";

        if (!action) {
          return;
        }

        objects.set(
          next,
          `<< /Type /Annot /Subtype /Link /F 4 /Border [0 0 0] ` +
            `/Rect [${left.toFixed(2)} ${bottom.toFixed(2)} ${right.toFixed(2)} ${top.toFixed(2)}] ${action} >>`,
        );
        refs.push(`${next} 0 R`);
        next += 1;
      });

      if (refs.length === 0) {
        return;
      }

      const annots = `/Annots [${refs.join(" ")}]`;
      let rewrittenPage = pageBody.trim();

      if (/\/Annots\s*\[[^\]]*\]/.test(rewrittenPage)) {
        rewrittenPage = rewrittenPage.replace(/\/Annots\s*\[[^\]]*\]/, annots);
      } else if (/\/Annots\s+\d+\s+0\s+R/.test(rewrittenPage)) {
        rewrittenPage = rewrittenPage.replace(/\/Annots\s+\d+\s+0\s+R/, annots);
      } else {
        rewrittenPage = rewrittenPage.replace(/>>\s*$/, ` ${annots} >>`);
      }

      objects.set(pageId, rewrittenPage);
    });
  }

  const body = catalog.trim().replace(/>>\s*$/, "");
  objects.set(
    root,
    `${body} /Outlines ${rootNode.id} 0 R /PageMode /UseOutlines >>`,
  );

  // Append objects, then a cross-reference section covering only those.
  let output = text.endsWith("\n") ? text : `${text}\n`;
  const offsets = new Map<number, number>();
  [...objects.keys()]
    .sort((a, b) => a - b)
    .forEach((id) => {
      offsets.set(id, output.length);
      output += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
    });

  const xrefAt = output.length;
  const ids = [...offsets.keys()].sort((a, b) => a - b);
  let xref = "xref\n";
  let i = 0;

  while (i < ids.length) {
    let j = i;

    while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) {
      j += 1;
    }

    xref += `${ids[i]} ${j - i + 1}\n`;

    for (let k = i; k <= j; k += 1) {
      xref += `${String(offsets.get(ids[k])).padStart(10, "0")} 00000 n \n`;
    }

    i = j + 1;
  }

  output +=
    `${xref}trailer\n<< /Size ${next} /Root ${root} 0 R` +
    `${info ? ` /Info ${info} 0 R` : ""} /Prev ${startxref[1]} >>\n` +
    `startxref\n${xrefAt}\n%%EOF\n`;

  return toBytes(output);
};
