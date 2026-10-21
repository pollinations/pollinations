// Agents embed A2UI messages in their text reply as <a2ui-json>…</a2ui-json>
// blocks, the wire format of the official A2UI agent SDK (direct_json).
const BLOCK = /<a2ui-json[^>]*>([\s\S]*?)(<\/a2ui-json\s*>|$)/gi;
// Hosted Pollinations agents also stream their tool calls into the text as
// <details type="tool_calls"> blocks; they are not prose.
const TOOL_CALLS = /<details type="tool_calls"[\s\S]*?(<\/details>|$)/g;

export type Block = { json: string; closed: boolean };

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
