import { renderMarkdown } from "@a2ui/markdown-it";
import {
    A2uiSurface,
    MarkdownContext,
    type ReactCatalogComponent,
} from "@a2ui/react/v0_9";
import {
    type ActionPayload,
    MessageProcessor,
    type SurfaceModel,
} from "@a2ui/web_core/v0_9";
import { basicCatalog } from "@a2ui/web_core/v0_9/basic_catalog";
import { type FormEvent, useEffect, useRef, useState } from "react";
import agent from "../../agent-a2ui-demo/agent.json";
import { applyBlock, type RenderError, splitReply } from "./a2ui-json";

const API_URL = "https://gen.pollinations.ai/v1/chat/completions";
// Hosted agents are callable as community/<owner>/<name>; a private one only with its owner's key.
const AGENT_MODEL = "community/voodoohop/a2ui-demo";

type Message = { role: "user" | "assistant"; content: string; error?: string };
type Processor = MessageProcessor<ReactCatalogComponent>;

function loadKey() {
    try {
        return sessionStorage.getItem("apiKey") ?? "";
    } catch {
        return "";
    }
}

function saveKey(value: string) {
    try {
        sessionStorage.setItem("apiKey", value);
    } catch {
        // Storage can be unavailable (private mode); the key then lives in state only.
    }
}

/** Streams the assistant text of an OpenAI-compatible chat completion. */
async function* streamChat(apiKey: string, body: object) {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ ...body, stream: true }),
    });
    if (!response.ok || !response.body) {
        throw new Error(`${response.status}: ${await response.text()}`);
    }
    const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
    let buffer = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            const data = line.startsWith("data:") ? line.slice(5).trim() : "";
            if (!data || data === "[DONE]") continue;
            const chunk = JSON.parse(data);
            if (chunk.error) throw new Error(JSON.stringify(chunk.error));
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) yield delta as string;
        }
    }
}

export function App() {
    const [apiKey, setApiKey] = useState(loadKey);
    const [model, setModel] = useState(AGENT_MODEL);
    const [sendPrompt, setSendPrompt] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [busy, setBusy] = useState(false);
    const send = useRef<(content: string) => void>(() => {});
    const [processor] = useState<Processor>(
        () =>
            new MessageProcessor([basicCatalog], (action: ActionPayload) =>
                // Clicks go back to the agent as an A2UI v0.9 client message.
                send.current(JSON.stringify({ version: "v0.9", action })),
            ),
    );
    const [surfaces, setSurfaces] = useState<
        SurfaceModel<ReactCatalogComponent>[]
    >([]);

    useEffect(() => {
        const sync = () => setSurfaces([...processor.getSurfaces().values()]);
        const created = processor.onSurfaceCreated(sync);
        const deleted = processor.onSurfaceDeleted(sync);
        return () => {
            created.unsubscribe();
            deleted.unsubscribe();
        };
    }, [processor]);

    // Streams the agent's reply to `content`. When its A2UI fails to render,
    // the first error goes back to the agent once, so it can fix the JSON.
    const reply = async (
        previous: Message[],
        content: string,
        retry: boolean,
    ) => {
        const history: Message[] = [...previous, { role: "user", content }];
        const system = sendPrompt
            ? [{ role: "system", content: agent.systemPrompt }]
            : [];
        let text = "";
        let rendered = 0;
        let failure = "";
        const renderErrors: RenderError[] = [];
        // Render each block once: when its closing tag arrives, or at the end.
        const render = (final: boolean) => {
            const { blocks } = splitReply(text);
            for (
                ;
                blocks[rendered] && (final || blocks[rendered].closed);
                rendered++
            ) {
                const error = applyBlock(processor, blocks[rendered].json);
                if (error) renderErrors.push(error);
            }
        };
        const thread = (): Message[] => [
            ...history,
            {
                role: "assistant",
                content: text,
                error: [
                    ...renderErrors.map((e) => `${e.code}: ${e.message}`),
                    failure,
                ]
                    .filter(Boolean)
                    .join("\n"),
            },
        ];
        setMessages(history);
        try {
            const chat = history.map(({ role, content }) => ({
                role,
                content,
            }));
            for await (const delta of streamChat(apiKey, {
                model,
                messages: [...system, ...chat],
            })) {
                text += delta;
                render(false);
                setMessages(thread());
            }
            render(true);
        } catch (error) {
            failure = String(error);
        }
        const done = thread();
        setMessages(done);
        if (retry && renderErrors[0]) {
            const error = { version: "v0.9", error: renderErrors[0] };
            await reply(done, JSON.stringify(error), false);
        }
    };

    send.current = async (content: string) => {
        if (busy || !content.trim()) return;
        setInput("");
        setBusy(true);
        await reply(messages, content, true);
        setBusy(false);
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        send.current(input);
    };
    const last = messages.at(-1);

    return (
        <MarkdownContext.Provider value={renderMarkdown}>
            <main>
                <h1>A2UI client</h1>
                <fieldset>
                    <label>
                        API key
                        <input
                            type="password"
                            value={apiKey}
                            placeholder="sk_..."
                            onChange={(event) => {
                                setApiKey(event.target.value);
                                saveKey(event.target.value);
                            }}
                        />
                    </label>
                    <label>
                        Model
                        <input
                            value={model}
                            onChange={(event) => setModel(event.target.value)}
                        />
                    </label>
                    <label className="inline">
                        <input
                            type="checkbox"
                            checked={sendPrompt}
                            onChange={(event) => {
                                setSendPrompt(event.target.checked);
                                setModel(
                                    event.target.checked
                                        ? agent.baseModel
                                        : AGENT_MODEL,
                                );
                            }}
                        />
                        Send the A2UI system prompt myself (test a base model)
                    </label>
                </fieldset>

                {messages.map((message, index) => (
                    <p key={index} className={message.role}>
                        {message.role === "user"
                            ? message.content
                            : splitReply(message.content).prose}
                        {message.error && (
                            <span className="error">{message.error}</span>
                        )}
                    </p>
                ))}

                {surfaces.map((surface) => (
                    <section key={surface.id} className="surface">
                        <A2uiSurface surface={surface} />
                    </section>
                ))}

                {last?.role === "assistant" && (
                    <details>
                        <summary>Raw reply</summary>
                        <pre>{last.content}</pre>
                    </details>
                )}

                <form onSubmit={submit}>
                    <input
                        value={input}
                        placeholder="Plan a 3-stop day trip in Lisbon…"
                        onChange={(event) => setInput(event.target.value)}
                    />
                    <button type="submit" disabled={busy || !apiKey}>
                        {busy ? "…" : "Send"}
                    </button>
                </form>
            </main>
        </MarkdownContext.Provider>
    );
}
