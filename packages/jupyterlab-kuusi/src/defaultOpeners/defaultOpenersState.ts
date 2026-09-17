import { Signal } from "@lumino/signaling";

export type DefaultOpenersState = {
  notebook: boolean;
  markdown: boolean;
  tex: boolean;
  pdf: boolean;
  image: boolean;
  audio: boolean;
};

export const DEFAULT_OPENERS_STATE: DefaultOpenersState = {
  notebook: true,
  markdown: true,
  tex: true,
  pdf: true,
  image: true,
  audio: true,
};

let state: DefaultOpenersState = { ...DEFAULT_OPENERS_STATE };

const changed = new Signal<unknown, DefaultOpenersState>({});

export const getDefaultOpenersState = (): DefaultOpenersState => ({
  ...state,
});

export const setDefaultOpenersState = (next: DefaultOpenersState): void => {
  state = { ...next };
  changed.emit(state);
};

export const onDefaultOpenersStateChanged = (
  listener: (_sender: unknown, value: DefaultOpenersState) => void,
): { disconnect: () => void } => {
  changed.connect(listener);
  return {
    disconnect: () => {
      changed.disconnect(listener);
    },
  };
};

export const shouldUseKuusiForNotebook = (): boolean => state.notebook;

export const shouldUseKuusiForMarkdown = (): boolean => state.markdown;

export const shouldUseKuusiForTex = (): boolean => state.tex;

export const shouldUseKuusiForPdf = (): boolean => state.pdf;

export const shouldUseKuusiForImage = (): boolean => state.image;

export const shouldUseKuusiForAudio = (): boolean => state.audio;
