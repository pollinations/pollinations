import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { getModelDisplayName } from "../api-keys/model-utils.ts";

export const ALL_MODELS = [
    ...Object.keys(TEXT_SERVICES).map((id) => ({
        id,
        label: getModelDisplayName(id),
        type: "text" as const,
    })),
    ...Object.keys(IMAGE_SERVICES).map((id) => ({
        id,
        label: getModelDisplayName(id),
        type: "image" as const,
    })),
];

export const MS_PER_DAY = 86400000;
export const MS_PER_WEEK = MS_PER_DAY * 7;
export const MS_PER_30_DAYS = MS_PER_DAY * 30;
