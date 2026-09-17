import { KUUSI_VERSION } from "./version";

export type KuusiReleaseTier = "core" | "full";

const RELEASE_TIER_OVERRIDE_KEY = "jupyterlab-kuusi:release-tier-override";

const tierFromVersion = (version: string): KuusiReleaseTier => {
  const minor = Number.parseInt(version.split(".")[1] ?? "0", 10);
  return Number.isFinite(minor) && minor >= 3 ? "full" : "core";
};

/** Default tier from semver: 0.2.x → core, 0.3+ → full. */
export const KUUSI_RELEASE_TIER: KuusiReleaseTier = tierFromVersion(KUUSI_VERSION);

const readTierOverride = (): KuusiReleaseTier | null => {
  try {
    const raw = localStorage.getItem(RELEASE_TIER_OVERRIDE_KEY);

    if (raw === "core" || raw === "full") {
      return raw;
    }
  } catch {
    // private browsing / restricted storage
  }

  return null;
};

export const getKuusiReleaseTier = (): KuusiReleaseTier =>
  readTierOverride() ?? KUUSI_RELEASE_TIER;

export const isKuusiFullRelease = (): boolean =>
  getKuusiReleaseTier() === "full";

export const isKuusiCoreRelease = (): boolean =>
  getKuusiReleaseTier() === "core";
