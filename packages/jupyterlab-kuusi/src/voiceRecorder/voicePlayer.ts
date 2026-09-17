import { PathExt } from "@jupyterlab/coreutils";
import type { DocumentRegistry } from "@jupyterlab/docregistry";
import { Notification } from "@jupyterlab/apputils";
import { Message } from "@lumino/messaging";
import { Widget } from "@lumino/widgets";
import { formatContentsModified } from "../formatModifiedTime";
import { base64ToObjectUrl } from "./voiceBlob";
import { mimeTypeForAudioPath } from "./voiceFormats";

export class VoicePlayer extends Widget {
  private _context: DocumentRegistry.IContext<DocumentRegistry.IModel>;
  private _audio: HTMLAudioElement;
  private _statusNode: HTMLSpanElement;
  private _errorNode: HTMLDivElement;
  private _objectUrlRevoke: (() => void) | null = null;
  private _lastKnownModified = "";

  constructor(context: DocumentRegistry.IContext<DocumentRegistry.IModel>) {
    super();
    this._context = context;
    this.addClass("jp-KuusiVoicePlayer");

    this._statusNode = document.createElement("span");
    this._statusNode.className = "jp-KuusiVoicePlayer-status";

    this._errorNode = document.createElement("div");
    this._errorNode.className = "jp-KuusiVoicePlayer-error";
    this._errorNode.hidden = true;

    this._audio = document.createElement("audio");
    this._audio.className = "jp-KuusiVoicePlayer-audio";
    this._audio.controls = true;
    this._audio.preload = "metadata";

    const body = document.createElement("div");
    body.className = "jp-KuusiVoicePlayer-body";
    body.append(this._audio, this._errorNode);

    const footer = document.createElement("div");
    footer.className = "jp-KuusiVoicePlayer-footer";
    footer.append(this._statusNode);

    this.node.append(body, footer);

    void context.ready.then(() => {
      void this._reload(false);
      context.model.contentChanged.connect(this._onContentChanged, this);
    });
  }

  dispose(): void {
    this._clearAudioUrl();
    this._context.model.contentChanged.disconnect(this._onContentChanged, this);
    super.dispose();
  }

  protected onActivateRequest(msg: Message): void {
    super.onActivateRequest(msg);
    this._audio.focus();
  }

  private _onContentChanged = (): void => {
    void this._reload(false);
  };

  private _clearAudioUrl(): void {
    this._objectUrlRevoke?.();
    this._objectUrlRevoke = null;
    this._audio.removeAttribute("src");
    this._audio.load();
  }

  private async _reload(force: boolean): Promise<void> {
    const context = this._context;
    const cm = context.contentsModel;

    if (!cm) {
      return;
    }

    if (!force && cm.last_modified === this._lastKnownModified) {
      return;
    }

    this._lastKnownModified = cm.last_modified ?? "";
    this._clearAudioUrl();
    this._errorNode.hidden = true;
    this._errorNode.textContent = "";

    try {
      const format = cm.format;

      if (format !== "base64") {
        throw new Error("This audio file is not stored as binary content.");
      }

      const base64 = context.model.toString();
      const mime =
        cm.mimetype && cm.mimetype !== "application/octet-stream"
          ? cm.mimetype
          : mimeTypeForAudioPath(context.path);
      const { url, revoke } = base64ToObjectUrl(base64, mime);
      this._objectUrlRevoke = revoke;
      this._audio.src = url;
      this._syncStatus(cm.last_modified);
    } catch (error: unknown) {
      this._errorNode.hidden = false;
      this._errorNode.textContent =
        error instanceof Error ? error.message : "Could not play this audio.";

      Notification.warning("Could not load audio.", { autoClose: 4000 });
    }
  }

  private _syncStatus(lastModified: string | undefined): void {
    const name = PathExt.basename(this._context.path);
    const modified = formatContentsModified(lastModified);
    this._statusNode.textContent = `${name} · Updated ${modified}`;
  }
}
