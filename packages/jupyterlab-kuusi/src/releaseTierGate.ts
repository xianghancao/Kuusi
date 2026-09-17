import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { getKuusiReleaseTier, isKuusiFullRelease } from "./releaseTier";

/**
 * Skip plugin activation on core releases (0.2.x). Code stays in the bundle;
 * flip tier via 0.3.0 semver, or localStorage override for local QA:
 * `localStorage.setItem('jupyterlab-kuusi:release-tier-override', 'full')`
 */
export const gateFullReleasePlugin = <T>(
  plugin: JupyterFrontEndPlugin<T>,
): JupyterFrontEndPlugin<T> => {
  const originalActivate = plugin.activate.bind(plugin);

  return {
    ...plugin,
    activate: ((...args: unknown[]) => {
      if (!isKuusiFullRelease()) {
        console.info(
          `jupyterlab-kuusi: ${plugin.id} not activated (release tier: ${getKuusiReleaseTier()})`,
        );
        return;
      }

      return originalActivate(...(args as Parameters<typeof originalActivate>));
    }) as typeof originalActivate,
  };
};
