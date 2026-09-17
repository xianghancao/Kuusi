import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTexOutline } from "./parseTexOutline";

const titles = (entries: ReturnType<typeof parseTexOutline>): string[] =>
  entries.map((entry) => entry.title);

describe("parseTexOutline", () => {
  it("ignores preamble macro definitions that embed \\section{", () => {
    const source = String.raw`\documentclass{article}
\renewcommand{\section}{\@startsection{section}{1}{\z@}{-3.5ex}{2.3ex}{\bfseries}}
\begin{document}
\section{Introduction}
\end{document}`;

    assert.deepEqual(titles(parseTexOutline(source)), ["Introduction"]);
  });

  it("keeps nested section levels and strips inline markup from titles", () => {
    const source = String.raw`\begin{document}
\section{Open \texttt{sample.tex} in JupyterLab}
\subsection{Live reload}
\begin{verbatim}
\section{ignored in verbatim}
\end{verbatim}
\end{document}`;

    const outline = parseTexOutline(source);
    assert.equal(outline[0]?.title, "Open sample.tex in JupyterLab");
    assert.equal(outline[0]?.items[0]?.title, "Live reload");
    assert.equal(outline.length, 1);
  });

  it("maps outline lines back to the full source file", () => {
    const source = String.raw`\documentclass{article}
\begin{document}
\section{One}
\section{Two}
\end{document}`;

    const outline = parseTexOutline(source);
    assert.equal(outline[0]?.line, 3);
    assert.equal(outline[1]?.line, 4);
  });
});
