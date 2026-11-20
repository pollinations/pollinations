import { expect, it } from "vitest";
import {
    getAudioModelsInfo,
    getImageModelsInfo,
} from "../../../shared/registry/model-info";
import type { ImageFormats } from "../ui/play/image-output";
import { previewImageFormats } from "../ui/play/image-output";
import {
    type AudioCatalogMetadata,
    playgroundModelOverride,
} from "./playground-model-overrides";
import inventory from "./playground-model-overrides.json";

it("keeps model overrides aligned with public registry entries", () => {
    const models = new Map(
        [...getAudioModelsInfo(), ...getImageModelsInfo()].map((model) => [
            model.name,
            model,
        ]),
    );
    for (const id of Object.keys(inventory)) {
        const model = models.get(id) as
            | (ReturnType<typeof getAudioModelsInfo>[number] &
                  AudioCatalogMetadata & { output_formats?: ImageFormats })
            | undefined;
        const override = playgroundModelOverride(id);
        expect(model, id).toBeDefined();
        expect(override?.reason.trim(), id).toBeTruthy();
        expect(override?.source.trim(), id).toBeTruthy();
        if (!model || !override) continue;

        if (override.audioCatalog?.max_reference_audios) {
            expect(model.input_modalities, id).toContain("audio");
        }
        if (override.audioCatalog?.transcription_options) {
            expect(model.supported_endpoints, id).toContain(
                "/v1/audio/transcriptions",
            );
        }
        for (const key of [
            "max_reference_audios",
            "audio_input_constraints",
            "transcription_options",
        ] as const) {
            const preview = override.audioCatalog?.[key];
            if (preview !== undefined && model[key] !== undefined)
                expect(preview, `${id} ${key}`).toEqual(model[key]);
        }

        if (override.imageFormats) {
            expect(model.category, id).toBe("image");
            const preview = previewImageFormats(
                { ...model, output_formats: undefined },
                override.imageFormats,
            );
            for (const [format, entry] of Object.entries(preview ?? {})) {
                expect(model.input_modalities, `${id} ${format}`).toEqual(
                    expect.arrayContaining(entry.input_modalities),
                );
                if (model.output_formats?.[format])
                    expect(entry, `${id} ${format}`).toEqual(
                        model.output_formats[format],
                    );
            }
        }
    }
});
