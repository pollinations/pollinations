export const IMAGE_MODELS_WITH_REFERENCE_SUPPORT = [
    "nanobanana",
    "seedream",
    "kontext",
];

export const MAX_REFERENCE_IMAGES = 4;

export const modelSupportsImageInput = (modelId) => {
    if (!modelId) return false;
    const normalizedId = modelId.toLowerCase();
    return IMAGE_MODELS_WITH_REFERENCE_SUPPORT.includes(normalizedId);
};
