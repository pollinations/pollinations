export type RequestShape = {
    streamRequested?: boolean;
    messageCount?: number;
    toolCount?: number;
    hasToolChoice?: boolean;
    hasResponseFormat?: boolean;
    imageCount?: number;
    audioCount?: number;
    maxTokens?: number;
    temperature?: number;
};

type JsonRecord = Record<string, unknown>;

export function extractRequestShape(
    requestBody: unknown,
): RequestShape | undefined {
    const body = asRecord(requestBody);
    if (!body) return undefined;

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const contentParts = messages.flatMap((message) => {
        const content = asRecord(message)?.content;
        return Array.isArray(content) ? content : [];
    });

    return removeUndefined({
        streamRequested:
            typeof body.stream === "boolean" ? body.stream : undefined,
        messageCount: messages.length,
        toolCount: arrayLength(body.tools) + arrayLength(body.functions),
        hasToolChoice:
            body.tool_choice !== undefined || body.function_call !== undefined,
        hasResponseFormat: body.response_format !== undefined,
        imageCount: contentParts.filter(isImagePart).length,
        audioCount: contentParts.filter(isAudioPart).length,
        maxTokens: firstNonNegativeInteger(
            body.max_tokens,
            body.max_completion_tokens,
        ),
        temperature: finiteNumber(body.temperature),
    });
}

function asRecord(value: unknown): JsonRecord | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }
    return value as JsonRecord;
}

function arrayLength(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
}

function firstNonNegativeInteger(...values: unknown[]): number | undefined {
    for (const value of values) {
        if (
            typeof value === "number" &&
            Number.isInteger(value) &&
            value >= 0
        ) {
            return value;
        }
    }
    return undefined;
}

function finiteNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
}

function isImagePart(part: unknown): boolean {
    const record = asRecord(part);
    return (
        record?.type === "image_url" ||
        record?.type === "input_image" ||
        record?.image_url !== undefined ||
        record?.input_image !== undefined
    );
}

function isAudioPart(part: unknown): boolean {
    const record = asRecord(part);
    return (
        record?.type === "input_audio" ||
        record?.input_audio !== undefined ||
        record?.audio !== undefined
    );
}

function removeUndefined(shape: RequestShape): RequestShape {
    return Object.fromEntries(
        Object.entries(shape).filter(([, value]) => value !== undefined),
    ) as RequestShape;
}
