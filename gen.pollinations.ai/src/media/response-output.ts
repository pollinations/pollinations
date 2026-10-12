import {
    CreateChatCompletionResponseSchema,
    CreateResponseResponseSchema,
    type ResponseUsage,
} from "@shared/schemas/openai.ts";
import { z } from "zod";

// The existing schemas enforce text-token accounting. Media is billed in its
// native units, so its text-protocol envelope must not invent token counts.
export const MediaResponseSchema = z
    .object({
        ...CreateResponseResponseSchema.shape,
        usage: z.null(),
    })
    .passthrough()
    .meta({ $id: "MediaResponse" });
export const MediaChatCompletionSchema =
    CreateChatCompletionResponseSchema.omit({ usage: true }).meta({
        $id: "MediaChatCompletion",
    });

export const mediaResponseDescription =
    "Media models that advertise this endpoint in `/models` also accept text prompts. Only the last user message's text is used (or a string `input` on Responses); history, instructions and text-generation settings are ignored. Empty prompts, malformed Unicode and prompts consisting only of `.` or `..` return HTTP 400. Attachments are not supported; reference-required models return their normal missing-input error. Dialogue models expect one `<voice>: <text>` turn per line. Images return a Markdown image embed; audio, video and 3D return a Markdown link. Both include the plain public URL. With `stream: true`, events are emitted after generation finishes. Media is billed normally, without text-token usage: Responses returns `usage: null`; Chat JSON omits `usage`, while Chat streaming chunks contain `usage: null` and have no final usage chunk. Use the native media endpoints for generation settings.";

export function createMediaResponse(
    model: string,
    url: string,
    contentType: string,
) {
    const label = contentType.startsWith("image/")
        ? "Image"
        : contentType.startsWith("video/")
          ? "Video"
          : contentType.startsWith("audio/")
            ? "Audio"
            : "3D model";
    const text = `${label === "Image" ? "!" : ""}[${label}](${url})\n\n${url}`;
    return createTextResponse(model, text);
}

export function createTextResponse(
    model: string,
    text: string,
    usage: ResponseUsage | null = null,
) {
    return {
        id: `resp_${crypto.randomUUID()}`,
        object: "response" as const,
        created_at: Math.floor(Date.now() / 1000),
        completed_at: Math.floor(Date.now() / 1000),
        status: "completed" as const,
        model,
        error: null,
        incomplete_details: null,
        instructions: null,
        max_output_tokens: null,
        parallel_tool_calls: false,
        previous_response_id: null,
        reasoning: { effort: null, summary: null },
        store: false,
        temperature: null,
        text: { format: { type: "text" } },
        tool_choice: "none",
        tools: [],
        top_p: null,
        truncation: "disabled",
        metadata: {},
        usage,
        output: [
            {
                id: `msg_${crypto.randomUUID()}`,
                type: "message" as const,
                role: "assistant" as const,
                status: "completed" as const,
                content: [
                    {
                        type: "output_text" as const,
                        text,
                        annotations: [],
                        logprobs: [],
                    },
                ],
            },
        ],
    };
}

type OutputItem = {
    id?: string;
    type?: string;
    content?: { type?: string; text?: string }[];
};

/** A finished Response presented as the normal Responses event lifecycle. */
export function textResponseStream(response: {
    output: object[];
    status?: string;
}) {
    const events: [string, Record<string, unknown>][] = [
        [
            "response.created",
            {
                response: {
                    ...response,
                    status: "in_progress",
                    completed_at: null,
                    output: [],
                },
            },
        ],
    ];
    for (const [output_index, item] of (
        response.output as OutputItem[]
    ).entries()) {
        const isMessage = item.type === "message";
        events.push([
            "response.output_item.added",
            {
                output_index,
                item: {
                    ...item,
                    status: "in_progress",
                    ...(isMessage && { content: [] }),
                },
            },
        ]);
        for (const [content_index, part] of (isMessage
            ? (item.content ?? [])
            : []
        ).entries()) {
            const position = { item_id: item.id, output_index, content_index };
            const text = part.type === "output_text";
            events.push([
                "response.content_part.added",
                { ...position, part: text ? { ...part, text: "" } : part },
            ]);
            if (text)
                events.push(
                    [
                        "response.output_text.delta",
                        { ...position, delta: part.text, logprobs: [] },
                    ],
                    [
                        "response.output_text.done",
                        { ...position, text: part.text, logprobs: [] },
                    ],
                );
            events.push(["response.content_part.done", { ...position, part }]);
        }
        events.push(["response.output_item.done", { output_index, item }]);
    }
    events.push([
        response.status === "incomplete" || response.status === "failed"
            ? `response.${response.status}`
            : "response.completed",
        { response },
    ]);
    return new Blob([
        events
            .map(
                ([type, payload], sequence_number) =>
                    `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number, ...payload })}\n\n`,
            )
            .join(""),
        "data: [DONE]\n\n",
    ]).stream();
}
