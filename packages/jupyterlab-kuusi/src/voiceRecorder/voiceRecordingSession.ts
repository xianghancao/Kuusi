import {
  pickRecordingMimeType,
  resolveRecordingMimeType,
  type RecordingFormatChoice,
} from "./voiceFormats";

export type VoiceRecordingState = "idle" | "recording" | "paused" | "stopped";

const DEFAULT_TIMESLICE_MS = 5000;

export class VoiceRecordingSession {
  private _stream: MediaStream | null = null;
  private _recorder: MediaRecorder | null = null;
  private _chunks: Blob[] = [];
  private _mimeType = "";
  private _state: VoiceRecordingState = "idle";
  private _analyser: AnalyserNode | null = null;
  private _audioContext: AudioContext | null = null;
  private _onChunksUpdated: (() => void) | null = null;

  get state(): VoiceRecordingState {
    return this._state;
  }

  get mimeType(): string {
    return this._mimeType;
  }

  get analyser(): AnalyserNode | null {
    return this._analyser;
  }

  set onChunksUpdated(handler: (() => void) | null) {
    this._onChunksUpdated = handler;
  }

  getMergedBlob(): Blob | null {
    return this._buildBlob();
  }

  requestDataFlush(): void {
    if (this._recorder?.state === "recording") {
      try {
        this._recorder.requestData();
      } catch {
        // ignore
      }
    }
  }

  async start(options: {
    format?: RecordingFormatChoice;
    timesliceMs?: number;
  } = {}): Promise<void> {
    this.dispose();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is not available in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._stream = stream;
    this._chunks = [];

    const format = options.format ?? "auto";
    let mimeType =
      resolveRecordingMimeType(format) || pickRecordingMimeType();

    if (typeof MediaRecorder === "undefined") {
      stream.getTracks().forEach((track) => track.stop());
      this._stream = null;
      throw new Error("MediaRecorder is not available in this browser.");
    }

    if (format !== "auto" && !mimeType) {
      stream.getTracks().forEach((track) => track.stop());
      this._stream = null;
      throw new Error(
        `The browser does not support recording as ${format.toUpperCase()}. Try Auto or another format.`,
      );
    }

    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    this._mimeType = recorder.mimeType || mimeType || "audio/webm";

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        this._chunks.push(event.data);
        this._onChunksUpdated?.();
      }
    });

    this._recorder = recorder;
    this._wireLevelMeter(stream);
    recorder.start(options.timesliceMs ?? DEFAULT_TIMESLICE_MS);
    this._state = "recording";
  }

  pause(): void {
    if (this._recorder?.state === "recording") {
      this._recorder.pause();
      this._state = "paused";
    }
  }

  resume(): void {
    if (this._recorder?.state === "paused") {
      this._recorder.resume();
      this._state = "recording";
    }
  }

  stop(): Promise<Blob | null> {
    const recorder = this._recorder;

    if (!recorder || recorder.state === "inactive") {
      this._state = "stopped";
      return Promise.resolve(this._buildBlob());
    }

    return new Promise((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          this._state = "stopped";
          this._stopTracks();
          resolve(this._buildBlob());
        },
        { once: true },
      );

      recorder.stop();
    });
  }

  dispose(): void {
    if (this._recorder && this._recorder.state !== "inactive") {
      try {
        this._recorder.stop();
      } catch {
        // ignore
      }
    }

    this._recorder = null;
    this._chunks = [];
    this._stopTracks();
    this._teardownLevelMeter();
    this._state = "idle";
    this._mimeType = "";
  }

  private _buildBlob(): Blob | null {
    if (this._chunks.length === 0) {
      return null;
    }

    return new Blob(this._chunks, { type: this._mimeType || "audio/webm" });
  }

  private _stopTracks(): void {
    this._stream?.getTracks().forEach((track) => track.stop());
    this._stream = null;
  }

  private _wireLevelMeter(stream: MediaStream): void {
    this._teardownLevelMeter();

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    this._audioContext = context;
    this._analyser = analyser;
  }

  private _teardownLevelMeter(): void {
    this._analyser = null;

    if (this._audioContext) {
      void this._audioContext.close();
      this._audioContext = null;
    }
  }
}
