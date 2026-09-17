import { KUUSI_VERSION } from "./version";

const KUUSI_GITHUB_REPO = "xianghancao/kuusi";
const VERSION_CACHE_KEY = "jupyterlab-kuusi:latest-version";
const VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type VersionCacheEntry = {
  version: string;
  fetchedAt: number;
};

export type KuusiVersionState = {
  latest: string | null;
  updateAvailable: boolean;
};

type VersionListener = (state: KuusiVersionState) => void;

const listeners = new Set<VersionListener>();
let lastState: KuusiVersionState = {
  latest: null,
  updateAvailable: false,
};

export const normalizeVersion = (version: string): string =>
  version.trim().replace(/^v/i, "");

export const compareVersions = (left: string, right: string): number => {
  const parse = (value: string) =>
    normalizeVersion(value)
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));

  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);

    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
};

const readVersionCache = (): VersionCacheEntry | null => {
  try {
    const raw = localStorage.getItem(VERSION_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as VersionCacheEntry;

    if (
      typeof parsed.version !== "string" ||
      typeof parsed.fetchedAt !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const writeVersionCache = (version: string): void => {
  try {
    const entry: VersionCacheEntry = {
      version,
      fetchedAt: Date.now(),
    };
    localStorage.setItem(VERSION_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
};

const isCacheFresh = (entry: VersionCacheEntry): boolean =>
  Date.now() - entry.fetchedAt < VERSION_CACHE_TTL_MS;

const stateFromLatest = (latest: string | null): KuusiVersionState => ({
  latest,
  updateAvailable:
    latest !== null && compareVersions(latest, KUUSI_VERSION) > 0,
});

const emitState = (state: KuusiVersionState): void => {
  lastState = state;
  listeners.forEach((listener) => listener(state));
};

export const getKuusiVersionState = (): KuusiVersionState => ({ ...lastState });

export const subscribeKuusiVersionState = (
  listener: VersionListener,
): (() => void) => {
  listeners.add(listener);
  listener(lastState);
  return () => {
    listeners.delete(listener);
  };
};

export const fetchLatestPyPIVersion = async (): Promise<string | null> => {
  try {
    const response = await fetch(
      "https://pypi.org/pypi/jupyterlab-kuusi/json",
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      info?: { version?: string };
    };

    return payload.info?.version
      ? normalizeVersion(payload.info.version)
      : null;
  } catch {
    return null;
  }
};

export const fetchLatestKuusiVersion = async (): Promise<string | null> => {
  const pypi = await fetchLatestPyPIVersion();

  if (pypi) {
    return pypi;
  }

  const releaseResponse = await fetch(
    `https://api.github.com/repos/${KUUSI_GITHUB_REPO}/releases/latest`,
  );

  if (releaseResponse.ok) {
    const release = (await releaseResponse.json()) as { tag_name?: string };

    if (release.tag_name) {
      return normalizeVersion(release.tag_name);
    }
  }

  const packageResponse = await fetch(
    `https://raw.githubusercontent.com/${KUUSI_GITHUB_REPO}/main/packages/jupyterlab-kuusi/package.json`,
  );

  if (!packageResponse.ok) {
    return null;
  }

  const packageJson = (await packageResponse.json()) as { version?: string };
  return packageJson.version ? normalizeVersion(packageJson.version) : null;
};

let refreshInFlight: Promise<KuusiVersionState> | null = null;

/** Load cached PyPI latest, refresh when stale, and notify badge subscribers. */
export const refreshKuusiLatestVersion = (): Promise<KuusiVersionState> => {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const cached = readVersionCache();

    if (cached) {
      emitState(stateFromLatest(cached.version));
    }

    if (cached && isCacheFresh(cached)) {
      return lastState;
    }

    try {
      const latest = await fetchLatestKuusiVersion();

      if (latest) {
        writeVersionCache(latest);
        emitState(stateFromLatest(latest));
      } else if (!cached) {
        emitState({ latest: null, updateAvailable: false });
      }
    } catch {
      if (!cached) {
        emitState({ latest: null, updateAvailable: false });
      }
    }

    return lastState;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
};
