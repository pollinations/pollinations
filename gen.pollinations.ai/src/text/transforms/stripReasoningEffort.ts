import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

/**
 * Strips the `reasoning_effort` option from the request.
 *
 * The non-reasoning Grok deployment (`grok-4-20-non-reasoning`) returns an
 * opaque upstream 500 instead of ignoring `reasoning_effort` when it's
 * forwarded (verified on prod: 5/5 with the param → 500, 5/5 without → 200).
 * Apply this only on model entries whose upstream rejects it.
 */
export function stripReasoningEffort(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    if (options.reasoning_effort === undefined) {
        return { messages, options };
    }

    const { reasoning_effort: _dropped, ...rest } = options;
    return { messages, options: rest };
}
