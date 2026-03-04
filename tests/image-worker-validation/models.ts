/**
 * Image/video model definitions extracted from shared/registry/image.ts.
 * Update this file if models change in the registry.
 */

export interface ImageModel {
    id: string;
    modelId: string;
    inputModalities: string[];
    outputModalities: string[];
    paidOnly?: boolean;
    hidden?: boolean;
    alpha?: boolean;
    provider: string;
}

export const IMAGE_MODELS: ImageModel[] = [
    {
        id: "kontext",
        modelId: "kontext",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        paidOnly: true,
        provider: "azure",
    },
    {
        id: "nanobanana",
        modelId: "nanobanana",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        paidOnly: true,
        provider: "google",
    },
    {
        id: "nanobanana-2",
        modelId: "nanobanana-2",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        paidOnly: true,
        provider: "google",
    },
    {
        id: "nanobanana-pro",
        modelId: "nanobanana-pro",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        paidOnly: true,
        provider: "google",
    },
    {
        id: "seedream5",
        modelId: "seedream5",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        paidOnly: true,
        provider: "bytedance",
    },
    {
        id: "seedream",
        modelId: "seedream",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        paidOnly: true,
        hidden: true,
        provider: "bytedance",
    },
    {
        id: "seedream-pro",
        modelId: "seedream-pro",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        paidOnly: true,
        hidden: true,
        provider: "bytedance",
    },
    {
        id: "gptimage",
        modelId: "gptimage",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        provider: "azure",
    },
    {
        id: "gptimage-large",
        modelId: "gptimage-large",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        paidOnly: true,
        provider: "azure",
    },
    {
        id: "flux",
        modelId: "flux",
        inputModalities: ["text"],
        outputModalities: ["image"],
        provider: "io.net",
    },
    {
        id: "zimage",
        modelId: "zimage",
        inputModalities: ["text"],
        outputModalities: ["image"],
        provider: "io.net",
    },
    {
        id: "klein",
        modelId: "klein",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        provider: "modal",
    },
    {
        id: "klein-large",
        modelId: "klein-large",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
        provider: "modal",
    },
    {
        id: "imagen-4",
        modelId: "imagen-4",
        inputModalities: ["text"],
        outputModalities: ["image"],
        alpha: true,
        provider: "airforce",
    },
    {
        id: "flux-2-dev",
        modelId: "flux-2-dev",
        inputModalities: ["text"],
        outputModalities: ["image"],
        alpha: true,
        provider: "airforce",
    },
    {
        id: "grok-imagine",
        modelId: "grok-imagine",
        inputModalities: ["text"],
        outputModalities: ["image"],
        alpha: true,
        provider: "airforce",
    },
];

export const VIDEO_MODELS: ImageModel[] = [
    {
        id: "veo",
        modelId: "veo",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        paidOnly: true,
        provider: "google",
    },
    {
        id: "seedance",
        modelId: "seedance",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        paidOnly: true,
        provider: "bytedance",
    },
    {
        id: "seedance-pro",
        modelId: "seedance-pro",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        paidOnly: true,
        provider: "bytedance",
    },
    {
        id: "wan",
        modelId: "wan",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        paidOnly: true,
        provider: "alibaba",
    },
    {
        id: "grok-video",
        modelId: "grok-video",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
        alpha: true,
        provider: "airforce",
    },
    {
        id: "ltx-2",
        modelId: "ltx-2",
        inputModalities: ["text"],
        outputModalities: ["video"],
        paidOnly: true,
        provider: "modal",
    },
];
