export type MicrophonePermissionState = "granted" | "denied" | "prompt" | "unknown";

/** Shown before the user starts recording (web JupyterLab). */
export const PRE_RECORD_MICROPHONE_NOTICE =
  "Recording will request microphone access — choose Allow in the browser prompt.";

export const isLikelyJupyterLabDesktop = (): boolean => {
  const ua = navigator.userAgent;

  if (/JupyterLab[- ]Desktop/i.test(ua)) {
    return true;
  }

  const globalDesktop = (
    window as unknown as { jupyterlabDesktop?: boolean }
  ).jupyterlabDesktop;

  if (globalDesktop === true) {
    return true;
  }

  return /\bElectron\//i.test(ua);
};

export const jupyterLabDesktopMicrophoneHint = (): string =>
  "JupyterLab Desktop: enable Microphone for JupyterLab Desktop under System Settings → Privacy & Security → Microphone.";

export const queryMicrophonePermission =
  async (): Promise<MicrophonePermissionState> => {
    if (!navigator.permissions?.query) {
      return "unknown";
    }

    try {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });

      return status.state as MicrophonePermissionState;
    } catch {
      return "unknown";
    }
  };

export const microphoneDeniedGuide = (): string => {
  const lines = [
    "Microphone access is blocked for this site.",
    "In your browser: open the site controls in the address bar → Microphone → Allow, then reload this page.",
    "On macOS: System Settings → Privacy & Security → Microphone → enable your browser (Chrome, Safari, Firefox, or Edge).",
  ];

  if (isLikelyJupyterLabDesktop()) {
    lines.push(jupyterLabDesktopMicrophoneHint());
  }

  return lines.join(" ");
};

export const microphonePermissionHint = (
  state: MicrophonePermissionState,
): string | null => {
  if (state === "denied") {
    return microphoneDeniedGuide();
  }

  if (state === "prompt") {
    return PRE_RECORD_MICROPHONE_NOTICE;
  }

  if (state === "granted") {
    return "Microphone access is already allowed for this site.";
  }

  return PRE_RECORD_MICROPHONE_NOTICE;
};

export type MicrophoneAccessPrepareResult =
  | { ok: true; state: MicrophonePermissionState }
  | { ok: false; state: "denied"; message: string };

/**
 * Call before {@link navigator.mediaDevices.getUserMedia}. If `denied`, do not
 * call getUserMedia — the browser will not show the prompt again.
 */
export const prepareMicrophoneAccess =
  async (): Promise<MicrophoneAccessPrepareResult> => {
    const state = await queryMicrophonePermission();

    if (state === "denied") {
      return { ok: false, state: "denied", message: microphoneDeniedGuide() };
    }

    return { ok: true, state };
  };

export const formatGetUserMediaError = (error: unknown): string => {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return microphoneDeniedGuide();
    }

    if (error.name === "NotFoundError") {
      return "No microphone was found on this device.";
    }

    return error.message || error.name;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Could not start recording.";
};
