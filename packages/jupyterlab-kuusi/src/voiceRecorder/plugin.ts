import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { ICommandPalette } from "@jupyterlab/apputils";
import { PathExt } from "@jupyterlab/coreutils";
import { IDocumentManager } from "@jupyterlab/docmanager";
import { IDefaultFileBrowser } from "@jupyterlab/filebrowser";
import { ISettingRegistry } from "@jupyterlab/settingregistry";
import type { Contents } from "@jupyterlab/services";
import { FACTORY_KUUSI_VOICE } from "../defaultOpeners/constants";
import {
  AUDIO_EXTENSIONS,
  isKuusiAudioPath,
  KUUSI_AUDIO_FILE_TYPE,
} from "./voiceFormats";
import { VoiceWidgetFactory } from "./voiceFactory";
import {
  OPEN_VOICE_RECORDER_COMMAND,
  openVoiceRecorder,
} from "./openVoiceRecorder";
import { voiceRecorderIcon } from "./voiceIcon";
import { bindVoiceRecorderSettings } from "./voiceSettings";

const PLUGIN_ID = "jupyterlab-kuusi:voice-recorder";

export const OPEN_KUUSI_VOICE_COMMAND = "jupyterlab-kuusi:open-kuusi-voice";

type OpenVoiceArgs = {
  path?: string;
};

const isAudioContents = (item: Contents.IModel): boolean => {
  if (item.type === "directory") {
    return false;
  }

  if (isKuusiAudioPath(item.path)) {
    return true;
  }

  return item.mimetype.startsWith("audio/");
};

const resolveAudioPaths = (
  args: OpenVoiceArgs,
  defaultBrowser: IDefaultFileBrowser,
): string[] => {
  if (args.path) {
    return [args.path];
  }

  return [...defaultBrowser.selectedItems()]
    .filter(isAudioContents)
    .map((item) => item.path);
};

const registerAudioFileType = (app: JupyterFrontEnd): void => {
  if (app.docRegistry.getFileType(KUUSI_AUDIO_FILE_TYPE)) {
    return;
  }

  app.docRegistry.addFileType({
    name: KUUSI_AUDIO_FILE_TYPE,
    displayName: "Audio",
    extensions: [...AUDIO_EXTENSIONS],
    mimeTypes: [
      "audio/webm",
      "audio/ogg",
      "audio/mp4",
      "audio/mpeg",
      "audio/wav",
      "video/webm",
    ],
    icon: voiceRecorderIcon,
  });
};

const voiceRecorderPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: "Record voice notes and play audio in Jupyter.",
  autoStart: true,
  requires: [IDocumentManager, IDefaultFileBrowser],
  optional: [ICommandPalette, ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    docManager: IDocumentManager,
    defaultBrowser: IDefaultFileBrowser,
    palette: ICommandPalette | null,
    settingRegistry: ISettingRegistry | null,
  ) => {
    if (settingRegistry) {
      void bindVoiceRecorderSettings(settingRegistry);
    }

    registerAudioFileType(app);

    const revealInFileBrowser = async (path: string): Promise<void> => {
      const directory = PathExt.dirname(path);
      const name = PathExt.basename(path);

      await defaultBrowser.model.cd(directory);
      await defaultBrowser.selectItemByName(name);
      app.shell.activateById(defaultBrowser.id);
    };

    const factory = new VoiceWidgetFactory(revealInFileBrowser);
    app.docRegistry.addWidgetFactory(factory);

    const recorderDirectory = (): string => defaultBrowser.model.path ?? "";

    app.commands.addCommand(OPEN_VOICE_RECORDER_COMMAND, {
      label: "Voice note recorder",
      caption: "Record audio and save to the current file browser folder",
      icon: voiceRecorderIcon,
      execute: () => {
        openVoiceRecorder(app, docManager, recorderDirectory());
      },
    });

    const canOpen = (args: OpenVoiceArgs = {}) =>
      resolveAudioPaths(args, defaultBrowser).length > 0;

    app.commands.addCommand(OPEN_KUUSI_VOICE_COMMAND, {
      label: "Open with Kuusi Voice",
      caption: "Play the selected audio in Kuusi Voice",
      icon: voiceRecorderIcon,
      isVisible: (args: OpenVoiceArgs = {}) => canOpen(args),
      isEnabled: (args: OpenVoiceArgs = {}) => canOpen(args),
      execute: async (args: OpenVoiceArgs = {}) => {
        const paths = resolveAudioPaths(args, defaultBrowser);

        for (const path of paths) {
          await docManager.openOrReveal(path, FACTORY_KUUSI_VOICE);
        }
      },
    });

    palette?.addItem({
      command: OPEN_VOICE_RECORDER_COMMAND,
      category: "Kuusi",
    });

    palette?.addItem({
      command: OPEN_KUUSI_VOICE_COMMAND,
      category: "Kuusi",
    });

    app.contextMenu.addItem({
      command: OPEN_KUUSI_VOICE_COMMAND,
      selector: `.jp-DirListing-item[data-file-type="${KUUSI_AUDIO_FILE_TYPE}"]`,
      rank: 16,
    });

    console.info("jupyterlab-kuusi: voice recorder activated");
  },
};

export default voiceRecorderPlugin;
