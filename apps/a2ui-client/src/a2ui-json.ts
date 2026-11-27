import {
    A2uiError,
    type ComponentApi,
    type MessageProcessor,
} from "@a2ui/web_core/v0_9";

// Agents embed A2UI messages in their text reply as <a2ui-json>…</a2ui-json>
// blocks, the wire format of the official A2UI agent SDK (direct_json).
const BLOCK = /<a2ui-json[^>]*>([\s\S]*?)(<\/a2ui-json\s*>|$)/gi;
// Hosted Pollinations agents also stream their tool calls into the text as
// <details type="tool_calls"> blocks; they are not prose.
const TOOL_CALLS = /<details type="tool_calls"[\s\S]*?(<\/details>|$)/g;

export type Block = { json: string; closed: boolean };
/** The `error` of an A2UI v0.9 client-to-server message. */
export type RenderError = { code: string; surfaceId: string; message: string };

/** Splits a (possibly still streaming) reply into prose and A2UI blocks. */
export function splitReply(text: string): { prose: string; blocks: Block[] } {
    const blocks: Block[] = [];
    const prose = text.replace(BLOCK, (_, json: string, close: string) => {
        // Models sometimes wrap the JSON in a markdown fence; upstream strips it too.
        const unfenced = json
            .trim()
            .replace(/^```[\w-]*\s*/, "")
            .replace(/\s*```$/, "");
        blocks.push({ json: unfenced, closed: close !== "" });
        return "";
    });
    return { prose: prose.replace(TOOL_CALLS, "").trim(), blocks };
}

/** Feeds one block to the processor; returns the A2UI error if it fails. */
export function applyBlock<T extends ComponentApi>(
    processor: MessageProcessor<T>,
    json: string,
): RenderError | undefined {
    try {
        const messages = JSON.parse(json);
        // A full re-render may create an existing surface again: replace it.
        for (const message of [messages].flat()) {
            const id = message?.createSurface?.surfaceId;
            if (id && processor.getSurface(id))
                processor.model.deleteSurface(id);
        }
        processor.processMessages(messages);
    } catch (error) {
        return {
            code:
                error instanceof A2uiError
                    ? error.code
                    : error instanceof SyntaxError
                      ? "INVALID_JSON"
                      : "UNKNOWN_ERROR",
            // Read from the raw text, which may not parse.
            surfaceId: json.match(/"surfaceId"\s*:\s*"([^"]*)"/)?.[1] ?? "",
            message: error instanceof Error ? error.message : String(error),
        };
    }
}
