import type { ITranslator, TranslationBundle } from "@jupyterlab/translation";
import { nullTranslator } from "@jupyterlab/translation";

import { ZH_CN } from "./locale/zhCN";

export const KUUSI_I18N_DOMAIN = "jupyterlab_kuusi";

const interpolate = (template: string, args: unknown[]): string =>
  template.replace(/%(\d+)/g, (_, index) =>
    String(args[Number(index) - 1] ?? ""),
  );

const isChinese = (languageCode: string): boolean =>
  languageCode.toLowerCase().replace("_", "-").startsWith("zh");

/** Official domain first; zh_CN catalog fills Kuusi strings the pack does not have. */
export const wrapKuusiBundle = (
  upstream: TranslationBundle,
  languageCode: string,
): TranslationBundle => {
  if (!isChinese(languageCode)) {
    return upstream;
  }

  return Object.create(upstream, {
    __: {
      value: (msgid: string, ...args: unknown[]): string => {
        const official = upstream.__(msgid, ...args);
        if (official !== msgid && official !== interpolate(msgid, args)) {
          return official;
        }

        return interpolate(ZH_CN[msgid] ?? msgid, args);
      },
    },
  }) as TranslationBundle;
};

let kuusiBundle: TranslationBundle = wrapKuusiBundle(
  nullTranslator.load(KUUSI_I18N_DOMAIN),
  typeof document !== "undefined" ? document.documentElement.lang : "",
);

export const configureKuusiTranslator = (translator: ITranslator): void => {
  const languageCode =
    translator.languageCode ||
    (typeof document !== "undefined" ? document.documentElement.lang : "");
  let upstream: TranslationBundle;

  try {
    upstream = translator.load(KUUSI_I18N_DOMAIN);
  } catch (error) {
    // A broken catalog must never stop the plugin from activating (that took
    // every Kuusi entry out of the menus): fall back to the built-in map.
    console.warn(
      "jupyterlab-kuusi: translation catalog could not be loaded, using built-in strings",
      error,
    );
    upstream = nullTranslator.load(KUUSI_I18N_DOMAIN);
  }

  kuusiBundle = wrapKuusiBundle(upstream, languageCode);
};

export const getKuusiBundle = (): TranslationBundle => kuusiBundle;

/**
 * Kuusi chrome strings. Domain `jupyterlab_kuusi` plus a zh_CN catalog
 * so the UI is not a mix of Lab translations and leftover English.
 */
export const createKuusiTranslator = (trans?: TranslationBundle) => {
  const t = trans ?? kuusiBundle;

  return {
  background: () => t.__("Background"),
  viewBackground: () => t.__("View"),
  viewBackgroundTitle: () =>
    t.__("Solid color of the pane behind the paper"),
  viewThemeTitle: () => t.__("Follow the Jupyter pane color"),
  backgroundBusinessBlue: () => t.__("Business Blue"),
  backgroundBusinessBlueTitle: () =>
    t.__("Professional cool blue tone for presentations"),
  backgroundTechBlue: () => t.__("Tech Blue"),
  backgroundTechBlueTitle: () =>
    t.__("Futuristic cyan-blue tech canvas"),
  backgroundColor: () => t.__("Color"),
  backgroundCustomColor: () => t.__("Custom color"),
  backgroundDefault: () => t.__("Default"),
  backgroundDefaultTitle: () =>
    t.__("Follow the Jupyter theme background"),
  backgroundDots: () => t.__("Dots"),
  backgroundDotsTitle: () =>
    t.__("Dot pattern for spatial reference"),
  backgroundDotsDense: () => t.__("Dots dense"),
  backgroundDotsDenseTitle: () =>
    t.__("Finer, denser dot pattern"),
  backgroundEyeCare: () => t.__("Eye Care"),
  backgroundEyeCareTitle: () =>
    t.__("Soft green tint to reduce eye strain"),
  backgroundGradient: () => t.__("Gradient"),
  backgroundGradientTitle: () => t.__("Soft corner gradients"),
  backgroundGrid: () => t.__("Grid"),
  backgroundGridTitle: () =>
    t.__("Light grid lines for spatial reference"),
  backgroundGridDense: () => t.__("Grid dense"),
  backgroundGridDenseTitle: () =>
    t.__("Finer, denser grid lines"),
  backgroundNewspaper: () => t.__("Newspaper"),
  backgroundNewspaperTitle: () =>
    t.__("Warm paper tone with a light newsprint texture"),
  backgroundSeaBlue: () => t.__("Sea Blue"),
  backgroundSeaBlueTitle: () =>
    t.__("Cool ocean blue canvas"),
  backgroundGrassGreen: () => t.__("Grass Green"),
  backgroundGrassGreenTitle: () =>
    t.__("Fresh spring green canvas"),
  backgroundAvocado: () => t.__("Avocado"),
  backgroundAvocadoTitle: () =>
    t.__("Muted yellow-green avocado tone"),
  backgroundStoneGray: () => t.__("Stone Gray"),
  backgroundStoneGrayTitle: () =>
    t.__("Neutral warm stone gray canvas"),
  backgroundRedWall: () => t.__("Red Wall"),
  backgroundRedWallTitle: () =>
    t.__("Warm terracotta red wall tone"),
  backgroundInk: () => t.__("Ink"),
  backgroundInkTitle: () =>
    t.__("Near-black stage for dark presentations"),
  backgroundPattern: () => t.__("Pattern"),
  backgroundPatternNone: () => t.__("None"),
  backgroundPatternNoneTitle: () =>
    t.__("No pattern overlay — color theme only"),
  backgroundPlain: () => t.__("Plain"),
  backgroundPlainTitle: () =>
    t.__("Flat solid fill without texture overlays"),
  canvasBackground: () => t.__("Canvas background"),
  backgroundStatusSection: () => t.__("Status"),
  showUpdatedTimestamp: () => t.__("Show updated time"),
  showUpdatedTimestampTitle: () =>
    t.__(
      "Show the notebook file last-modified time in the bottom-left corner",
    ),
  showNodeCount: () => t.__("Show node count"),
  showNodeCountTitle: () =>
    t.__("Show the number of mind map nodes beside zoom"),
  showTextCount: () => t.__("Show character / word count"),
  showTextCountTitle: () =>
    t.__("Show character and word counts beside zoom"),
  showPageCount: () => t.__("Show page count"),
  showPageCountTitle: () => t.__("Show the page or slide count beside zoom"),
  showFileSize: () => t.__("Show file size"),
  showFileSizeTitle: () => t.__("Show the document file size beside zoom"),
  statusNodes: (count: number) => `${t.__("Nodes")}: ${count}`,
  statusText: (characters: number, words: number) =>
    `${characters} ${t.__("chars")} · ${words} ${t.__("words")}`,
  statusPages: (count: number) => `${t.__("Pages")}: ${count}`,
  statusFileSizeBytes: (bytes: number) => `${bytes} ${t.__("B")}`,
  statusFileSizeKb: (kb: number) => `${kb} ${t.__("KB")}`,
  statusFileSizeMb: (mb: number) => `${mb} ${t.__("MB")}`,
  childGap: () =>
    t.__("Boundary distance between parent and child nodes"),
  compactLayout: () =>
    t.__("XMind-style compact map with minimal topic spacing"),
  siblingGap: () => t.__("Boundary distance between sibling nodes"),
  moreTools: () => t.__("More"),
  updateWith: () => t.__("Update with"),
  upgrade: () => t.__("Upgrade"),
  howToUpgrade: () => t.__("How to upgrade"),
  upgradedTo: () => t.__("Kuusi updated to"),
  upgradeIntro: () =>
    t.__("Kuusi is a Python package. Upgrade it in the same environment that runs JupyterLab."),
  upgradeInstall: () => t.__("Install the latest version"),
  upgradeInstallHint: () => t.__("Run this in a terminal:"),
  upgradeOthers: () => t.__("conda, uv and other environments"),
  upgradeCondaHint: () =>
    t.__("In a conda environment, activate it first, then use pip:"),
  upgradeUvHint: () => t.__("With uv:"),
  upgradeRestart: () => t.__("Restart JupyterLab"),
  upgradeRestartBody: () =>
    t.__("Stop it (Ctrl+C in its terminal) and start it again, then reload the browser tab with a hard refresh. A cached copy would otherwise keep showing the old version."),
  upgradeHardRefreshMac: () => t.__("Hard refresh: Cmd+Shift+R"),
  upgradeHardRefreshOther: () => t.__("Hard refresh: Ctrl+Shift+R"),
  upgradeVerify: () => t.__("Check that it worked"),
  upgradeVerifyBody: () =>
    t.__("jupyterlab-kuusi should be listed as enabled with the new version number. Settings → Version shows the same number."),
  upgradeTrouble: () => t.__("Still the old version?"),
  upgradeTroubleBody: () =>
    t.__("Make sure you restarted the JupyterLab that uses this environment. This prints the version pip installed:"),
  upgradeSource: () => t.__("Installed from source?"),
  upgradeSourceBody: () =>
    t.__("If you installed with pip install -e, update the repository and rebuild:"),
  copy: () => t.__("Copy"),
  copied: () => t.__("Copied"),
  previousPage: () => t.__("Previous page"),
  nextPage: () => t.__("Next page"),
  pagerPage: () => t.__("Page"),
  sidebarShow: () => t.__("Show outline and pages"),
  sidebarHide: () => t.__("Hide outline and pages"),
  sidebarOutline: () => t.__("Outline"),
  sidebarPages: () => t.__("Thumbnails"),
  sidebarNoHeadings: () => t.__("No headings"),
  connectorLineAppearance: () => t.__("Connector line appearance"),
  currentVersion: () => t.__("Local"),
  collapseBranch: () => t.__("Collapse branch"),
  expandBranch: (hiddenCount: number) =>
    hiddenCount > 0
      ? `${t.__("Expand branch")} (${hiddenCount})`
      : t.__("Expand branch"),
  defaultFont: () => t.__("Notebook"),
  defaultFontTitle: () => t.__("Use the notebook default font"),
  editModeHint: () => t.__("Enter edit mode (F2) to format markdown"),
  enterFullscreen: () => t.__("Enter fullscreen"),
  exitFullscreen: () => t.__("Exit fullscreen"),
  enterLabFullscreen: () => t.__("JupyterLab fullscreen"),
  exitLabFullscreen: () => t.__("Exit JupyterLab fullscreen"),
  enterKuusiFullscreen: () => t.__("Kuusi window fullscreen"),
  exitKuusiFullscreen: () => t.__("Exit Kuusi window fullscreen"),
  startSlideshow: () => t.__("Play slideshow"),
  stopSlideshow: () => t.__("Stop slideshow"),
  articleScrollHorizontal: () => t.__("Horizontal swipe"),
  articleScrollHorizontalTitle: () =>
    t.__("Swipe pages left and right (fullscreen)"),
  articleScrollVertical: () => t.__("Vertical swipe"),
  articleScrollVerticalTitle: () =>
    t.__("Scroll pages up and down (fullscreen)"),
  appearance: () => t.__("Appearance"),
  about: () => t.__("About"),
  aboutBlurb: () =>
    t.__(
      "Kuusi is a Jupyter-native mind map view for notebooks—edit structure and content in one place.",
    ),
  copyInstallCommand: () => t.__("Copy install command"),
  install: () => t.__("Install"),
  newBadge: () => t.__("New"),
  openPyPI: () => t.__("Open PyPI project page"),
  openDiscourse: () =>
    t.__("Open Jupyter Discourse feedback topic"),
  openX: () => t.__("Open Kuusi on X"),
  openCommunityEmail: () => t.__("Email Kuusi"),
  close: () => t.__("Close"),
  community: () => t.__("Community"),
  autoReload: () => t.__("Auto reload"),
  capsuleAutoCollapse: () => t.__("Auto collapse capsule"),
  capsuleAutoCollapseTitle: () =>
    t.__("Fold the capsule into a round mark until the pointer reaches it"),
  lineNumberHighlight: () => t.__("Cursor line number"),
  lineNumberColor: () => t.__("Color"),
  lineStyleDefault: () => t.__("Default"),
  lineStyleHighlight: () => t.__("Highlight"),
  lineStyleBold: () => t.__("Bold"),
  lineStyleBar: () => t.__("Bar"),
  lineStyleOff: () => t.__("Off"),
  autoReloadTitle: () =>
    t.__("Re-read the file when it changes on disk (skipped while there are unsaved edits)"),
  moreOptions: () => t.__("More options"),
  sync: () => t.__("Sync"),
  syncTitle: () => t.__("Keep this view in step with the editor"),
  livePreview: () => t.__("Live preview"),
  livePreviewTitle: () =>
    t.__("Update this view while you type in the Markdown editor"),
  feedback: () => t.__("Feedback"),
  feedbackIntro: () =>
    t.__("Tell us what is broken or what you would like. It opens an email in your own mail program; nothing is uploaded."),
  feedbackPlaceholder: () => t.__("Your message…"),
  feedbackIncludeInfo: () => t.__("Add the Kuusi version and browser info"),
  feedbackSend: () => t.__("Send by email"),
  feedbackCopy: () => t.__("Copy message"),
  feedbackEmpty: () => t.__("Write a message first."),
  feedbackOpened: (address: string) =>
    t.__("Your mail program should open. If nothing happens, use Copy message and send it to %1.", address),
  feedbackCopied: (address: string) => t.__("Copied. Paste it into an email to %1.", address),
  feedbackCopyFailed: () => t.__("Could not copy; select the text and copy it yourself."),
  defaultFiles: () => t.__("Default files"),
  groupSurface: () => t.__("Surface"),
  groupFurniture: () => t.__("Header & footer"),
  groupStructure: () => t.__("Structure"),
  contentsSection: () => t.__("Contents"),
  chaptersSection: () => t.__("Chapters"),
  contentsShow: () => t.__("Contents page"),
  contentsShowTitle: () =>
    t.__("Insert a table of contents with page numbers at the start"),
  contentsDepth: () => t.__("Heading levels"),
  tableHeaderRowAlign: () => t.__("Header row alignment"),
  tableHeaderColumnAlign: () => t.__("Header column alignment"),
  tableColumnWidth: () => t.__("Column width"),
  tableColumnsAuto: () => t.__("Auto fit"),
  tableColumnsAutoTitle: () =>
    t.__("Each column is as wide as its content needs"),
  tableColumnsEqual: () => t.__("Equal"),
  tableColumnsEqualTitle: () => t.__("Every column gets the same width"),
  tableAlignAuto: () => t.__("Auto"),
  tableAlignAutoTitle: () => t.__("Keep the table style's own alignment"),
  codeBackground: () => t.__("Code background"),
  quoteBackground: () => t.__("Quote background"),
  quoteColor: () => t.__("Quote text color"),
  quoteBarColor: () => t.__("Quote bar color"),
  contentsShowH1: () => t.__("Show Heading 1"),
  contentsShowH1Hint: () =>
    t.__("List Heading 1 (usually the document title) in the contents"),
  contentsHeadingToggle: () => t.__("Show title"),
  contentsHeadingToggleHint: () => t.__("Show a heading above the contents list"),
  contentsTitleLabel: () => t.__("Title"),
  contentsDefaultTitle: () => t.__("Contents"),
  headingNumbering: () => t.__("Heading numbers"),
  headingNumberingNone: () => t.__("None"),
  headingNumberingNoneTitle: () => t.__("Headings keep their written text"),
  headingNumberingDecimal: () => t.__("1, 1.1"),
  headingNumberingDecimalTitle: () => t.__("Number headings 1, 1.1, 1.1.1"),
  headingNumberingRoman: () => t.__("I, 1.1"),
  headingNumberingRomanTitle: () =>
    t.__("Chapters as I, II, III, sections as 1.1"),
  chapterBreak: () => t.__("New page before"),
  headingNumberStart: () => t.__("Start numbering at"),
  headingNumberStartH1: () => t.__("Heading 1"),
  headingNumberStartH1Title: () => t.__("Heading 1 is the first numbered level"),
  headingNumberStartH2: () => t.__("Heading 2"),
  headingNumberStartH2Title: () =>
    t.__("Leave Heading 1 (the document title) unnumbered and start at Heading 2"),
  headingNumberDepth: () => t.__("Numbered levels"),
  headingNumberDepthH1: () => t.__("Heading 1"),
  headingNumberDepthH1Title: () => t.__("Number only Heading 1"),
  headingNumberDepthH2: () => t.__("Heading 1–2"),
  headingNumberDepthH2Title: () => t.__("Number Heading 1 and Heading 2"),
  headingNumberDepthAll: () => t.__("All levels"),
  headingNumberDepthAllTitle: () => t.__("Number every heading level"),
  chapterBreakNone: () => t.__("None"),
  chapterBreakNoneTitle: () => t.__("Headings flow on without a page break"),
  chapterBreakH1: () => t.__("Heading 1"),
  chapterBreakH1Title: () => t.__("Every Heading 1 starts a new page"),
  chapterBreakH2: () => t.__("Heading 1–2"),
  chapterBreakH2Title: () =>
    t.__("Every Heading 1 and Heading 2 starts a new page"),
  structurePagedOnly: () =>
    t.__("Page breaks and page numbers show in Paged layout"),
  groupDisplay: () => t.__("Display"),
  resetPageSettings: () => t.__("Reset page settings"),
  resetPageSettingsTitle: () =>
    t.__("Restore this menu's settings to the current theme's defaults"),
  applyToAllViews: () => t.__("Apply text style to all views"),
  applyToAllViewsTitle: () =>
    t.__(
      "Copy font, color, spacing and heading styles to Article, Book, Slides and Mind Map",
    ),
  viewMenuIntro: () =>
    t.__(
      "Choose which views appear in the view menu and their order, left to right. The first enabled view opens by default.",
    ),
  kuusiSettings: () => t.__("Kuusi Settings"),
  communityBlurb: () =>
    t.__(
      "Join the conversation — feedback on Discourse, updates on X, or email us.",
    ),
  shortcut: () => t.__("Shortcut"),
  font: () => t.__("Font"),
  fontSectionDefault: () => t.__("Default"),
  fontSectionSans: () => t.__("Sans-serif"),
  fontSectionSerif: () => t.__("Serif"),
  fontSectionChinese: () => t.__("Chinese"),
  fontSizeSection: () => t.__("Size"),
  sizeCustom: () => t.__("Custom"),
  fontSizeEdit: () => t.__("Edit"),
  fontSizeDisplay: () => t.__("Display"),
  fontLink: () => t.__("Link"),
  unifyEditDisplayFont: () =>
    t.__("Keep edit and display font styles the same"),
  matchNotebookFont: () =>
    t.__("Match notebook (ipynb) font styles"),
  formatNotesAa: () =>
    t.__("Inline styles only affect node content, not structure"),
  formatNotesCodeCell: () =>
    t.__("Formatting is available for markdown cells only"),
  formatNotesTitle: () =>
    t.__(
      "H1–H3 outline chrome or Body; nesting persists to depth 20 with Body style",
    ),
  formattingNotes: () => t.__("Formatting notes"),
  formattingShortcuts: () => t.__("Formatting shortcuts (edit mode)"),
  guide: () => t.__("Guide"),
  headingLevel: () =>
    t.__(
      "Outline heading H1–H3 or Body (nesting to depth 20; deeper levels use Body style)",
    ),
  keyboardShortcuts: () => t.__("Keyboard shortcuts"),
  latestUnavailable: () => t.__("Unavailable"),
  latestVersion: () => t.__("Latest"),
  pypiLatestVersion: () => t.__("PyPI latest"),
  layout: () => t.__("Layout"),
  equalNodeWidth: () => t.__("Equal width"),
  equalNodeWidthTitle: () =>
    t.__("When on, every node uses the same width"),
  adaptiveNodeWidth: () => t.__("Auto fit"),
  adaptiveNodeWidthTitle: () =>
    t.__(
      "Fit width to content, capped by Node width; with Equal width, all nodes match the widest content (still capped)",
    ),
  nodeWidth: () => t.__("Node width"),
  measurePagedHint: () =>
    t.__("Line width applies to the scrolling layout; paged sheets use the paper width."),
  paperSwitchesToPaged: () =>
    t.__("Paper options use the paged layout and switch to it."),
  paddingHint: () =>
    t.__("Left and right margin. The top margin is 1.125× and the bottom 2× this value."),
  pageTokensHint: () =>
    t.__("Placeholders: {title} document name, {chapter} current chapter, {date} today, {page} page number, {pages} page count."),
  tableRepeatHeader: () => t.__("Repeat table headers"),
  tableRepeatHeaderTitle: () =>
    t.__("Repeat the header row on every page a long table spans"),
  marginsSection: () => t.__("Margins"),
  typesettingSection: () => t.__("Typesetting"),
  blocksSection: () => t.__("Blocks"),
  watermarkSection: () => t.__("Watermark"),
  exportSection: () => t.__("PDF export"),
  marginTop: () => t.__("Top"),
  marginBottom: () => t.__("Bottom"),
  marginLeft: () => t.__("Left"),
  marginRight: () => t.__("Right"),
  marginGutter: () => t.__("Gutter"),
  marginAuto: () => t.__("Auto"),
  marginsHint: () => t.__("Margins in mm; type a value to one decimal, or 0 to follow the theme again (Page → Padding in continuous layout). The gutter widens the left margin for binding."),
  lineSpacingPresets: () => t.__("Line spacing"),
  orphanLines: () => t.__("Orphan / widow lines"),
  hyphenation: () => t.__("Hyphenation"),
  hyphenationTitle: () => t.__("Break long words at syllables (needs a language-aware browser)"),
  indentChars: () => t.__("First-line indent"),
  indentCharsFormat: () => t.__("chars"),
  codeLineNumbers: () => t.__("Code line numbers"),
  codeTabSize: () => t.__("Code tab width"),
  imageCaptions: () => t.__("Image captions"),
  imageCaptionsTitle: () => t.__("Show the alt text under each image as “Figure N. …”"),
  linkFootnotes: () => t.__("Link footnotes"),
  linkFootnotesTitle: () => t.__("Number links in the text and list their addresses at the end"),
  imageScale: () => t.__("Scale"),
  tableFontSize: () => t.__("Table text size"),
  tableBandColor: () => t.__("Table band color"),
  columnRuleTitle: () => t.__("Draw a line between the two columns"),
  columnRuleWidth: () => t.__("Rule thickness"),
  columnRuleColor: () => t.__("Rule color"),
  columnRuleStyle: () => t.__("Rule style"),
  ruleSolid: () => t.__("Solid"),
  ruleDashed: () => t.__("Dashed"),
  ruleDotted: () => t.__("Dotted"),
  ruleDouble: () => t.__("Double"),
  watermarkText: () => t.__("Text"),
  pdfBookmarksLabel: () => t.__("Bookmarks"),
  pdfBookmarksTitle: () => t.__("One bookmark per heading in exported PDFs"),
  pdfQualityLabel: () => t.__("Image quality"),
  pdfQualityStandard: () => t.__("Standard"),
  pdfQualityHigh: () => t.__("High"),
  coverPage: () => t.__("Cover page"),
  coverTitleLabel: () => t.__("Cover title"),
  coverTitlePlaceholder: () => t.__("Document name"),
  coverAuthorLabel: () => t.__("Author"),
  coverDateLabel: () => t.__("Date"),
  coverDatePlaceholder: () => t.__("Today"),
  coverPageTitle: () => t.__("A title page (document name and date) before the contents"),
  pageMirror: () => t.__("Mirror on even pages"),
  pageMirrorTitle: () => t.__("Swap left and right alignment on even pages, as in a bound book"),
  figureLabel: () => t.__("Figure"),
  linksLabel: () => t.__("Links"),
  pageRule: () => t.__("Rule line"),
  pageRuleTitle: () => t.__("Draw a thin line between this band and the text"),
  pageFirstDifferent: () => t.__("Different first page"),
  pageFirstDifferentTitle: () =>
    t.__("Leave header and footer text empty on the first page"),
  editTextHint: () =>
    t.__("Font used while a node's source is open for editing."),
  viewBehavior: () => t.__("View"),
  zoomRange: () => t.__("Zoom range"),
  zoomMinimum: () => t.__("Minimum zoom"),
  zoomMaximum: () => t.__("Maximum zoom"),
  mouseWheel: () => t.__("Mouse wheel"),
  wheelPans: () => t.__("Wheel pans"),
  wheelPansTitle: () =>
    t.__("Scroll pans the map; Ctrl/⌘ + scroll or pinch zooms"),
  wheelZooms: () => t.__("Wheel zooms"),
  wheelZoomsTitle: () =>
    t.__("Scroll zooms the map; Shift + scroll pans"),
  wheelZoomSpeed: () => t.__("Zoom speed"),
  onOpen: () => t.__("On open"),
  openViewSelected: () => t.__("Center selected node"),
  openViewRoot: () => t.__("Center root"),
  openViewFit: () => t.__("Fit whole map"),
  openViewLast: () => t.__("Restore last view"),
  nodeLevels: () => t.__("Levels"),
  nodeLevel: () => t.__("Level"),
  levelRoot: () => t.__("Root"),
  levelOne: () => t.__("Level 1"),
  levelTwo: () => t.__("Level 2"),
  levelDeeper: () => t.__("Level 3+"),
  followMap: () => t.__("Follow map"),
  nodeLevelsHint: () =>
    t.__("Overrides the map-wide node style for this level. A node's own fill still wins."),
  edgeTaper: () => t.__("Taper"),
  edgeTaperToggle: () => t.__("Thinner toward the leaves"),
  edgeTaperTitle: () =>
    t.__("Connector lines get thinner with each level away from the root"),
  edgeMinWidth: () => t.__("Minimum width"),
  edgeBranchColors: () => t.__("Branch colors"),
  edgeBranchColorsHint: () =>
    t.__("Overrides the line color; arrows follow the branch color."),
  branchOff: () => t.__("Off"),
  branchRainbow: () => t.__("Rainbow"),
  branchPastel: () => t.__("Pastel"),
  branchMono: () => t.__("Mono"),
  nodePaddingX: () => t.__("Horizontal padding"),
  nodePaddingY: () => t.__("Vertical padding"),
  fitToWindow: () => t.__("Fit to window"),
  fitToWindowTitle: () => t.__("Fit the whole map in the window (Shift+1)"),
  nodeWidthMax: () => t.__("Max width"),
  resizeHandleTitle: () =>
    t.__("Drag the right edge to resize this node"),
  line: () => t.__("Line"),
  looseLayout: () => t.__("Extra open spacing between topics and branches"),
  markdownFormatting: () => t.__("Markdown formatting"),
  mindMapFont: () => t.__("Mind map font and size"),
  mindMapShortcuts: () => t.__("Mind map shortcuts"),
  mindMapTheme: () => t.__("Mind map theme"),
  pageControls: () =>
    t.__("Page and mind map controls"),
  articleControls: () => t.__("Article reading controls"),
  bookControls: () => t.__("Book reading controls"),
  bookPage: () => t.__("Book page"),
  bookSpread: () => t.__("Spread"),
  bookSpreadOne: () => t.__("One"),
  bookSpreadOneTitle: () => t.__("One page at a time"),
  bookSpreadTwo: () => t.__("Two"),
  bookSpreadTwoTitle: () => t.__("Facing pages like an open book"),
  bookPrevious: () => t.__("Previous pages"),
  bookNext: () => t.__("Next pages"),
  bookSpine: () => t.__("Spine"),
  bookSpineRule: () => t.__("Spine rule"),
  bookSpineRuleOnTitle: () => t.__("Draw a thin rule in the spine"),
  bookSpineRuleOffTitle: () => t.__("No spine rule"),
  columns: () => t.__("Columns"),
  columnsOne: () => t.__("One"),
  columnsOneTitle: () => t.__("Single reading column"),
  columnsTwo: () => t.__("Two"),
  columnsTwoTitle: () => t.__("Two reading columns"),
  columnsThree: () => t.__("Three"),
  columnsThreeTitle: () => t.__("Three reading columns"),
  columnGap: () => t.__("Column gap"),
  columnFill: () => t.__("Column fill"),
  columnFillBalance: () => t.__("Balance"),
  columnFillBalanceTitle: () =>
    t.__("Balance text height across columns"),
  columnFillAuto: () => t.__("Auto"),
  columnFillAutoTitle: () =>
    t.__("Fill columns in order (newspaper style)"),
  columnRule: () => t.__("Column rule"),
  columnRuleOn: () => t.__("On"),
  columnRuleOnTitle: () => t.__("Draw a thin rule between columns"),
  columnRuleOff: () => t.__("Off"),
  columnRuleOffTitle: () => t.__("No rule between columns"),
  type: () => t.__("Type"),
  articleType: () => t.__("Article type"),
  articlePage: () => t.__("Article page"),
  articleTheme: () => t.__("Article theme"),
  articleThemeNotebook: () => t.__("Notebook"),
  articleThemeNotebookTitle: () =>
    t.__("Jupyter reading column on ruled notebook paper"),
  articleThemeEssay: () => t.__("Essay"),
  articleThemeEssayTitle: () =>
    t.__("Narrow serif essay on warm sepia paper"),
  articleThemeMagazine: () => t.__("Magazine"),
  articleThemeMagazineTitle: () =>
    t.__("Two-column newsprint with centered display titles"),
  articleThemeNight: () => t.__("Night"),
  articleThemeNightTitle: () =>
    t.__("Dark ink page with larger type for low light"),
  articleThemeAcademic: () => t.__("Academic"),
  articleThemeAcademicTitle: () =>
    t.__("Paged Times paper — justified body, restrained titles"),
  articleThemeMinimal: () => t.__("Minimal"),
  articleThemeMinimalTitle: () =>
    t.__("Narrow sans column with generous whitespace"),
  articleCode: () => t.__("Code"),
  articleImage: () => t.__("Image"),
  articleElements: () => t.__("Elements"),
  articleFont: () => t.__("Article body font"),
  articleBody: () => t.__("Article body"),
  body: () => t.__("Body"),
  articleParagraph: () => t.__("Article paragraph"),
  paragraph: () => t.__("Paragraph"),
  paragraphSpacing: () => t.__("Spacing"),
  paragraphSpacingCompact: () => t.__("Compact"),
  paragraphSpacingCompactTitle: () =>
    t.__("Tighter space between paragraphs"),
  paragraphSpacingReading: () => t.__("Reading"),
  paragraphSpacingReadingTitle: () =>
    t.__("Comfortable space between paragraphs"),
  paragraphSpacingLoose: () => t.__("Loose"),
  paragraphSpacingLooseTitle: () =>
    t.__("Open space between paragraphs"),
  paragraphIndent: () => t.__("Indent"),
  paragraphIndentNone: () => t.__("None"),
  paragraphIndentNoneTitle: () => t.__("No first-line indent"),
  paragraphIndentHalf: () => t.__("Half"),
  paragraphIndentHalfTitle: () => t.__("About one em first-line indent"),
  paragraphIndentFull: () => t.__("Full"),
  paragraphIndentFullTitle: () =>
    t.__("About two em first-line indent"),
  paragraphAlignLeftTitle: () => t.__("Left-align body paragraphs"),
  paragraphAlignJustifyTitle: () =>
    t.__("Justify body paragraphs for even edges"),
  alignJustify: () => t.__("Justify"),
  articleHeader: () => t.__("Article headers"),
  header: () => t.__("Header"),
  alignment: () => t.__("Alignment"),
  alignLeft: () => t.__("Left"),
  alignLeftTitle: () => t.__("Left-align heading"),
  alignCenter: () => t.__("Center"),
  alignCenterTitle: () => t.__("Center heading"),
  alignRight: () => t.__("Right"),
  alignRightTitle: () => t.__("Right-align heading"),
  padding: () => t.__("Padding"),
  paddingCompact: () => t.__("Compact"),
  paddingCompactTitle: () => t.__("Tighter page margins"),
  paddingReading: () => t.__("Reading"),
  paddingReadingTitle: () => t.__("Comfortable page margins"),
  paddingLoose: () => t.__("Loose"),
  paddingLooseTitle: () => t.__("Open page margins"),
  page: () => t.__("Page"),
  leading: () => t.__("Leading"),
  leadingCompact: () => t.__("Compact"),
  leadingCompactTitle: () =>
    t.__("Tighter line spacing for dense pages"),
  leadingReading: () => t.__("Reading"),
  leadingReadingTitle: () =>
    t.__("Comfortable spacing for long-form reading"),
  leadingLoose: () => t.__("Loose"),
  leadingLooseTitle: () => t.__("Open spacing for a slower read"),
  leadingSliderTitle: () =>
    t.__("Line height from 0.5× to 3× of the body size"),
  paragraphSpacingSliderTitle: () =>
    t.__("Space between paragraphs from 0em to 3em"),
  paragraphIndentSliderTitle: () =>
    t.__("First-line indent from 0em to 3em"),
  tracking: () => t.__("Tracking"),
  letterSpacingSliderTitle: () =>
    t.__("Letter spacing from 0em to 0.15em"),
  linkStyle: () => t.__("Links"),
  linkStyleDefault: () => t.__("Default"),
  linkStyleDefaultTitle: () =>
    t.__("Theme default link appearance"),
  linkStyleUnderline: () => t.__("Underline"),
  linkStyleUnderlineTitle: () =>
    t.__("Always underline body links"),
  linkStyleAccent: () => t.__("Accent"),
  linkStyleAccentTitle: () =>
    t.__("Use accent color for links"),
  codeStylePlain: () => t.__("Plain"),
  codeStylePlainTitle: () =>
    t.__("Inline code without extra background"),
  codeStyleMuted: () => t.__("Muted"),
  codeStyleMutedTitle: () =>
    t.__("Soft background for inline and block code"),
  codeStyleContrast: () => t.__("Contrast"),
  codeStyleContrastTitle: () =>
    t.__("Strong background for code blocks"),
  articleTable: () => t.__("Table"),
  tableStyle: () => t.__("Style"),
  tableStylePlain: () => t.__("Plain"),
  tableStylePlainTitle: () =>
    t.__("No borders — Word Plain Table"),
  tableStyleGrid: () => t.__("Grid"),
  tableStyleGridTitle: () =>
    t.__("Full grid — Word Table Grid"),
  tableStyleLines: () => t.__("Lines"),
  tableStyleLinesTitle: () =>
    t.__("Horizontal rules only"),
  tableStyleBanded: () => t.__("Banded"),
  tableStyleBandedTitle: () =>
    t.__("Alternating row fill with header bar"),
  tableStyleBooktabs: () => t.__("Booktabs"),
  tableStyleBooktabsTitle: () =>
    t.__("LaTeX booktabs — thick outer rules, no verticals"),
  tableStyleRuled: () => t.__("Ruled"),
  tableStyleRuledTitle: () =>
    t.__("Academic three-line table"),
  tableBorderWidth: () => t.__("Border"),
  tableTransparency: () => t.__("Table background transparency"),
  tableHeaderRowBold: () => t.__("Bold header row"),
  tableHeaderRowBoldTitle: () =>
    t.__("Make the first row (column headers) bold"),
  tableHeaderColumnBold: () => t.__("Bold first column"),
  tableHeaderColumnBoldTitle: () =>
    t.__("Make the first column (row headers) bold"),
  articleList: () => t.__("List"),
  listSpacing: () => t.__("Spacing"),
  listStyleCompact: () => t.__("Compact"),
  listStyleCompactTitle: () => t.__("Tighter space between list items"),
  listStyleNormal: () => t.__("Normal"),
  listStyleNormalTitle: () => t.__("Comfortable list item spacing"),
  listStyleRelaxed: () => t.__("Relaxed"),
  listStyleRelaxedTitle: () => t.__("Open space between list items"),
  articleQuote: () => t.__("Quote"),
  blockquoteWeight: () => t.__("Blockquote"),
  hrWeight: () => t.__("Divider"),
  hrThickness: () => t.__("Divider thickness"),
  hrThicknessAuto: () => t.__("Preset"),
  hrStyle: () => t.__("Divider line"),
  hrStyleSolid: () => t.__("Solid"),
  hrStyleDashed: () => t.__("Dashed"),
  hrStyleDotted: () => t.__("Dotted"),
  hrStyleDouble: () => t.__("Double"),
  hrColor: () => t.__("Divider color"),
  ruleWeightLight: () => t.__("Light"),
  ruleWeightLightTitle: () => t.__("Thin, quiet rule"),
  ruleWeightNormal: () => t.__("Normal"),
  ruleWeightNormalTitle: () => t.__("Standard emphasis"),
  ruleWeightStrong: () => t.__("Strong"),
  ruleWeightStrongTitle: () => t.__("Heavier rule with more presence"),
  codeTheme: () => t.__("Palette"),
  codeThemeNotebook: () => t.__("Notebook"),
  codeThemeNotebookTitle: () =>
    t.__("JupyterLab default syntax colors"),
  codeThemePython: () => t.__("Python"),
  codeThemePythonTitle: () =>
    t.__("Blue keywords and deep string tones"),
  codeThemeJavascript: () => t.__("JavaScript"),
  codeThemeJavascriptTitle: () =>
    t.__("Red keywords with amber accents"),
  codeThemeR: () => t.__("R"),
  codeThemeRTitle: () => t.__("RStudio-style blues and greens"),
  codeThemeJulia: () => t.__("Julia"),
  codeThemeJuliaTitle: () => t.__("Julia purple, green, and red accents"),
  codeThemeSql: () => t.__("SQL"),
  codeThemeSqlTitle: () => t.__("Classic SQL blue keywords"),
  codeThemeRust: () => t.__("Rust"),
  codeThemeRustTitle: () => t.__("Warm rust orange keywords"),
  codeThemeMatlab: () => t.__("MATLAB"),
  codeThemeMatlabTitle: () => t.__("Classic MATLAB blue and purple"),
  codeThemeShell: () => t.__("Shell"),
  codeThemeShellTitle: () => t.__("Teal keywords for shell scripts"),
  columnAlign: () => t.__("Column"),
  columnAlignLeftTitle: () =>
    t.__("Align the text column to the left"),
  columnAlignCenterTitle: () =>
    t.__("Center the text column in the pane"),
  pageLayout: () => t.__("Layout"),
  pageLayoutScroll: () => t.__("Scroll"),
  pageLayoutScrollTitle: () =>
    t.__("Continuous reading column (no paper frame)"),
  pageLayoutPaged: () => t.__("Paged"),
  pageLayoutPagedTitle: () =>
    t.__("Print-style paper preview — use Export → PDF to save"),
  paperSize: () => t.__("Paper"),
  paperSizeA4: () => t.__("A4"),
  paperSizeA4Title: () => t.__("210 × 297 mm"),
  paperSizeA3: () => t.__("A3"),
  paperSizeA3Title: () => t.__("297 × 420 mm"),
  paperSizeA5: () => t.__("A5"),
  paperSizeA5Title: () => t.__("148 × 210 mm"),
  paperSizeB5: () => t.__("B5"),
  paperSizeB5Title: () => t.__("176 × 250 mm"),
  paperSizeLegal: () => t.__("Legal"),
  paperSizeLegalTitle: () => t.__("8.5 × 14 in"),
  paperSizeLetter: () => t.__("Letter"),
  paperSizeLetterTitle: () => t.__("8.5 × 11 in"),
  paperOrientationPortrait: () => t.__("Portrait"),
  paperOrientationPortraitTitle: () => t.__("Tall page (switches to Paged)"),
  paperOrientationLandscape: () => t.__("Landscape"),
  paperOrientationLandscapeTitle: () => t.__("Wide page (switches to Paged)"),
  paperBorderColor: () => t.__("Edge color"),
  paperBorderWidth: () => t.__("Edge width"),
  paperShadow: () => t.__("Shadow"),
  paperShadowTitle: () => t.__("Drop shadow around the paper sheet"),
  paperShadowWidth: () => t.__("Shadow width"),
  text: () => t.__("Text"),
  textStyle: () => t.__("Text style"),
  paragraphStyle: () => t.__("Paragraph style"),
  headings: () => t.__("Headings"),
  headingStyles: () => t.__("Heading styles"),
  codeStyleMenu: () => t.__("Code style"),
  pageSetup: () => t.__("Page setup"),
  slidesHeaderFooter: () => t.__("Slide header, footer & controls"),
  slidesPageElements: () => t.__("Page elements"),
  slidesPresentationControls: () => t.__("Presentation controls"),
  slidesLook: () => t.__("Look"),
  headerFooter: () => t.__("Header & footer"),
  articleHeaderFooter: () => t.__("Article header, footer & page numbers"),
  pageHeader: () => t.__("Header"),
  pageFooter: () => t.__("Footer"),
  pageNumbers: () => t.__("Page numbers"),
  pageFurnitureText: () => t.__("Text"),
  pageFurnitureTextTitle: () =>
    t.__("Placeholders: {title} file name, {page} page, {pages} total"),
  pageFurnitureAlign: () => t.__("Alignment"),
  pageFurniturePagedOnly: () =>
    t.__("Shown in Paged layout (Page → Layout → Paged)"),
  pageNumberFormat: () => t.__("Format"),
  pageNumberNone: () => t.__("None"),
  pageNumberNoneTitle: () => t.__("No page numbers"),
  pageNumberPage: () => t.__("3"),
  pageNumberPageTitle: () => t.__("Page number only"),
  pageNumberPageOfTotal: () => t.__("3 / 12"),
  pageNumberPageOfTotalTitle: () => t.__("Page number and page count"),
  pageNumberDashes: () => t.__("– 3 –"),
  pageNumberDashesTitle: () => t.__("Page number between dashes"),
  pageNumberBracket: () => t.__("[3]"),
  pageNumberBracketTitle: () => t.__("Page number in square brackets"),
  pageNumberWord: () => t.__("Page 3"),
  pageNumberWordTitle: () => t.__("The word Page and the page number"),
  pageNumberWordOfTotal: () => t.__("Page 3 of 12"),
  pageNumberWordOfTotalTitle: () => t.__("The word Page, the page number and the page count"),
  pageNumberRomanLower: () => t.__("iii"),
  pageNumberRomanLowerTitle: () => t.__("Lower-case Roman numerals (i, ii, iii…)"),
  pageNumberRomanUpper: () => t.__("III"),
  pageNumberRomanUpperTitle: () => t.__("Upper-case Roman numerals (I, II, III…)"),
  pageNumberSize: () => t.__("Size"),
  pageNumberPosition: () => t.__("Position"),
  pageNumberInHeader: () => t.__("Header"),
  pageNumberInHeaderTitle: () => t.__("Top margin of each page"),
  pageNumberInFooter: () => t.__("Footer"),
  pageNumberInFooterTitle: () => t.__("Bottom margin of each page"),
  pageNumberStart: () => t.__("Starts on"),
  pageNumberStartFirst: () => t.__("First page"),
  pageNumberStartFirstTitle: () =>
    t.__("Number from the first page (1, 2, 3…)"),
  pageNumberStartSecond: () => t.__("Second page"),
  pageNumberStartSecondTitle: () =>
    t.__("Skip the first page; numbering begins on page 2 as 1"),
  imageWidth: () => t.__("Size"),
  images: () => t.__("Images"),
  imageWidthNatural: () => t.__("Natural"),
  imageWidthNaturalTitle: () =>
    t.__("Keep images at their natural width"),
  imageWidthWide: () => t.__("Wide"),
  imageWidthWideTitle: () =>
    t.__("Expand images to the column width"),
  imageWidthFull: () => t.__("Full"),
  imageWidthFullTitle: () =>
    t.__("Let images span the full pane width"),
  imageLayout: () => t.__("Layout"),
  imageAlignLeftTitle: () => t.__("Place images on the left"),
  imageAlignCenterTitle: () => t.__("Center images in the column"),
  imageAlignRightTitle: () => t.__("Place images on the right"),
  imageWrap: () => t.__("Wrap"),
  imageWrapNone: () => t.__("Block"),
  imageWrapNoneTitle: () =>
    t.__("Images sit on their own line; text stays above and below"),
  imageWrapLeft: () => t.__("Left + wrap"),
  imageWrapLeftTitle: () =>
    t.__("Image on the left; following text wraps on the right"),
  imageWrapRight: () => t.__("Right + wrap"),
  imageWrapRightTitle: () =>
    t.__("Image on the right; following text wraps on the left"),
  imageBorder: () => t.__("Border"),
  imageBorderColor: () => t.__("Color"),
  imageBorderNone: () => t.__("None"),
  imageBorderNoneTitle: () => t.__("No frame around images"),
  imageBorderSolid: () => t.__("Solid"),
  imageBorderSolidTitle: () => t.__("Continuous line"),
  imageBorderDashed: () => t.__("Dashed"),
  imageBorderDashedTitle: () => t.__("Dashed line"),
  imageBorderDotted: () => t.__("Dotted"),
  imageBorderDottedTitle: () => t.__("Dotted line"),
  imageBorderDouble: () => t.__("Double"),
  imageBorderDoubleTitle: () => t.__("Two parallel lines"),
  measure: () => t.__("Measure"),
  measureNarrow: () => t.__("Narrow"),
  measureNarrowTitle: () => t.__("About 42rem — essay column"),
  measureReading: () => t.__("Reading"),
  measureReadingTitle: () =>
    t.__("About 52rem — default article column"),
  measureWide: () => t.__("Wide"),
  measureWideTitle: () => t.__("About 68rem — magazine column"),
  measureFull: () => t.__("Full"),
  measureFullTitle: () => t.__("Use the full pane width"),
  surface: () => t.__("Surface"),
  pageTheme: () => t.__("Theme"),
  pageThemeTitle: () => t.__("Follow the Jupyter theme"),
  pagePaper: () => t.__("Paper"),
  pagePaperTitle: () => t.__("Warm off-white page for long reading"),
  pageNewspaper: () => t.__("Newspaper"),
  pageNewspaperTitle: () => t.__("Cream newsprint tone"),
  pageEyeCare: () => t.__("Eye Care"),
  pageEyeCareTitle: () =>
    t.__("Soft green tint to reduce eye strain"),
  pageInk: () => t.__("Ink"),
  pageInkTitle: () => t.__("Dark page for night reading"),
  pageSepia: () => t.__("Sepia"),
  pageSepiaTitle: () =>
    t.__("Warm sepia tone for long reading sessions"),
  pageMist: () => t.__("Mist"),
  pageMistTitle: () =>
    t.__("Cool light gray page with a soft haze"),
  backgroundLines: () => t.__("Lines"),
  backgroundLinesTitle: () =>
    t.__("Horizontal ruled lines like notebook paper"),
  backgroundNotebook: () => t.__("Notebook"),
  backgroundNotebookTitle: () =>
    t.__("Margin and ruled lines like a notebook page"),
  newVersionAvailable: () => t.__("A newer version is available"),
  node: () => t.__("Node"),
  redo: () => t.__("Redo"),
  imageDropFailed: () =>
    t.__("Could not save the dropped image next to this document."),
  undo: () => t.__("Undo"),
  nodeAppearance: () =>
    t.__("Node width, fill, border, and selection glow"),
  nodeFillDefault: () => t.__("Map fill"),
  nodeFillTransparency: () => t.__("Fill transparency"),
  nodeFillSelected: () => t.__("Selected fill"),
  nodeFillSelectHint: () =>
    t.__("Select a node to set a custom fill"),
  nodeBorderStyle: () => t.__("Border style"),
  nodeBorderWidth: () => t.__("Border width"),
  nodeBorderColor: () => t.__("Border color"),
  selectionGlowColor: () => t.__("Selection glow color"),
  selectionGlowWidth: () => t.__("Selection glow width"),
  hover: () => t.__("Hover"),
  hoverGlowColor: () => t.__("Hover glow color"),
  hoverGlowWidth: () => t.__("Hover glow width"),
  hoverGlowFollowsBorderHint: () =>
    t.__(
      "Default uses the map node border color when set; otherwise blue.",
    ),
  nodeLayoutSpacing: () => t.__("Node layout spacing"),
  normalLayout: () => t.__("Balanced default spacing like XMind auto layout"),
  openRepository: () => t.__("Open GitHub repository"),
  repository: () => t.__("Repository"),
  style: () => t.__("Style"),
  route: () => t.__("Route"),
  theme: () => t.__("Theme"),
  restoreThemeDefaults: () => t.__("Restore theme defaults"),
  restoreThemeDefaultsTitle: () =>
    t.__("Reset page, background, and appearance for this theme"),
  mindMapThemeSoft: () => t.__("Soft"),
  mindMapThemeOutline: () => t.__("Outline"),
  mindMapThemePaper: () => t.__("Paper"),
  mindMapThemeBoard: () => t.__("Board"),
  mindMapThemeBlack: () => t.__("Black"),
  density: () => t.__("Density"),
  spacing: () => t.__("Spacing"),
  width: () => t.__("Width"),
  color: () => t.__("Color"),
  boldColor: () => t.__("Bold"),
  boldColorTitle: () =>
    t.__("Color for bold body text; empty inherits the body color"),
  arrow: () => t.__("Arrow"),
  arrowStyle: () => t.__("Arrow style"),
  fill: () => t.__("Fill"),
  border: () => t.__("Border"),
  borderWidth: () => t.__("Border width"),
  corner: () => t.__("Corner"),
  selection: () => t.__("Selection"),
  tree: () => t.__("Tree"),
  treeBottomToTop: () => t.__("Bottom to top"),
  treeLeftToRight: () => t.__("Left to right"),
  treeRightToLeft: () => t.__("Right to left"),
  treeTopToBottom: () => t.__("Top to bottom"),
  upToDate: () => t.__("You are on the latest version"),
  version: () => t.__("Version"),
  zoom: () => t.__("Zoom"),
  zoomIn: () => t.__("Zoom in"),
  zoomOut: () => t.__("Zoom out"),
  zoomSlider: () => t.__("Adjust zoom (20%–200%)"),
  view: () => t.__("Kuusi View"),
  openRenderViewBesideEditor: () =>
    t.__("Open the Kuusi view beside this editor"),
  export: () => t.__("Export"),
  exportRenderView: () => t.__("Export this render view"),
  exportPdf: () => t.__("PDF"),
  exportPdfTitle: () =>
    t.__("Download this view as a PDF file (one page per page or slide)"),
  exportPdfSourceTitle: () => t.__("Download the PDF file"),
  exportPdfVector: () => t.__("PDF…"),
  exportPdfVectorTitle: () =>
    t.__(
      "Open the print dialog and choose “Save as PDF”: sharp text that stays selectable",
    ),
  exportAddBookmarks: () => t.__("Add bookmarks and links…"),
  exportAddBookmarksTitle: () =>
    t.__(
      "Pick the PDF you saved: headings become bookmarks (the reader's contents sidebar) and the contents page links jump to their page",
    ),
  exportBookmarksHint: () =>
    t.__("Saved a PDF? Add bookmarks and working contents links for PDF readers such as Preview."),
  exportBookmarksFailed: () =>
    t.__("Could not add bookmarks: pick the PDF saved from this view's PDF… export."),
  exportBookmarksDone: (name: string) => t.__("Saved %1 with bookmarks.", name),
  exportImage: (format: string) => t.__("%1 image", format),
  exportImageTitle: (format: string, scope: string) =>
    t.__("Download %1 as a %2 image", scope, format),
  exportScopeSlide: () => t.__("the current slide"),
  exportScopeMindMap: () => t.__("the whole mind map"),
  exportScopeView: () => t.__("the current page"),
  exportWorking: (name: string) => t.__("Exporting %1…", name),
  exportWorkingPage: (name: string, page: number, total: number) =>
    t.__("Exporting %1… page %2 of %3", name, page, total),
  exportDone: (name: string) => t.__("Downloaded %1.", name),
  exportFailed: (reason: string) => t.__("Export failed: %1", reason),
  exportNothing: () => t.__("This view has nothing to export yet."),
  exportWebpFallback: () =>
    t.__("This browser cannot encode WebP; saved as PNG instead."),
  exportHtml: () => t.__("HTML"),
  exportHtmlTitle: () => t.__("Download the rendered HTML"),
  exportDownloadSource: () => t.__("Download"),
  exportDownloadSourceTitle: () => t.__("Download the source file"),
  slidesControls: () => t.__("Slides controls"),
  slidesTheme: () => t.__("Slides theme"),
  slidesThemeClassic: () => t.__("Classic"),
  slidesThemeClassicTitle: () =>
    t.__("White stage — notebook type, balanced chrome"),
  slidesThemeNight: () => t.__("Night"),
  slidesThemeNightTitle: () =>
    t.__("Dark projector stage — larger type, centered content"),
  slidesThemeForest: () => t.__("Forest"),
  slidesThemeForestTitle: () =>
    t.__("Deep green stage with warm serif type"),
  slidesThemeOcean: () => t.__("Ocean"),
  slidesThemeOceanTitle: () =>
    t.__("Blue stage — centered sans titles and progress"),
  slidesThemeSlate: () => t.__("Slate"),
  slidesThemeSlateTitle: () =>
    t.__("Cool gray modern stage — compact, flat chrome"),
  slidesThemePaper: () => t.__("Paper"),
  slidesThemePaperTitle: () =>
    t.__("Warm paper stage with reading-friendly serif"),
  slidesThemeMetropolis: () => t.__("Metropolis"),
  slidesThemeMetropolisTitle: () =>
    t.__("Flat modern Beamer look — compact, progress bar"),
  slidesThemeMadrid: () => t.__("Madrid"),
  slidesThemeMadridTitle: () =>
    t.__("Structured Beamer look — header bar and footer"),
  slidesThemeBerlin: () => t.__("Berlin"),
  slidesThemeBerlinTitle: () =>
    t.__("Cool slate Beamer look — accent rail, compact"),
  slidesThemeCopenhagen: () => t.__("Copenhagen"),
  slidesThemeCopenhagenTitle: () =>
    t.__("Light Beamer look — airy padding, quiet chrome"),
  slidesThemeSingapore: () => t.__("Singapore"),
  slidesThemeSingaporeTitle: () =>
    t.__("Bold Beamer look — centered titles, strong accent"),
  slidesLayout: () => t.__("Slides layout"),
  slidesRatio: () => t.__("Ratio"),
  slidesRatioWidescreen: () => t.__("16:9"),
  slidesRatioWidescreenTitle: () =>
    t.__("Widescreen stage (16:9)"),
  slidesRatioClassic: () => t.__("4:3"),
  slidesRatioClassicTitle: () =>
    t.__("Classic projector stage (4:3)"),
  slidesRatioSquare: () => t.__("1:1"),
  slidesRatioSquareTitle: () =>
    t.__("Square stage (1:1)"),
  slidesDensity: () => t.__("Lists"),
  slidesDensityCompact: () => t.__("Compact"),
  slidesDensityCompactTitle: () =>
    t.__("Tighter spacing between list items"),
  slidesDensityNormal: () => t.__("Normal"),
  slidesDensityNormalTitle: () =>
    t.__("Default list item spacing"),
  slidesDensityLoose: () => t.__("Loose"),
  slidesDensityLooseTitle: () =>
    t.__("Roomier spacing between list items"),
  slidesHeadingScale: () => t.__("Headings"),
  slidesHeadingScaleSm: () => t.__("Small"),
  slidesHeadingScaleSmTitle: () =>
    t.__("Smaller slide headings"),
  slidesHeadingScaleMd: () => t.__("Medium"),
  slidesHeadingScaleMdTitle: () =>
    t.__("Default slide heading size"),
  slidesHeadingScaleLg: () => t.__("Large"),
  slidesHeadingScaleLgTitle: () =>
    t.__("Larger slide headings"),
  slidesTextColor: () => t.__("Text color"),
  slidesAccent: () => t.__("Accent"),
  slidesAccentColor: () => t.__("Accent color"),
  slidesSplit: () => t.__("Split"),
  slidesSplitAuto: () => t.__("Outline"),
  slidesSplitAutoTitle: () =>
    t.__(
      "New slide at each # / ## / ###; --- optional; long slides auto-split",
    ),
  slidesSplitRules: () => t.__("--- rules"),
  slidesSplitRulesTitle: () =>
    t.__("Split only on lines that are exactly ---"),
  slidesSplitHeadings: () => t.__("Headings only"),
  slidesSplitHeadingsTitle: () =>
    t.__("New slide at each # / ## / ### (ignore ---)"),
  slidesStage: () => t.__("Slide stage"),
  slidesPrevious: () => t.__("Previous slide"),
  slidesNext: () => t.__("Next slide"),
  slidesBody: () => t.__("Slide type"),
  slidesCode: () => t.__("Code"),
  slidesCodeFrame: () => t.__("Border"),
  slidesCodeFrameTitle: () =>
    t.__("Draw a border around fenced code blocks"),
  slidesCodeFrameColor: () => t.__("Border color"),
  slidesChrome: () => t.__("Chrome"),
  slidesPageChrome: () => t.__("Page"),
  slidesHeaderTitle: () =>
    t.__("Show the slide header bar"),
  slidesHeaderSource: () => t.__("Header text"),
  slidesHeaderH1: () => t.__("Heading 1"),
  slidesHeaderH1Title: () =>
    t.__("Use the nearest H1 at or before this slide"),
  slidesHeaderH2: () => t.__("Heading 2"),
  slidesHeaderH2Title: () =>
    t.__("Use the nearest H2 at or before this slide"),
  slidesHeaderH3: () => t.__("Heading 3"),
  slidesHeaderH3Title: () =>
    t.__("Use the nearest H3 at or before this slide"),
  slidesHeaderCustom: () => t.__("Custom"),
  slidesHeaderCustomTitle: () =>
    t.__("Use a fixed custom header string"),
  slidesHeaderCustomText: () => t.__("Custom text"),
  slidesHeaderCustomTextTitle: () =>
    t.__("Text shown in the slide header bar"),
  slidesHeaderCustomPlaceholder: () => t.__("Header text…"),
  slidesAlign: () => t.__("Align"),
  slidesAlignTop: () => t.__("Top"),
  slidesAlignTopTitle: () => t.__("Align slide content to the top"),
  slidesAlignCenterTitle: () =>
    t.__("Vertically center slide content"),
  slidesAlignBottom: () => t.__("Bottom"),
  slidesAlignBottomTitle: () =>
    t.__("Align slide content to the bottom"),
  slidesPaddingCompactTitle: () =>
    t.__("Tighter padding inside the slide stage"),
  slidesPaddingNormal: () => t.__("Normal"),
  slidesPaddingNormalTitle: () =>
    t.__("Default padding inside the slide stage"),
  slidesPaddingLooseTitle: () =>
    t.__("Roomier padding inside the slide stage"),
  slidesNavButtons: () => t.__("Buttons"),
  slidesNavButtonsTitle: () =>
    t.__("Show previous / next buttons under the stage"),
  slidesPageNumber: () => t.__("Page number"),
  slidesPageNumberTitle: () =>
    t.__("Show the page number on the slide footer"),
  slidesPageNumberDash: () => t.__("3 – 12"),
  slidesPageNumberDashTitle: () =>
    t.__("Page number and count separated by an en dash"),
  slidesFooter: () => t.__("Footer"),
  slidesProgressShadowTitle: () => t.__("Soft glow under the progress bar"),
  notebookSettings: () => t.__("Notebook"),
  cellBarColor: () => t.__("Command-mode cell bar"),
  autoReloadDefault: () => t.__("Auto reload by default"),
  autoReloadDefaultTitle: () =>
    t.__("Reload notebooks and Markdown views when the file changes on disk. Each file can still be switched in its … menu."),
  cellBorderColor: () => t.__("Selected cell border"),
  cellColorsHint: () =>
    t.__("The bar beside the selected cell (command mode) and the border round it are set separately. Empty keeps JupyterLab's colors."),
  cellBarColorHint: () =>
    t.__("Color of the bar beside the selected cell while the notebook is in command mode."),
  slidesChromeFontSize: () => t.__("Text size"),
  articleOverview: () => t.__("Page overview"),
  articleOverviewTitle: () => t.__("Overview of all pages (G)"),
  slidesHeaderStyle: () => t.__("Header style"),
  slidesFooterStyle: () => t.__("Footer style"),
  slidesFooterText: () => t.__("Footer text"),
  slidesFooterTextTitle: () =>
    t.__("Tokens: {title} {chapter} {section} {subsection} {page} {total} {date}. Empty shows the deck title."),
  slidesOverview: () => t.__("Slide overview"),
  slidesOverviewTitle: () => t.__("Overview of all pages (G)"),
  slidesChromeHeight: () => t.__("Bar height"),
  slidesChromeColor: () => t.__("Bar color"),
  slidesChromeTextColor: () => t.__("Text color"),
  slidesChromeBackground: () => t.__("Background"),
  slidesChromeOpacity: () => t.__("Opacity"),
  slidesFooterRule: () => t.__("Divider thickness"),
  slidesFooterTitle: () =>
    t.__("Show the slide footer bar"),
  slidesProgress: () => t.__("Progress"),
  slidesProgressTitle: () =>
    t.__("Show a progress bar for deck position"),
  slidesShadow: () => t.__("Shadow"),
  slidesShadowTitle: () =>
    t.__("Drop shadow around the slide stage"),
  };
};

export type KuusiTranslator = ReturnType<typeof createKuusiTranslator>;
