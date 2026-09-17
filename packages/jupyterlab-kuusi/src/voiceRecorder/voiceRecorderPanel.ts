import { PathExt } from "@jupyterlab/coreutils";
import type { IDocumentManager } from "@jupyterlab/docmanager";
import { Dialog, Notification, showDialog } from "@jupyterlab/apputils";
import { Message } from "@lumino/messaging";
import { Widget } from "@lumino/widgets";
import { blobToBase64 } from "./voiceBlob";
import {
  extensionForRecordingMime,
  RECORDING_FORMAT_OPTIONS,
  resolveRecordingMimeType,
  sanitizeRecordingBasename,
  type RecordingFormatChoice,
} from "./voiceFormats";
import {
  formatGetUserMediaError,
  isLikelyJupyterLabDesktop,
  jupyterLabDesktopMicrophoneHint,
  microphonePermissionHint,
  PRE_RECORD_MICROPHONE_NOTICE,
  prepareMicrophoneAccess,
  queryMicrophonePermission,
} from "./voicePermission";
import { VoiceRecordingSession } from "./voiceRecordingSession";
import { FACTORY_KUUSI_VOICE } from "../defaultOpeners/constants";
import {
  getDefaultAutosaveIntervalSeconds,
  getDefaultMaxRecordingDurationSeconds,
  getRecordingFilenamePrefix,
} from "./voiceSettings";

const formatElapsed = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const defaultBasename = (): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${getRecordingFilenamePrefix()}-${stamp}`;
};

export class VoiceRecorderPanel extends Widget {
  private _docManager: IDocumentManager;
  private _directory: string;
  private _session = new VoiceRecordingSession();
  private _recordingBlob: Blob | null = null;
  private _timerId: number | null = null;
  private _autosaveTimerId: number | null = null;
  private _elapsedSeconds = 0;
  private _levelFrameId: number | null = null;
  private _targetPath: string | null = null;
  private _saveChain: Promise<void> = Promise.resolve();
  private _lastPersistSize = 0;

  private _statusEl: HTMLParagraphElement;
  private _hintEl: HTMLParagraphElement;
  private _permissionNoteEl: HTMLParagraphElement;
  private _timerEl: HTMLSpanElement;
  private _saveStatusEl: HTMLParagraphElement;
  private _levelCanvas: HTMLCanvasElement;
  private _previewAudio: HTMLAudioElement;
  private _filenameInput: HTMLInputElement;
  private _formatSelect: HTMLSelectElement;
  private _maxMinutesInput: HTMLInputElement;
  private _recordBtn: HTMLButtonElement;
  private _pauseBtn: HTMLButtonElement;
  private _stopBtn: HTMLButtonElement;
  private _openBtn: HTMLButtonElement;
  private _previewUrlRevoke: (() => void) | null = null;
  private _permissionStatus: PermissionStatus | null = null;

  constructor(docManager: IDocumentManager, directory: string) {
    super();
    this._docManager = docManager;
    this._directory = directory;
    this.addClass("jp-KuusiVoiceRecorder");

    this._session.onChunksUpdated = () => {
      void this._persistRecording(false);
    };

    const header = document.createElement("div");
    header.className = "jp-KuusiVoiceRecorder-header";

    const title = document.createElement("h2");
    title.className = "jp-KuusiVoiceRecorder-title";
    title.textContent = "Voice note";

    this._statusEl = document.createElement("p");
    this._statusEl.className = "jp-KuusiVoiceRecorder-status";

    this._hintEl = document.createElement("p");
    this._hintEl.className = "jp-KuusiVoiceRecorder-format";

    this._permissionNoteEl = document.createElement("p");
    this._permissionNoteEl.className = "jp-KuusiVoiceRecorder-permissionNote";
    this._permissionNoteEl.textContent = PRE_RECORD_MICROPHONE_NOTICE;

    header.append(title, this._statusEl, this._permissionNoteEl, this._hintEl);

    const form = document.createElement("div");
    form.className = "jp-KuusiVoiceRecorder-form";

    this._filenameInput = document.createElement("input");
    this._filenameInput.type = "text";
    this._filenameInput.className =
      "jp-mod-styled jp-KuusiVoiceRecorder-filename";
    this._filenameInput.value = defaultBasename();
    this._filenameInput.setAttribute(
      "aria-label",
      "Recording file name (without extension)",
    );

    this._formatSelect = document.createElement("select");
    this._formatSelect.className =
      "jp-mod-styled jp-KuusiVoiceRecorder-formatSelect";
    this._formatSelect.setAttribute("aria-label", "Recording format");
    this._formatSelect.addEventListener("change", () => {
      void this._refreshPermissionHint();
    });

    for (const option of RECORDING_FORMAT_OPTIONS) {
      const el = document.createElement("option");
      el.value = option.id;
      el.textContent = option.label;
      this._formatSelect.append(el);
    }

    this._maxMinutesInput = document.createElement("input");
    this._maxMinutesInput.type = "number";
    this._maxMinutesInput.min = "1";
    this._maxMinutesInput.max = "240";
    this._maxMinutesInput.step = "1";
    this._maxMinutesInput.className =
      "jp-mod-styled jp-KuusiVoiceRecorder-maxMinutes";
    this._maxMinutesInput.value = String(
      Math.round(getDefaultMaxRecordingDurationSeconds() / 60),
    );
    this._maxMinutesInput.setAttribute("aria-label", "Maximum duration in minutes");

    form.append(
      this._labeledField("File name", this._filenameInput),
      this._labeledField("Format", this._formatSelect),
      this._labeledField("Max duration (minutes)", this._maxMinutesInput),
    );

    this._timerEl = document.createElement("span");
    this._timerEl.className = "jp-KuusiVoiceRecorder-timer";
    this._timerEl.textContent = "0:00";

    this._saveStatusEl = document.createElement("p");
    this._saveStatusEl.className = "jp-KuusiVoiceRecorder-saveStatus";

    this._levelCanvas = document.createElement("canvas");
    this._levelCanvas.className = "jp-KuusiVoiceRecorder-level";
    this._levelCanvas.width = 320;
    this._levelCanvas.height = 48;
    this._levelCanvas.setAttribute("aria-hidden", "true");

    this._previewAudio = document.createElement("audio");
    this._previewAudio.className = "jp-KuusiVoiceRecorder-preview";
    this._previewAudio.controls = true;
    this._previewAudio.hidden = true;

    const controls = document.createElement("div");
    controls.className = "jp-KuusiVoiceRecorder-controls";

    this._recordBtn = document.createElement("button");
    this._recordBtn.type = "button";
    this._recordBtn.className = "jp-mod-styled jp-KuusiVoiceRecorder-record";
    this._recordBtn.textContent = "Record";
    this._recordBtn.addEventListener("click", () => {
      void this._onRecordClick();
    });

    this._pauseBtn = document.createElement("button");
    this._pauseBtn.type = "button";
    this._pauseBtn.className = "jp-mod-styled jp-KuusiVoiceRecorder-pause";
    this._pauseBtn.textContent = "Pause";
    this._pauseBtn.disabled = true;
    this._pauseBtn.addEventListener("click", () => {
      this._onPauseClick();
    });

    this._stopBtn = document.createElement("button");
    this._stopBtn.type = "button";
    this._stopBtn.className = "jp-mod-styled jp-KuusiVoiceRecorder-stop";
    this._stopBtn.textContent = "Stop";
    this._stopBtn.disabled = true;
    this._stopBtn.addEventListener("click", () => {
      void this._onStopClick();
    });

    this._openBtn = document.createElement("button");
    this._openBtn.type = "button";
    this._openBtn.className = "jp-mod-styled jp-KuusiVoiceRecorder-open";
    this._openBtn.textContent = "Open in Kuusi Voice";
    this._openBtn.disabled = true;
    this._openBtn.addEventListener("click", () => {
      void this._openRecording();
    });

    controls.append(
      this._recordBtn,
      this._pauseBtn,
      this._stopBtn,
      this._openBtn,
    );

    const meterRow = document.createElement("div");
    meterRow.className = "jp-KuusiVoiceRecorder-meterRow";
    meterRow.append(this._timerEl, this._levelCanvas);

    this.node.append(
      header,
      form,
      meterRow,
      this._saveStatusEl,
      controls,
      this._previewAudio,
    );

    void this._bindPermissionListener();
    void this._refreshPermissionHint();
    this._syncUi();
  }

  dispose(): void {
    this._permissionStatus?.removeEventListener(
      "change",
      this._onPermissionStatusChange,
    );
    this._permissionStatus = null;
    this._stopTimer();
    this._stopAutosaveTimer();
    this._stopLevelMeter();
    this._clearPreviewUrl();
    this._session.onChunksUpdated = null;
    this._session.dispose();
    super.dispose();
  }

  protected onCloseRequest(msg: Message): void {
    if (
      this._session.state === "recording" ||
      this._session.state === "paused"
    ) {
      void this._onStopClick();
    }

    super.onCloseRequest(msg);
  }

  private _onPermissionStatusChange = (): void => {
    void this._refreshPermissionHint();
  };

  private async _bindPermissionListener(): Promise<void> {
    if (!navigator.permissions?.query) {
      return;
    }

    try {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      this._permissionStatus?.removeEventListener(
        "change",
        this._onPermissionStatusChange,
      );
      this._permissionStatus = status;
      status.addEventListener("change", this._onPermissionStatusChange);
    } catch {
      // Permissions API unsupported for microphone in this browser.
    }
  }

  private _labeledField(label: string, control: HTMLElement): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "jp-KuusiVoiceRecorder-field";

    const text = document.createElement("span");
    text.className = "jp-KuusiVoiceRecorder-fieldLabel";
    text.textContent = label;

    wrap.append(text, control);
    return wrap;
  }

  private async _refreshPermissionHint(): Promise<void> {
    const permission = await queryMicrophonePermission();
    const permissionHint = microphonePermissionHint(permission);
    const format = this._formatSelect.value as RecordingFormatChoice;
    const mime =
      resolveRecordingMimeType(format) || "browser default (usually WebM)";

    if (permission === "denied") {
      this._permissionNoteEl.textContent = permissionHint ?? "";
      this._permissionNoteEl.classList.add("is-denied");
    } else if (permission === "granted") {
      this._permissionNoteEl.textContent =
        "Microphone is allowed. Press Record to start.";
      this._permissionNoteEl.classList.remove("is-denied");
    } else {
      this._permissionNoteEl.textContent = PRE_RECORD_MICROPHONE_NOTICE;
      this._permissionNoteEl.classList.remove("is-denied");
    }

    const parts = [
      `Format in browser: ${mime}. Recording saves to the current folder every ${getDefaultAutosaveIntervalSeconds()}s.`,
    ];

    if (isLikelyJupyterLabDesktop()) {
      parts.push(jupyterLabDesktopMicrophoneHint());
    }

    if (permissionHint && permission !== "denied") {
      parts.push(permissionHint);
    }

    this._hintEl.textContent = parts.join(" ");
  }

  private _maxDurationSeconds(): number {
    const minutes = Number(this._maxMinutesInput.value);

    if (!Number.isFinite(minutes) || minutes < 1) {
      return getDefaultMaxRecordingDurationSeconds();
    }

    return Math.min(14400, Math.max(60, Math.round(minutes * 60)));
  }

  private _selectedFormat(): RecordingFormatChoice {
    return this._formatSelect.value as RecordingFormatChoice;
  }

  private _resolveTargetPath(mimeType: string): string {
    const ext = extensionForRecordingMime(mimeType);
    const base = sanitizeRecordingBasename(this._filenameInput.value);
    const name = base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
    return PathExt.join(this._directory, name);
  }

  private _setFormLocked(locked: boolean): void {
    this._filenameInput.disabled = locked;
    this._formatSelect.disabled = locked;
    this._maxMinutesInput.disabled = locked;
  }

  private _syncUi(): void {
    const state = this._session.state;

    this._statusEl.textContent =
      state === "idle"
        ? "Set file name and options, then Record. The file is created when recording starts."
        : state === "recording"
          ? "Recording — saving to Jupyter periodically."
          : state === "paused"
            ? "Paused — audio saved so far is on disk."
            : this._recordingBlob
              ? "Stopped — preview below or open in Kuusi Voice."
              : "No audio captured.";

    const active = state === "recording" || state === "paused";

    this._recordBtn.textContent =
      state === "paused"
        ? "Resume"
        : state === "stopped"
          ? "Record again"
          : "Record";
    this._recordBtn.disabled = state === "recording";
    this._pauseBtn.disabled = state !== "recording";
    this._stopBtn.disabled = !active;
    this._openBtn.disabled = !this._targetPath;
    this._previewAudio.hidden = !this._recordingBlob;

    this._setFormLocked(active);
  }

  private async _onRecordClick(): Promise<void> {
    if (this._session.state === "paused") {
      this._session.resume();
      this._startTimer();
      this._startAutosaveTimer();
      this._startLevelMeter();
      this._syncUi();
      return;
    }

    if (this._session.state === "stopped") {
      this._resetForNewTake();
    }

    const format = this._selectedFormat();
    const mimePreview = resolveRecordingMimeType(format);

    if (format !== "auto" && !mimePreview) {
      void showDialog({
        title: "Recording format",
        body: `This browser cannot record as ${format.toUpperCase()}. Choose Auto or another format.`,
        buttons: [Dialog.okButton()],
      });
      return;
    }

    const access = await prepareMicrophoneAccess();

    if (!access.ok) {
      void showDialog({
        title: "Microphone",
        body: access.message,
        buttons: [Dialog.okButton()],
      });
      void this._refreshPermissionHint();
      return;
    }

    try {
      this._targetPath = this._resolveTargetPath(
        mimePreview || "audio/webm",
      );
      this._lastPersistSize = 0;
      this._saveStatusEl.textContent = `Target: ${PathExt.basename(this._targetPath)}`;

      await this._session.start({ format });
      this._recordingBlob = null;
      this._clearPreviewUrl();
      this._elapsedSeconds = 0;
      this._timerEl.textContent = "0:00";
      this._startTimer();
      this._startAutosaveTimer();
      this._startLevelMeter();

      window.setTimeout(() => {
        this._session.requestDataFlush();
        void this._persistRecording(false);
      }, 1200);
    } catch (error: unknown) {
      this._targetPath = null;
      void showDialog({
        title: "Microphone",
        body: formatGetUserMediaError(error),
        buttons: [Dialog.okButton()],
      });
    }

    void this._refreshPermissionHint();
    this._syncUi();
  }

  private _resetForNewTake(): void {
    this._recordingBlob = null;
    this._targetPath = null;
    this._lastPersistSize = 0;
    this._clearPreviewUrl();
    this._elapsedSeconds = 0;
    this._timerEl.textContent = "0:00";
    this._saveStatusEl.textContent = "";
    this._filenameInput.value = defaultBasename();
  }

  private _onPauseClick(): void {
    if (this._session.state === "recording") {
      this._session.pause();
      this._session.requestDataFlush();
      void this._persistRecording(false);
      this._stopTimer();
      this._stopAutosaveTimer();
      this._stopLevelMeter();
    }

    this._syncUi();
  }

  private async _onStopClick(): Promise<void> {
    this._stopTimer();
    this._stopAutosaveTimer();
    this._stopLevelMeter();
    this._session.requestDataFlush();
    const blob = await this._session.stop();
    this._recordingBlob = blob;
    await this._persistRecording(true);
    this._clearPreviewUrl();

    if (blob) {
      const url = URL.createObjectURL(blob);
      this._previewUrlRevoke = () => URL.revokeObjectURL(url);
      this._previewAudio.src = url;
      this._previewAudio.hidden = false;
    }

    this._syncUi();
  }

  private async _openRecording(): Promise<void> {
    if (!this._targetPath) {
      return;
    }

    await this._docManager.openOrReveal(this._targetPath, FACTORY_KUUSI_VOICE);
  }

  private _persistRecording(final: boolean): Promise<void> {
    this._saveChain = this._saveChain.then(async () => {
      const path = this._targetPath;
      const blob = this._session.getMergedBlob();

      if (!path || !blob || blob.size === 0) {
        return;
      }

      if (!final && blob.size === this._lastPersistSize) {
        return;
      }

      try {
        const content = await blobToBase64(blob);
        await this._docManager.services.contents.save(path, {
          type: "file",
          format: "base64",
          content,
        });
        this._lastPersistSize = blob.size;
        const name = PathExt.basename(path);
        const when = new Date().toLocaleTimeString();
        this._saveStatusEl.textContent = final
          ? `Saved ${name} (${Math.round(blob.size / 1024)} KB)`
          : `Autosaved ${name} at ${when} (${Math.round(blob.size / 1024)} KB)`;

        if (final) {
          Notification.success(`Saved ${name}`, { autoClose: 3500 });
          await this._docManager.openOrReveal(path, FACTORY_KUUSI_VOICE);
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Could not save recording.";

        if (final) {
          void showDialog({
            title: "Save failed",
            body: message,
            buttons: [Dialog.okButton()],
          });
        } else {
          this._saveStatusEl.textContent = `Autosave failed: ${message}`;
        }
      }
    });

    return this._saveChain;
  }

  private _startTimer(): void {
    this._stopTimer();
    const maxSeconds = this._maxDurationSeconds();

    this._timerId = window.setInterval(() => {
      if (this._session.state !== "recording") {
        return;
      }

      this._elapsedSeconds += 1;
      this._timerEl.textContent = formatElapsed(this._elapsedSeconds);

      if (this._elapsedSeconds >= maxSeconds) {
        Notification.info("Maximum recording duration reached.", {
          autoClose: 4000,
        });
        void this._onStopClick();
      }
    }, 1000);
  }

  private _stopTimer(): void {
    if (this._timerId !== null) {
      window.clearInterval(this._timerId);
      this._timerId = null;
    }
  }

  private _startAutosaveTimer(): void {
    this._stopAutosaveTimer();
    const intervalMs = getDefaultAutosaveIntervalSeconds() * 1000;

    this._autosaveTimerId = window.setInterval(() => {
      if (this._session.state === "recording") {
        this._session.requestDataFlush();
        void this._persistRecording(false);
      }
    }, intervalMs);
  }

  private _stopAutosaveTimer(): void {
    if (this._autosaveTimerId !== null) {
      window.clearInterval(this._autosaveTimerId);
      this._autosaveTimerId = null;
    }
  }

  private _startLevelMeter(): void {
    this._stopLevelMeter();

    const analyser = this._session.analyser;
    const canvas = this._levelCanvas;
    const ctx = canvas.getContext("2d");

    if (!analyser || !ctx) {
      return;
    }

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const draw = (): void => {
      if (this._session.state !== "recording") {
        return;
      }

      analyser.getByteTimeDomainData(buffer);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "var(--kuusi-brand-green, #2f5d3a)";
      ctx.lineWidth = 2;
      ctx.beginPath();

      const sliceWidth = canvas.width / buffer.length;
      let x = 0;

      for (let index = 0; index < buffer.length; index += 1) {
        const value = buffer[index]! / 128.0;
        const y = (value * canvas.height) / 2;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.stroke();
      this._levelFrameId = window.requestAnimationFrame(draw);
    };

    this._levelFrameId = window.requestAnimationFrame(draw);
  }

  private _stopLevelMeter(): void {
    if (this._levelFrameId !== null) {
      window.cancelAnimationFrame(this._levelFrameId);
      this._levelFrameId = null;
    }

    const ctx = this._levelCanvas.getContext("2d");

    if (ctx) {
      ctx.clearRect(0, 0, this._levelCanvas.width, this._levelCanvas.height);
    }
  }

  private _clearPreviewUrl(): void {
    this._previewUrlRevoke?.();
    this._previewUrlRevoke = null;
    this._previewAudio.removeAttribute("src");
    this._previewAudio.load();
    this._previewAudio.hidden = true;
  }
}
