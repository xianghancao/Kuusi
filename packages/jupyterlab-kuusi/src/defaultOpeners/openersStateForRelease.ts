import type { DefaultOpenersState } from "./defaultOpenersState";

/** User settings apply on all release tiers (core and full). */
export const effectiveDefaultOpenersState = (
  state: DefaultOpenersState,
): DefaultOpenersState => ({ ...state });
