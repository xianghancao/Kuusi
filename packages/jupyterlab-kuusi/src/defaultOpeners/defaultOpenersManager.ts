import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { ISettingRegistry } from "@jupyterlab/settingregistry";
import {
  DEFAULT_OPENERS_PLUGIN_ID,
  DOC_MANAGER_SETTINGS_PLUGIN_ID,
  FACTORY_EDITOR,
  FACTORY_KUUSI_NOTEBOOK,
  FACTORY_IMAGE,
  FACTORY_KUUSI_IMAGE,
  FACTORY_KUUSI_PDF,
  FACTORY_KUUSI_VOICE,
  FACTORY_MARKDOWN_PREVIEW,
  FACTORY_NOTEBOOK,
  FACTORY_PDF,
  FILE_TYPE_MARKDOWN,
  FILE_TYPE_NOTEBOOK,
  FILE_TYPE_PDF,
} from "./constants";
import { applyAudioDefaultViewers } from "./applyAudioDefaultViewers";
import { applyImageDefaultViewers } from "./applyImageDefaultViewers";
import { applyPdfDefaultViewer } from "./applyPdfDefaultViewer";
import { KUUSI_IMAGE_FILE_TYPES } from "../imageView/imageFormats";
import { KUUSI_AUDIO_FILE_TYPE } from "../voiceRecorder/voiceFormats";
import {
  DEFAULT_OPENERS_STATE,
  type DefaultOpenersState,
  setDefaultOpenersState,
} from "./defaultOpenersState";
import { effectiveDefaultOpenersState } from "./openersStateForRelease";

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
  tex: readBoolean(raw.useKuusiForTex, DEFAULT_OPENERS_STATE.tex),
  pdf: readBoolean(raw.useKuusiForPdf, DEFAULT_OPENERS_STATE.pdf),
  image: readBoolean(raw.useKuusiForImage, DEFAULT_OPENERS_STATE.image),
  audio: readBoolean(raw.useKuusiForAudio, DEFAULT_OPENERS_STATE.audio),
});

const buildDefaultViewers = (
  current: Record<string, string>,
  state: DefaultOpenersState,
): Record<string, string> => {
  const next = { ...current };

  if (state.notebook) {
    next[FILE_TYPE_NOTEBOOK] = FACTORY_KUUSI_NOTEBOOK;
  } else {
    next[FILE_TYPE_NOTEBOOK] = FACTORY_NOTEBOOK;
  }

  if (state.markdown) {
    next[FILE_TYPE_MARKDOWN] = FACTORY_MARKDOWN_PREVIEW;
  } else {
    next[FILE_TYPE_MARKDOWN] = FACTORY_EDITOR;
  }

  if (state.pdf) {
    next[FILE_TYPE_PDF] = FACTORY_KUUSI_PDF;
  } else {
    next[FILE_TYPE_PDF] = FACTORY_PDF;
  }

  for (const fileType of KUUSI_IMAGE_FILE_TYPES) {
    if (state.image) {
      next[fileType] = FACTORY_KUUSI_IMAGE;
    } else {
      next[fileType] = FACTORY_IMAGE;
    }
  }

  if (state.audio) {
    next[KUUSI_AUDIO_FILE_TYPE] = FACTORY_KUUSI_VOICE;
  } else {
    delete next[KUUSI_AUDIO_FILE_TYPE];
  }

  return next;
};

export class DefaultOpenersManager {
  private _registry: ISettingRegistry;
  private _docRegistry: DocumentRegistry;
  private _kuusiSettings: ISettingRegistry.ISettings | null = null;
  private _docManagerSettings: ISettingRegistry.ISettings | null = null;
  private _state: DefaultOpenersState = { ...DEFAULT_OPENERS_STATE };
  private _ready: Promise<void>;
  private _applying = false;
  private _updating = false;

  constructor(registry: ISettingRegistry, docRegistry: DocumentRegistry) {
    this._registry = registry;
    this._docRegistry = docRegistry;
    this._ready = this._initialize();
  }

  get state(): DefaultOpenersState {
    return { ...this._state };
  }

  ready(): Promise<void> {
    return this._ready;
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
        this._registry.set(
          DEFAULT_OPENERS_PLUGIN_ID,
          "useKuusiForTex",
          this._state.tex,
        ),
        this._registry.set(
          DEFAULT_OPENERS_PLUGIN_ID,
          "useKuusiForPdf",
          this._state.pdf,
        ),
        this._registry.set(
          DEFAULT_OPENERS_PLUGIN_ID,
          "useKuusiForImage",
          this._state.image,
        ),
        this._registry.set(
          DEFAULT_OPENERS_PLUGIN_ID,
          "useKuusiForAudio",
          this._state.audio,
        ),
      ]);
    } finally {
      this._updating = false;
    }

    await this._applyDefaultViewers();
  }

  private async _initialize(): Promise<void> {
    this._kuusiSettings = await this._registry.load(DEFAULT_OPENERS_PLUGIN_ID);
    this._docManagerSettings = await this._registry.load(
      DOC_MANAGER_SETTINGS_PLUGIN_ID,
    );

    this._state = effectiveDefaultOpenersState(
      normalizeState(this._kuusiSettings.composite as Record<string, unknown>),
    );
    setDefaultOpenersState(this._state);

    this._kuusiSettings.changed.connect(() => {
      if (this._applying || this._updating) {
        return;
      }

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

      applyPdfDefaultViewer(this._docRegistry, applied.pdf);
      applyImageDefaultViewers(this._docRegistry, applied.image);
      applyAudioDefaultViewers(this._docRegistry, applied.audio);
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
