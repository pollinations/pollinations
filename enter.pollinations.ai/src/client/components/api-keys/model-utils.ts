import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";

export const getModelDisplayName = (modelId: string): string => {
    const textService = TEXT_SERVICES[modelId as keyof typeof TEXT_SERVICES];
    if (textService) {
        return textService.description?.split(" - ")[0] || modelId;
    }
    const imageService = IMAGE_SERVICES[modelId as keyof typeof IMAGE_SERVICES];
    if (imageService) {
        return imageService.description?.split(" - ")[0] || modelId;
    }
    const audioService = AUDIO_SERVICES[modelId as keyof typeof AUDIO_SERVICES];
    if (audioService) {
        return audioService.description?.split(" - ")[0] || modelId;
    }
    return modelId;
};
