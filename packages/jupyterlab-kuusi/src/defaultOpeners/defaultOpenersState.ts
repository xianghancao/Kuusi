import { Signal } from "@lumino/signaling";

export type DefaultOpenersState = {
  notebook: boolean;
  markdown: boolean;
};

export const DEFAULT_OPENERS_STATE: DefaultOpenersState = {
  notebook: true,
  markdown: true,
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
