import dotenv from "dotenv";
import {
    createOVHModelConfig,
} from "./providerConfigs.js";
import type { TEXT_COSTS } from "../../shared/registry/text.js";

dotenv.config();

// Type constraint: export ValidModelId so availableModels.ts can use it
export type ValidModelId = keyof typeof TEXT_COSTS;

type PortkeyConfigMap = Record<string, () => any>;

export const portkeyConfig: PortkeyConfigMap = {
    "gpt-oss-20b": () =>
        createOVHModelConfig({
            model: "gpt-oss-20b",
            "max-tokens": 1500,
        }),
};
