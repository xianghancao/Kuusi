import type { TranslationBundle } from "@jupyterlab/translation";

export const createKuusiTranslator = (trans: TranslationBundle) => ({
  background: () => trans.__("Background"),
  backgroundBusinessBlue: () => trans.__("Business Blue"),
  backgroundBusinessBlueTitle: () =>
    trans.__("Professional cool blue tone for presentations"),
  backgroundTechBlue: () => trans.__("Tech Blue"),
  backgroundTechBlueTitle: () =>
    trans.__("Futuristic cyan-blue tech canvas"),
  backgroundColor: () => trans.__("Color"),
  backgroundCustomColor: () => trans.__("Custom color"),
  backgroundDefault: () => trans.__("Default"),
  backgroundDefaultTitle: () =>
    trans.__("Follow the Jupyter theme background"),
  backgroundDots: () => trans.__("Dots"),
  backgroundDotsTitle: () =>
    trans.__("Dot pattern for spatial reference"),
  backgroundEyeCare: () => trans.__("Eye Care"),
  backgroundEyeCareTitle: () =>
    trans.__("Soft green tint to reduce eye strain"),
  backgroundGradient: () => trans.__("Gradient"),
  backgroundGradientTitle: () => trans.__("Soft corner gradients"),
  backgroundGrid: () => trans.__("Grid"),
  backgroundGridTitle: () =>
    trans.__("Light grid lines for spatial reference"),
  backgroundNewspaper: () => trans.__("Newspaper"),
  backgroundNewspaperTitle: () =>
    trans.__("Warm paper tone with a light newsprint texture"),
  backgroundSeaBlue: () => trans.__("Sea Blue"),
  backgroundSeaBlueTitle: () =>
    trans.__("Cool ocean blue canvas"),
  backgroundGrassGreen: () => trans.__("Grass Green"),
  backgroundGrassGreenTitle: () =>
    trans.__("Fresh spring green canvas"),
  backgroundAvocado: () => trans.__("Avocado"),
  backgroundAvocadoTitle: () =>
    trans.__("Muted yellow-green avocado tone"),
  backgroundStoneGray: () => trans.__("Stone Gray"),
  backgroundStoneGrayTitle: () =>
    trans.__("Neutral warm stone gray canvas"),
  backgroundRedWall: () => trans.__("Red Wall"),
  backgroundRedWallTitle: () =>
    trans.__("Warm terracotta red wall tone"),
  backgroundInk: () => trans.__("Ink"),
  backgroundInkTitle: () =>
    trans.__("Near-black stage for dark presentations"),
  backgroundPattern: () => trans.__("Pattern"),
  backgroundPatternNone: () => trans.__("None"),
  backgroundPatternNoneTitle: () =>
    trans.__("No pattern overlay — color theme only"),
  backgroundPlain: () => trans.__("Plain"),
  backgroundPlainTitle: () =>
    trans.__("Flat solid fill without texture overlays"),
  canvasBackground: () => trans.__("Canvas background"),
  childGap: () =>
    trans.__("Boundary distance between parent and child nodes"),
  compactLayout: () =>
    trans.__("XMind-style compact map with minimal topic spacing"),
  siblingGap: () => trans.__("Boundary distance between sibling nodes"),
  connectorLineAppearance: () => trans.__("Connector line appearance"),
  currentVersion: () => trans.__("Local"),
  dragHandleTitle: () =>
    trans.__("Drag to reorder, click to locate in notebook"),
  collapseBranch: () => trans.__("Collapse branch"),
  expandBranch: (hiddenCount: number) =>
    hiddenCount > 0
      ? `${trans.__("Expand branch")} (${hiddenCount})`
      : trans.__("Expand branch"),
  defaultFont: () => trans.__("Notebook"),
  defaultFontTitle: () => trans.__("Use the notebook default font"),
  editModeHint: () => trans.__("Enter edit mode (F2) to format markdown"),
  enterFullscreen: () => trans.__("Enter fullscreen"),
  exitFullscreen: () => trans.__("Exit fullscreen"),
  appearance: () => trans.__("Appearance"),
  about: () => trans.__("About"),
  aboutBlurb: () =>
    trans.__(
      "Kuusi is a Jupyter-native mind map view for notebooks—edit structure and content in one place.",
    ),
  copy: () => trans.__("Copy"),
  copied: () => trans.__("Copied"),
  copyInstallCommand: () => trans.__("Copy install command"),
  install: () => trans.__("Install"),
  newBadge: () => trans.__("New"),
  openPyPI: () => trans.__("Open PyPI project page"),
  openDiscourse: () =>
    trans.__("Open Jupyter Discourse feedback topic"),
  openX: () => trans.__("Open Kuusi on X"),
  community: () => trans.__("Community"),
  communityBlurb: () =>
    trans.__(
      "Join the conversation — feedback on Discourse, updates on X.",
    ),
  shortcut: () => trans.__("Shortcut"),
  font: () => trans.__("Font"),
  fontSectionDefault: () => trans.__("Default"),
  fontSectionSans: () => trans.__("Sans-serif"),
  fontSectionSerif: () => trans.__("Serif"),
  fontSizeSection: () => trans.__("Size"),
  fontSizeEdit: () => trans.__("Edit"),
  fontSizeDisplay: () => trans.__("Display"),
  formatNotesAa: () =>
    trans.__("Inline styles only affect node content, not structure"),
  formatNotesCodeCell: () =>
    trans.__("Formatting is available for markdown cells only"),
  formatNotesTitle: () =>
    trans.__("Outline headings change the mind map tree (H1 = root)"),
  formattingNotes: () => trans.__("Formatting notes"),
  formattingShortcuts: () => trans.__("Formatting shortcuts (edit mode)"),
  guide: () => trans.__("Guide"),
  headingLevel: () =>
    trans.__("Outline heading level (changes mind map structure)"),
  keyboardShortcuts: () => trans.__("Keyboard shortcuts"),
  latestUnavailable: () => trans.__("Unavailable"),
  latestVersion: () => trans.__("Latest"),
  layout: () => trans.__("Layout"),
  equalNodeWidth: () => trans.__("Equal width"),
  equalNodeWidthTitle: () =>
    trans.__("When on, every node uses the same width"),
  nodeWidth: () => trans.__("Node width"),
  resizeHandleTitle: () =>
    trans.__("Drag the right edge to resize this node"),
  line: () => trans.__("Line"),
  looseLayout: () => trans.__("Extra open spacing between topics and branches"),
  markdownFormatting: () => trans.__("Markdown formatting"),
  mindMapFont: () => trans.__("Mind map font and size"),
  mindMapShortcuts: () => trans.__("Mind map shortcuts"),
  mindMapTheme: () => trans.__("Mind map theme"),
  pageControls: () =>
    trans.__("Page and mind map controls"),
  newVersionAvailable: () => trans.__("A newer version is available"),
  node: () => trans.__("Node"),
  nodeAppearance: () =>
    trans.__("Node width, fill, border, and selection glow"),
  nodeFillDefault: () => trans.__("Map fill"),
  nodeFillSelected: () => trans.__("Selected fill"),
  nodeFillSelectHint: () =>
    trans.__("Select a node to set a custom fill"),
  nodeBorderStyle: () => trans.__("Border style"),
  nodeBorderWidth: () => trans.__("Border width"),
  nodeBorderColor: () => trans.__("Border color"),
  selectionGlowColor: () => trans.__("Selection glow color"),
  selectionGlowWidth: () => trans.__("Selection glow width"),
  nodeLayoutSpacing: () => trans.__("Node layout spacing"),
  normalLayout: () => trans.__("Balanced default spacing like XMind auto layout"),
  openRepository: () => trans.__("Open GitHub repository"),
  repository: () => trans.__("Repository"),
  style: () => trans.__("Style"),
  theme: () => trans.__("Theme"),
  density: () => trans.__("Density"),
  spacing: () => trans.__("Spacing"),
  width: () => trans.__("Width"),
  color: () => trans.__("Color"),
  arrow: () => trans.__("Arrow"),
  arrowStyle: () => trans.__("Arrow style"),
  fill: () => trans.__("Fill"),
  border: () => trans.__("Border"),
  corner: () => trans.__("Corner"),
  selection: () => trans.__("Selection"),
  tree: () => trans.__("Tree"),
  treeBottomToTop: () => trans.__("Bottom to top"),
  treeLeftToRight: () => trans.__("Left to right"),
  treeRightToLeft: () => trans.__("Right to left"),
  treeTopToBottom: () => trans.__("Top to bottom"),
  upToDate: () => trans.__("You are on the latest version"),
  version: () => trans.__("Version"),
  zoom: () => trans.__("Zoom"),
  zoomSlider: () => trans.__("Adjust zoom (20%–200%)"),
});

export type KuusiTranslator = ReturnType<typeof createKuusiTranslator>;
