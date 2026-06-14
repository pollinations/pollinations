import {
    getModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import type {
    ChatMessage,
    ServiceError,
    TransformOptions,
    TransformResult,
} from "../types.js";

type ContentPart = {
    type?: unknown;
};

type ModelDefinitionLike = {
    inputModalities?: string[];
};

function inputModalityError(message: string): ServiceError {
    const error = new Error(message) as ServiceError;
    error.name = "InputModalityError";
    error.status = 400;
    return error;
}

function hasImageInput(messages: ChatMessage[]): boolean {
    return messages.some((message) => {
        if (!Array.isArray(message.content)) return false;
        return message.content.some(
            (part): part is ContentPart =>
                !!part &&
                typeof part === "object" &&
                (part as ContentPart).type === "image_url",
        );
    });
}

export function validateInputModalities(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    if (!hasImageInput(messages)) return { messages, options };

    const requestedModel = options.requestedModel || options.model;
    if (!requestedModel) return { messages, options };

    const dynamicDefinition = options.dynamicModelDef
        ? (options.modelDef as ModelDefinitionLike | undefined)
        : undefined;
    let modelName: string;
    let definition: ModelDefinitionLike;
    if (dynamicDefinition) {
        modelName = requestedModel;
        definition = dynamicDefinition;
    } else {
        const resolvedModelName = resolveModelName(requestedModel);
        modelName = resolvedModelName;
        definition = getModelDefinition(resolvedModelName);
    }

    if (definition.inputModalities?.includes("image")) {
        return { messages, options };
    }

    throw inputModalityError(
        `Model '${modelName}' does not support image input. Choose a model with image input support.`,
    );
}
