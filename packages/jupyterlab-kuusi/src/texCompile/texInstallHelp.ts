import { Dialog, showDialog } from "@jupyterlab/apputils";
import { Widget } from "@lumino/widgets";

const appendSection = (
  root: HTMLElement,
  title: string,
  body: HTMLElement,
): void => {
  const heading = document.createElement("h3");
  heading.className = "jp-KuusiTexCompile-helpHeading";
  heading.textContent = title;
  root.append(heading, body);
};

const appendParagraph = (root: HTMLElement, text: string): void => {
  const paragraph = document.createElement("p");
  paragraph.className = "jp-KuusiTexCompile-helpParagraph";
  paragraph.textContent = text;
  root.appendChild(paragraph);
};

const appendCodeBlock = (root: HTMLElement, code: string): void => {
  const pre = document.createElement("pre");
  pre.className = "jp-KuusiTexCompile-helpCode";
  pre.textContent = code;
  root.appendChild(pre);
};

const appendLinkList = (
  root: HTMLElement,
  items: { label: string; href: string }[],
): void => {
  const list = document.createElement("ul");
  list.className = "jp-KuusiTexCompile-helpList";

  for (const item of items) {
    const entry = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.label;
    entry.appendChild(link);
    list.appendChild(entry);
  }

  root.appendChild(list);
};

const createHelpBody = (): Widget => {
  const wrap = document.createElement("div");
  wrap.className = "jp-KuusiTexCompile-help";

  appendParagraph(
    wrap,
    "Kuusi compiles .tex files on the Jupyter server. pip install jupyterlab-kuusi does not include TeX — install pdflatex, xelatex, and synctex separately, then make sure they are on the PATH of the environment that runs jupyter lab.",
  );

  const required = document.createElement("div");
  appendParagraph(
    required,
    "Compile uses pdflatex or xelatex (auto-detected). PDF ↔ source jumps use synctex. All three must be available to the server process.",
  );
  appendSection(wrap, "Required tools", required);

  const mac = document.createElement("div");
  appendParagraph(
    mac,
    "Install MacTeX (recommended). After installation, restart the terminal and JupyterLab.",
  );
  appendCodeBlock(
    mac,
    "# Homebrew (smaller download, no GUI apps)\nbrew install --cask mactex-no-gui\n\n# Or download the full MacTeX installer\n# https://tug.org/mactex/",
  );
  appendSection(wrap, "macOS", mac);

  const windows = document.createElement("div");
  appendParagraph(
    windows,
    "Install MiKTeX or TeX Live. During setup, choose to add TeX to PATH for all users or your account, then restart JupyterLab.",
  );
  appendLinkList(windows, [
    { label: "MiKTeX", href: "https://miktex.org/download" },
    { label: "TeX Live", href: "https://tug.org/texlive/acquire-netinstall.html" },
  ]);
  appendSection(wrap, "Windows", windows);

  const linux = document.createElement("div");
  appendParagraph(
    linux,
    "Use your package manager. A minimal set is often enough; for ctex / fontspec documents you may need extra language and font packages.",
  );
  appendCodeBlock(
    linux,
    "# Debian / Ubuntu\nsudo apt install texlive-latex-extra texlive-xetex texlive-lang-chinese\n\n# Fedora\nsudo dnf install texlive-scheme-medium\n\n# Arch\nsudo pacman -S texlive-most",
  );
  appendSection(wrap, "Linux", linux);

  const verify = document.createElement("div");
  appendParagraph(
    verify,
    "Run these in the same terminal (and Python environment) you use to start JupyterLab:",
  );
  appendCodeBlock(
    verify,
    "which pdflatex xelatex synctex   # macOS / Linux\nwhere pdflatex xelatex synctex     # Windows",
  );
  appendParagraph(
    verify,
    "If a command is missing, fix your TeX installation or PATH, then restart jupyter lab.",
  );
  appendSection(wrap, "Verify", verify);

  const body = new Widget();
  body.node.appendChild(wrap);
  return body;
};

export const showTexInstallHelp = async (): Promise<void> => {
  await showDialog({
    title: "Install TeX for Kuusi",
    body: createHelpBody(),
    buttons: [Dialog.okButton({ label: "Close" })],
  });
};
