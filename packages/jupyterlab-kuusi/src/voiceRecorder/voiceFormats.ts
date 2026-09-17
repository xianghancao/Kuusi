/** JupyterLab docregistry file type for Kuusi audio playback. */
export const KUUSI_AUDIO_FILE_TYPE = "kuusi-audio";

export const AUDIO_EXTENSIONS = [
  ".webm",
  ".ogg",
  ".m4a",
  ".mp4",
  ".wav",
  ".mp3",
] as const;

const AUDIO_EXT_SET = new Set(
  AUDIO_EXTENSIONS.map((ext) => ext.slice(1).toLowerCase()),
);

export const isKuusiAudioPath = (path: string): boolean => {
  const dot = path.lastIndexOf(".");

  if (dot < 0) {
    return false;
  }

  return AUDIO_EXT_SET.has(path.slice(dot + 1).toLowerCase());
};

const MIME_BY_EXT: Record<string, string> = {
  webm: "audio/webm",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
  mp3: "audio/mpeg",
};

export const mimeTypeForAudioPath = (path: string): string => {
  const dot = path.lastIndexOf(".");

  if (dot < 0) {
    return "audio/webm";
  }

  const ext = path.slice(dot + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
};

const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
] as const;

/** Best {@link MediaRecorder} mime type for this browser, or empty for default. */
export const pickRecordingMimeType = (): string => {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  for (const candidate of RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
};

export type RecordingFormatChoice = "auto" | "webm" | "ogg" | "mp4";

export const RECORDING_FORMAT_OPTIONS: {
  id: RecordingFormatChoice;
  label: string;
}[] = [
  { id: "auto", label: "Auto (browser default)" },
  { id: "webm", label: "WebM" },
  { id: "ogg", label: "OGG" },
  { id: "mp4", label: "MP4 / M4A" },
];

const MIME_BY_FORMAT: Record<Exclude<RecordingFormatChoice, "auto">, string[]> =
  {
    webm: ["audio/webm;codecs=opus", "audio/webm"],
    ogg: ["audio/ogg;codecs=opus", "audio/ogg"],
    mp4: ["audio/mp4", "audio/aac"],
  };

export const resolveRecordingMimeType = (
  choice: RecordingFormatChoice,
): string => {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  if (choice === "auto") {
    return pickRecordingMimeType();
  }

  for (const candidate of MIME_BY_FORMAT[choice]) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
};

export const sanitizeRecordingBasename = (value: string): string => {
  const trimmed = value.trim().replace(/\s+/g, "-");
  const cleaned = trimmed.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 120);

  return cleaned || "voice-note";
};

export const extensionForRecordingMime = (mime: string): string => {
  const lower = mime.toLowerCase();

  if (lower.includes("ogg")) {
    return ".ogg";
  }

  if (lower.includes("mp4") || lower.includes("aac")) {
    return ".m4a";
  }

  if (lower.includes("mpeg") || lower.includes("mp3")) {
    return ".mp3";
  }

  return ".webm";
};
