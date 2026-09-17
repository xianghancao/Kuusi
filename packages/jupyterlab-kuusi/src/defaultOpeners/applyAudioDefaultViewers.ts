import type { DocumentRegistry } from "@jupyterlab/docregistry";
import { FACTORY_KUUSI_VOICE } from "./constants";
import { KUUSI_AUDIO_FILE_TYPE } from "../voiceRecorder/voiceFormats";

const kuusiVoiceFactoryName = (): string =>
  FACTORY_KUUSI_VOICE.toLowerCase();

const registryDefaults = (
  registry: DocumentRegistry,
): {
  _defaultWidgetFactories: Record<string, string>;
  _defaultWidgetFactoryOverrides: Record<string, string>;
} =>
  registry as unknown as {
    _defaultWidgetFactories: Record<string, string>;
    _defaultWidgetFactoryOverrides: Record<string, string>;
  };

export const applyAudioDefaultViewers = (
  registry: DocumentRegistry,
  useKuusi: boolean,
): void => {
  const reg = registryDefaults(registry);
  const fileType = KUUSI_AUDIO_FILE_TYPE;

  if (useKuusi) {
    if (!registry.getWidgetFactory(FACTORY_KUUSI_VOICE)) {
      return;
    }

    reg._defaultWidgetFactoryOverrides[fileType] = kuusiVoiceFactoryName();
    return;
  }

  delete reg._defaultWidgetFactoryOverrides[fileType];
};
