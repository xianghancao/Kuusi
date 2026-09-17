import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
} from "@jupyterlab/docregistry";
import { ToolbarButton } from "@jupyterlab/apputils";
import { folderIcon, refreshIcon } from "@jupyterlab/ui-components";
import { FACTORY_KUUSI_VOICE } from "../defaultOpeners/constants";
import { KUUSI_AUDIO_FILE_TYPE } from "./voiceFormats";
import { VoicePlayer } from "./voicePlayer";
import { voiceRecorderIcon } from "./voiceIcon";
import { applyKuusiTabIcon } from "../kuusiTabIcon";

export class VoiceDocumentWidget extends DocumentWidget<VoicePlayer> {
  constructor(
    options: DocumentWidget.IOptions<VoicePlayer> & {
      revealInFileBrowser?: (path: string) => Promise<void>;
    },
  ) {
    super(options);
    this.addClass("jp-KuusiVoiceDocument");
    applyKuusiTabIcon(this.title, voiceRecorderIcon, "Kuusi Voice");

    let rank = 0;

    this.toolbar.insertItem(
      rank++,
      "refresh",
      new ToolbarButton({
        icon: refreshIcon,
        tooltip: "Reload audio from disk",
        onClick: () => {
          void options.context.revert();
        },
      }),
    );

    if (options.revealInFileBrowser) {
      const reveal = options.revealInFileBrowser;

      this.toolbar.insertItem(
        rank++,
        "reveal",
        new ToolbarButton({
          icon: folderIcon,
          tooltip: "Show in file browser",
          onClick: () => {
            void reveal(options.context.path);
          },
        }),
      );
    }

  }
}

export class VoiceWidgetFactory extends ABCWidgetFactory<
  VoiceDocumentWidget,
  DocumentRegistry.IModel
> {
  static readonly NAME = FACTORY_KUUSI_VOICE;

  constructor(private _revealInFileBrowser?: (path: string) => Promise<void>) {
    super({
      name: FACTORY_KUUSI_VOICE,
      label: FACTORY_KUUSI_VOICE,
      modelName: "base64",
      fileTypes: [KUUSI_AUDIO_FILE_TYPE],
      readOnly: true,
    });
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>,
  ): VoiceDocumentWidget {
    const player = new VoicePlayer(context);

    return new VoiceDocumentWidget({
      content: player,
      context,
      revealInFileBrowser: this._revealInFileBrowser,
    });
  }
}
