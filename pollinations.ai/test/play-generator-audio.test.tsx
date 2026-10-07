import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

const { Button, stateUpdates } = vi.hoisted(() => ({
    Button: () => null,
    stateUpdates: [] as { initial: unknown; value: unknown }[],
}));

vi.mock("react", () => ({
    useCallback: (callback: unknown) => callback,
    useEffect: () => undefined,
    useMemo: (factory: () => unknown) => factory(),
    useState: (initial: unknown) => [
        initial,
        (value: unknown) => stateUpdates.push({ initial, value }),
    ],
}));

vi.mock("@pollinations/ui", () => ({
    Alert: Button,
    AudioIcon: Button,
    Button,
    ClipboardIcon: Button,
    ContentHeader: Button,
    CopyButton: Button,
    ExternalLinkButton: Button,
    Eyebrow: Button,
    FieldStack: Button,
    ImageIcon: Button,
    Input: Button,
    LinkCard: Button,
    LockIcon: Button,
    RobotIcon: Button,
    Surface: Button,
    TabButton: Button,
    Text: Button,
    Tooltip: Button,
    VideoIcon: Button,
}));

vi.mock("../src/hooks/usePageCopy", () => ({
    usePageCopy: () => ({
        copy: new Proxy({}, { get: (_target, key) => String(key) }),
    }),
}));

import type { Model } from "../src/hooks/useModelList";
import { PlayGenerator } from "../src/ui/components/play/PlayGenerator";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function findGenerateButton(
    element: unknown,
): { props: { onClick?: () => Promise<void>; size?: string } } | undefined {
    if (Array.isArray(element)) {
        for (const child of element) {
            const match = findGenerateButton(child);
            if (match) return match;
        }
        return undefined;
    }
    if (!element || typeof element !== "object") return undefined;

    const candidate = element as {
        type?: unknown;
        props?: {
            children?: unknown;
            onClick?: () => Promise<void>;
            size?: string;
        };
    };
    if (candidate.type === Button && candidate.props?.size === "lg") {
        return candidate as {
            props: { onClick?: () => Promise<void>; size?: string };
        };
    }
    return findGenerateButton(candidate.props?.children);
}

async function clickGenerate(model: Model, includeChatAudio = true) {
    const requests: { url: string; init?: RequestInit }[] = [];
    const audioBlobTypes: string[] = [];
    stateUpdates.length = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
        audioBlobTypes.push(blob instanceof Blob ? blob.type : "media-source");
        return "blob:generated-audio";
    });
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            requests.push({ url: String(input), init });
            if (String(input).endsWith("/v1/chat/completions")) {
                return new Response(
                    JSON.stringify({
                        choices: [
                            {
                                message: {
                                    audio: includeChatAudio
                                        ? { data: "AQ==" }
                                        : {},
                                },
                            },
                        ],
                    }),
                );
            }
            return new Response(new Uint8Array([1]), {
                headers: { "Content-Type": "audio/mpeg" },
            });
        }),
    );

    const tree = PlayGenerator({
        selectedModel: model.id,
        prompt: "Say hello",
        currentModel: model,
        apiKey: "pk_test",
        onLoginRequired: () => undefined,
    });
    const button = findGenerateButton(tree);
    assert.ok(button?.props.onClick);
    await button.props.onClick();
    return { request: requests[0], audioBlobTypes, updates: [...stateUpdates] };
}

const models: Model[] = [
    {
        id: "openai/gpt-audio-mini",
        name: "openai/gpt-audio-mini",
        title: "GPT Audio Mini",
        type: "audio",
        hasImageInput: false,
        hasAudioOutput: true,
        hasVideoOutput: false,
        inputModalities: ["text", "audio"],
        outputModalities: ["audio", "text"],
        supportedEndpoints: ["/v1/chat/completions"],
        voices: ["alloy"],
    },
    {
        id: "openai/tts-1",
        name: "openai/tts-1",
        title: "OpenAI TTS",
        type: "audio",
        hasImageInput: false,
        hasAudioOutput: true,
        hasVideoOutput: false,
        inputModalities: ["text"],
        outputModalities: ["audio"],
        supportedEndpoints: ["/v1/audio/speech"],
        voices: ["nova"],
    },
];

test("PlayGenerator submits chat-audio models to chat completions", async () => {
    const { request, audioBlobTypes } = await clickGenerate(models[0]);

    assert.equal(
        request.url,
        "https://gen.pollinations.ai/v1/chat/completions",
    );
    assert.equal(request.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(request.init?.body)), {
        model: "openai/gpt-audio-mini",
        modalities: ["text", "audio"],
        audio: { voice: "alloy", format: "wav" },
        messages: [{ role: "user", content: "Say hello" }],
    });
    assert.deepEqual(audioBlobTypes, ["audio/wav"]);
});

test("PlayGenerator keeps TTS models on the speech endpoint", async () => {
    const { request, audioBlobTypes } = await clickGenerate(models[1]);

    assert.equal(request.url, "https://gen.pollinations.ai/v1/audio/speech");
    assert.equal(request.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(request.init?.body)), {
        model: "openai/tts-1",
        input: "Say hello",
        voice: "nova",
    });
    assert.deepEqual(audioBlobTypes, ["audio/mpeg"]);
});

test("PlayGenerator reports a chat response without audio data", async () => {
    const { audioBlobTypes, updates } = await clickGenerate(models[0], false);

    assert.deepEqual(audioBlobTypes, []);
    assert.ok(updates.some((update) => update.value === "noResponse"));
});
