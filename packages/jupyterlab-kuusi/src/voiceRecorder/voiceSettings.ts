import type { ISettingRegistry } from "@jupyterlab/settingregistry";

export const VOICE_RECORDER_SETTINGS_ID = "jupyterlab-kuusi:voice-recorder";

const DEFAULT_PREFIX = "voice-note";
const DEFAULT_MAX_DURATION_SECONDS = 3600;
const DEFAULT_AUTOSAVE_INTERVAL_SECONDS = 60;

let recordingFilenamePrefix = DEFAULT_PREFIX;
let maxRecordingDurationSeconds = DEFAULT_MAX_DURATION_SECONDS;
let autosaveIntervalSeconds = DEFAULT_AUTOSAVE_INTERVAL_SECONDS;

const sanitizePrefix = (value: string): string => {
  const trimmed = value.trim().replace(/\s+/g, "-");

  if (!trimmed) {
    return DEFAULT_PREFIX;
  }

  return trimmed.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64) || DEFAULT_PREFIX;
};

export const getRecordingFilenamePrefix = (): string => recordingFilenamePrefix;

export const getDefaultMaxRecordingDurationSeconds = (): number =>
  maxRecordingDurationSeconds;

export const getDefaultAutosaveIntervalSeconds = (): number =>
  autosaveIntervalSeconds;

const readBoundedInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
};

export const bindVoiceRecorderSettings = async (
  registry: ISettingRegistry,
): Promise<void> => {
  const plugin = await registry.load(VOICE_RECORDER_SETTINGS_ID);
  const read = (): void => {
    const raw = plugin.get("recordingFilenamePrefix").composite;
    recordingFilenamePrefix = sanitizePrefix(
      typeof raw === "string" ? raw : DEFAULT_PREFIX,
    );
    maxRecordingDurationSeconds = readBoundedInt(
      plugin.get("maxRecordingDurationSeconds").composite,
      DEFAULT_MAX_DURATION_SECONDS,
      60,
      14400,
    );
    autosaveIntervalSeconds = readBoundedInt(
      plugin.get("autosaveIntervalSeconds").composite,
      DEFAULT_AUTOSAVE_INTERVAL_SECONDS,
      15,
      600,
    );
  };

  read();
  plugin.changed.connect(read);
};
