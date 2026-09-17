import type { JupyterFrontEnd } from "@jupyterlab/application";
import { MainAreaWidget } from "@jupyterlab/apputils";
import type { IDocumentManager } from "@jupyterlab/docmanager";
import { UUID } from "@lumino/coreutils";
import { VoiceRecorderPanel } from "./voiceRecorderPanel";
import { voiceRecorderIcon } from "./voiceIcon";
import { applyKuusiTabIcon } from "../kuusiTabIcon";

export const OPEN_VOICE_RECORDER_COMMAND = "jupyterlab-kuusi:open-voice-recorder";

export const openVoiceRecorder = (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  directory: string,
): MainAreaWidget<VoiceRecorderPanel> => {
  const widget = new MainAreaWidget<VoiceRecorderPanel>({
    content: new VoiceRecorderPanel(docManager, directory),
  });

  widget.id = `kuusi-voice-recorder-${UUID.uuid4()}`;
  widget.title.label = "Voice note";
  widget.title.closable = true;
  applyKuusiTabIcon(widget.title, voiceRecorderIcon, "Kuusi Voice");

  app.shell.add(widget, "main", { activate: true });

  return widget;
};
