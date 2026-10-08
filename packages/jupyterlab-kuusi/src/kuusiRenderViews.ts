import { PathExt } from "@jupyterlab/coreutils";
import type { TranslationBundle } from "@jupyterlab/translation";
import {
  FACTORY_EDITOR,
  FACTORY_KUUSI_MARKDOWN_BOOK,
  FACTORY_KUUSI_MARKDOWN_MIND_MAP,
  FACTORY_KUUSI_MARKDOWN_SLIDES,
  FACTORY_KUUSI_NOTEBOOK,
  FACTORY_KUUSI_NOTEBOOK_ARTICLE,
  FACTORY_KUUSI_NOTEBOOK_BOOK,
  FACTORY_KUUSI_NOTEBOOK_SLIDES,
  FACTORY_MARKDOWN_PREVIEW,
  FACTORY_NOTEBOOK,
} from "./defaultOpeners/constants";
import { getRenderViewOrder, isRenderViewEnabled } from "./renderViewOrder";

export type KuusiWorkspaceKind = "notebook" | "markdown";

export type KuusiRenderViewId = "article" | "book" | "mindmap" | "slides";

export type KuusiRenderViewSpec = {
  id: KuusiRenderViewId;
  factory: string;
  label: string;
  title: string;
};

export type KuusiWorkspaceSpec = {
  kind: KuusiWorkspaceKind;
  editorFactory: string;
  /** Highest-priority render view opened on the right after launcher create. */
  defaultRenderId: KuusiRenderViewId;
  renderViews: KuusiRenderViewSpec[];
};

const NOTEBOOK_WORKSPACE: KuusiWorkspaceSpec = {
  kind: "notebook",
  editorFactory: FACTORY_NOTEBOOK,
  defaultRenderId: "article",
  renderViews: [
    {
      id: "article",
      factory: FACTORY_KUUSI_NOTEBOOK_ARTICLE,
      label: "Article",
      title: "Rendered notebook article",
    },
    {
      id: "book",
      factory: FACTORY_KUUSI_NOTEBOOK_BOOK,
      label: "Book",
      title: "Dual-column notebook book",
    },
    {
      id: "mindmap",
      factory: FACTORY_KUUSI_NOTEBOOK,
      label: "Mind Map",
      title: "Kuusi notebook mind map",
    },
    {
      id: "slides",
      factory: FACTORY_KUUSI_NOTEBOOK_SLIDES,
      label: "Slides",
      title: "Live notebook slides",
    },
  ],
};

const MARKDOWN_WORKSPACE: KuusiWorkspaceSpec = {
  kind: "markdown",
  editorFactory: FACTORY_EDITOR,
  defaultRenderId: "article",
  renderViews: [
    {
      id: "article",
      factory: FACTORY_MARKDOWN_PREVIEW,
      label: "Article",
      title: "Rendered Markdown preview",
    },
    {
      id: "book",
      factory: FACTORY_KUUSI_MARKDOWN_BOOK,
      label: "Book",
      title: "Dual-column Markdown book",
    },
    {
      id: "mindmap",
      factory: FACTORY_KUUSI_MARKDOWN_MIND_MAP,
      label: "Mind Map",
      title: "Kuusi Markdown mind map",
    },
    {
      id: "slides",
      factory: FACTORY_KUUSI_MARKDOWN_SLIDES,
      label: "Slides",
      title: "Live Markdown slides",
    },
  ],
};

const WORKSPACE_BY_KIND: Record<KuusiWorkspaceKind, KuusiWorkspaceSpec> = {
  notebook: NOTEBOOK_WORKSPACE,
  markdown: MARKDOWN_WORKSPACE,
};

export const getWorkspaceKind = (
  path: string | null | undefined,
): KuusiWorkspaceKind | null => {
  if (!path) {
    return null;
  }

  const ext = PathExt.extname(path).toLowerCase();

  if (ext === ".ipynb") {
    return "notebook";
  }

  if (ext === ".md") {
    return "markdown";
  }

  return null;
};

/** Workspace spec with render views sorted by the user's left-to-right priority. */
export const getWorkspaceSpec = (
  kind: KuusiWorkspaceKind,
): KuusiWorkspaceSpec => {
  const base = WORKSPACE_BY_KIND[kind];
  const rank = getRenderViewOrder();
  const renderViews = [...base.renderViews].sort(
    (a, b) => rank.indexOf(a.id) - rank.indexOf(b.id),
  );

  const preferred = renderViews.find((view) => isRenderViewEnabled(view.id));

  return {
    ...base,
    renderViews,
    defaultRenderId: (preferred ?? renderViews[0]).id,
  };
};

/** Translate switcher chrome. Literals stay here so gettext can extract them. */
export const translateRenderViewSpec = (
  view: KuusiRenderViewSpec,
  trans: TranslationBundle,
): KuusiRenderViewSpec => {
  switch (view.id) {
    case "article":
      return {
        ...view,
        label: trans.__("Article"),
        title:
          view.factory === FACTORY_MARKDOWN_PREVIEW
            ? trans.__("Rendered Markdown preview")
            : trans.__("Rendered notebook article"),
      };
    case "book":
      return {
        ...view,
        label: trans.__("Book"),
        title:
          view.factory === FACTORY_KUUSI_MARKDOWN_BOOK
            ? trans.__("Dual-column Markdown book")
            : trans.__("Dual-column notebook book"),
      };
    case "mindmap":
      return {
        ...view,
        label: trans.__("Mind Map"),
        title:
          view.factory === FACTORY_KUUSI_MARKDOWN_MIND_MAP
            ? trans.__("Kuusi Markdown mind map")
            : trans.__("Kuusi notebook mind map"),
      };
    case "slides":
      return {
        ...view,
        label: trans.__("Slides"),
        title:
          view.factory === FACTORY_KUUSI_MARKDOWN_SLIDES
            ? trans.__("Live Markdown slides")
            : trans.__("Live notebook slides"),
      };
  }
};

export const getWorkspaceSpecForPath = (
  path: string | null | undefined,
): KuusiWorkspaceSpec | null => {
  const kind = getWorkspaceKind(path);

  return kind ? getWorkspaceSpec(kind) : null;
};

export const renderViewForFactory = (
  spec: KuusiWorkspaceSpec,
  factoryName: string,
): KuusiRenderViewSpec | null => {
  const direct = spec.renderViews.find((view) => view.factory === factoryName);
  if (direct) {
    return direct;
  }

  return null;
};

/** Document path that owns the split workspace. */
export const resolveWorkspacePath = (
  widgetPath: string,
  _widgetFactory: string,
): string => widgetPath;

export const documentPathForRenderView = (
  workspacePath: string,
  _view: KuusiRenderViewSpec,
): string => workspacePath;

export const isEditorFactory = (
  spec: KuusiWorkspaceSpec,
  factoryName: string,
): boolean => factoryName === spec.editorFactory;
