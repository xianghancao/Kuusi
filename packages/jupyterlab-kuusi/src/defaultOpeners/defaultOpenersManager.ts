import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { ISettingRegistry } from "@jupyterlab/settingregistry";
import {
  DEFAULT_OPENERS_PLUGIN_ID,
  DOC_MANAGER_SETTINGS_PLUGIN_ID,
  FACTORY_EDITOR,
  FACTORY_NOTEBOOK,
  FILE_TYPE_MARKDOWN,
  FILE_TYPE_NOTEBOOK,
} from "./constants";
import {
  DEFAULT_OPENERS_STATE,
  type DefaultOpenersState,
  setDefaultOpenersState,
} from "./defaultOpenersState";
import { effectiveDefaultOpenersState } from "./openersStateForRelease";
import { setNotebookAutoReloadDefault } from "../notebookAutoReloadRegistry";
import {
  getEnabledRenderViews,
  getRenderViewOrder,
  setEnabledRenderViews,
  normalizeRenderViewOrder,
  setRenderViewOrder,
} from "../renderViewOrder";

const readBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const normalizeState = (raw: Record<string, unknown>): DefaultOpenersState => ({
  notebook: readBoolean(
    raw.useKuusiForNotebook,
    DEFAULT_OPENERS_STATE.notebook,
  ),
  markdown: readBoolean(
    raw.useKuusiForMarkdown,
    DEFAULT_OPENERS_STATE.markdown,
  ),
});

const buildDefaultViewers = (
  current: Record<string, string>,
  _state: DefaultOpenersState,
): Record<string, string> => {
  const next = { ...current };

  // Notebook / Markdown always open the left editor factory. When the Kuusi
  // opener toggle is on, bindKuusiSplitWorkspaceOnOpen adds the render pane.
  next[FILE_TYPE_NOTEBOOK] = FACTORY_NOTEBOOK;
  next[FILE_TYPE_MARKDOWN] = FACTORY_EDITOR;

  return next;
};

const CELL_BAR_VAR = "--kuusi-cell-bar-command";

/** Colour of the bar beside the selected cell in command mode ("" = Jupyter's). */
const applyCellBarColor = (color: unknown): void => {
  const value = typeof color === "string" ? color.trim() : "";
  const root = document.documentElement;

  if (/^#[0-9a-f]{3,8}$/i.test(value)) {
    root.style.setProperty(CELL_BAR_VAR, value);
  } else {
    root.style.removeProperty(CELL_BAR_VAR);
  }
};

const CELL_BORDER_VAR = "--kuusi-cell-border";

/** Colour of the ring round the selected cell ("" = Jupyter's own). */
const applyCellBorderColor = (color: unknown): void => {
  const value = typeof color === "string" ? color.trim() : "";
  const root = document.documentElement;

  if (/^#[0-9a-f]{3,8}$/i.test(value)) {
    root.style.setProperty(CELL_BORDER_VAR, value);
    // The editor's own border while editing uses this Jupyter variable.
    root.style.setProperty("--jp-cell-editor-active-border-color", value);
  } else {
    root.style.removeProperty(CELL_BORDER_VAR);
    root.style.removeProperty("--jp-cell-editor-active-border-color");
  }
};

export class DefaultOpenersManager {
  private _registry: ISettingRegistry;
  private _docRegistry: DocumentRegistry;
  private _kuusiSettings: ISettingRegistry.ISettings | null = null;
  private _docManagerSettings: ISettingRegistry.ISettings | null = null;
  private _state: DefaultOpenersState = { ...DEFAULT_OPENERS_STATE };
  private _ready: Promise<void>;
  private _whenAppReady: Promise<unknown>;
  private _applying = false;
  private _updating = false;

  constructor(
    registry: ISettingRegistry,
    docRegistry: DocumentRegistry,
    whenAppReady: Promise<unknown> = Promise.resolve(),
  ) {
    this._registry = registry;
    this._docRegistry = docRegistry;
    this._whenAppReady = whenAppReady;
    this._ready = this._initialize();
  }

  get state(): DefaultOpenersState {
    return { ...this._state };
  }

  ready(): Promise<void> {
    return this._ready;
  }

  get cellBarColor(): string {
    const value = this._kuusiSettings?.composite.cellBarColor;
    return typeof value === "string" ? value : "";
  }

  get autoReloadDefault(): boolean {
    const value = this._kuusiSettings?.composite.autoReloadDefault;
    return typeof value === "boolean" ? value : true;
  }

  async setAutoReloadDefault(enabled: boolean): Promise<void> {
    await this._ready;
    setNotebookAutoReloadDefault(enabled);
    this._updating = true;

    try {
      await this._registry.set(
        DEFAULT_OPENERS_PLUGIN_ID,
        "autoReloadDefault",
        enabled,
      );
    } finally {
      this._updating = false;
    }
  }

  get cellBorderColor(): string {
    const value = this._kuusiSettings?.composite.cellBorderColor;
    return typeof value === "string" ? value : "";
  }

  async setCellBorderColor(color: string): Promise<void> {
    await this._ready;
    applyCellBorderColor(color);
    this._updating = true;

    try {
      await this._registry.set(
        DEFAULT_OPENERS_PLUGIN_ID,
        "cellBorderColor",
        color,
      );
    } finally {
      this._updating = false;
    }
  }

  async setCellBarColor(color: string): Promise<void> {
    await this._ready;
    applyCellBarColor(color);
    this._updating = true;

    try {
      await this._registry.set(DEFAULT_OPENERS_PLUGIN_ID, "cellBarColor", color);
    } finally {
      this._updating = false;
    }
  }

  async setViewOrder(order: string[]): Promise<void> {
    await this._ready;

    const next = normalizeRenderViewOrder(order);
    setRenderViewOrder(next);

    this._updating = true;

    try {
      await this._registry.set(DEFAULT_OPENERS_PLUGIN_ID, "viewOrder", next);
    } finally {
      this._updating = false;
    }
  }

  async setEnabledViews(ids: string[]): Promise<void> {
    await this._ready;

    setEnabledRenderViews(ids);
    this._updating = true;

    try {
      await this._registry.set(
        DEFAULT_OPENERS_PLUGIN_ID,
        "enabledViews",
        getEnabledRenderViews(),
      );
    } finally {
      this._updating = false;
    }
  }

  get enabledViews(): string[] {
    return getEnabledRenderViews();
  }

  get viewOrder(): string[] {
    return getRenderViewOrder();
  }

  async setState(next: DefaultOpenersState): Promise<void> {
    await this._ready;

    this._state = effectiveDefaultOpenersState(next);
    setDefaultOpenersState(this._state);

    this._updating = true;

    try {
      await Promise.all([
        this._registry.set(
          DEFAULT_OPENERS_PLUGIN_ID,
          "useKuusiForNotebook",
          this._state.notebook,
        ),
        this._registry.set(
          DEFAULT_OPENERS_PLUGIN_ID,
          "useKuusiForMarkdown",
          this._state.markdown,
        ),
      ]);
    } finally {
      this._updating = false;
    }

    await this._applyDefaultViewers();
  }

  private async _initialize(): Promise<void> {
    this._kuusiSettings = await this._registry.load(DEFAULT_OPENERS_PLUGIN_ID);
    this._state = effectiveDefaultOpenersState(
      normalizeState(this._kuusiSettings.composite as Record<string, unknown>),
    );
    setDefaultOpenersState(this._state);
    setRenderViewOrder(this._kuusiSettings.composite.viewOrder);
    setEnabledRenderViews(this._kuusiSettings.composite.enabledViews);
    applyCellBarColor(this._kuusiSettings.composite.cellBarColor);
    applyCellBorderColor(this._kuusiSettings.composite.cellBorderColor);
    setNotebookAutoReloadDefault(this.autoReloadDefault);

    // The docmanager plugin registers its settings transformer during app
    // startup; loading earlier rejects ("has no transformers yet").
    await this._whenAppReady;
    try {
      this._docManagerSettings = await this._registry.load(
        DOC_MANAGER_SETTINGS_PLUGIN_ID,
      );
    } catch (error) {
      console.warn("jupyterlab-kuusi: docmanager settings unavailable", error);
    }

    this._kuusiSettings.changed.connect(() => {
      if (this._applying || this._updating) {
        return;
      }

      setRenderViewOrder(this._kuusiSettings!.composite.viewOrder);
      setEnabledRenderViews(this._kuusiSettings!.composite.enabledViews);
      applyCellBarColor(this._kuusiSettings!.composite.cellBarColor);
      applyCellBorderColor(this._kuusiSettings!.composite.cellBorderColor);
      setNotebookAutoReloadDefault(this.autoReloadDefault);

      this._state = effectiveDefaultOpenersState(
        normalizeState(this._kuusiSettings!.composite as Record<string, unknown>),
      );
      setDefaultOpenersState(this._state);
      void this._applyDefaultViewers();
    });

    this._docRegistry.changed.connect(() => {
      void this._applyDefaultViewers();
    });

    await this._applyDefaultViewers();
  }

  private async _applyDefaultViewers(): Promise<void> {
    if (!this._docManagerSettings) {
      return;
    }

    this._applying = true;

    try {
      const current =
        (this._docManagerSettings.get("defaultViewers")
          .composite as Record<string, string> | null) ?? {};
      const applied = effectiveDefaultOpenersState(this._state);
      const next = buildDefaultViewers(current, applied);

      await this._registry.set(
        DOC_MANAGER_SETTINGS_PLUGIN_ID,
        "defaultViewers",
        next,
      );
    } finally {
      this._applying = false;
    }
  }
}

let managerInstance: DefaultOpenersManager | null = null;

export const setDefaultOpenersManager = (
  manager: DefaultOpenersManager,
): void => {
  managerInstance = manager;
};

export const getDefaultOpenersManager = (): DefaultOpenersManager | null =>
  managerInstance;
