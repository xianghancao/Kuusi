import { isKuusiFullRelease } from "../releaseTier";
import type { DefaultOpenersState } from "./defaultOpenersState";

/** Core releases only honor the notebook mind-map default opener. */
export const effectiveDefaultOpenersState = (
  state: DefaultOpenersState,
): DefaultOpenersState => {
  if (isKuusiFullRelease()) {
    return { ...state };
  }

  return {
    notebook: state.notebook,
    markdown: false,
    tex: false,
    pdf: false,
    image: false,
    audio: false,
  };
};
