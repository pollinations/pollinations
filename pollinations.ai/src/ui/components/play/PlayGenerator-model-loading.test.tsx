import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Model } from "../../../hooks/useModelList";
import { PlayGenerator } from "./PlayGenerator";

const { generateButton } = vi.hoisted(() => ({
    generateButton: vi.fn(),
}));

// Retain the real UI and inspect the handler before Button makes disabled clicks inert.
vi.mock("@pollinations/ui", async (importOriginal) => {
    const ui = await importOriginal<typeof import("@pollinations/ui")>();
    return {
        ...ui,
        Button: (props: ComponentProps<typeof ui.Button>) => {
            if (props.size === "lg") generateButton(props);
            return <ui.Button {...props} />;
        },
    };
});

afterEach(() => {
    generateButton.mockClear();
    vi.unstubAllGlobals();
});

function renderGenerator(currentModel?: Model, selectedModel = "flux") {
    renderToStaticMarkup(
        <PlayGenerator
            selectedModel={selectedModel}
            currentModel={currentModel}
            prompt="draw a tree"
            apiKey="pk_test_fixture"
            onLoginRequired={vi.fn()}
        />,
    );
    return generateButton.mock.lastCall?.[0] as {
        disabled: boolean;
        onClick: () => Promise<void>;
    };
}

describe("Play generation model discovery", () => {
    test.each([
        "flux",
        "unknown-alias",
    ])("does not dispatch %s while its metadata is unavailable", async (selectedModel) => {
        const fetch = vi.fn(async () => Response.json({}));
        vi.stubGlobal("fetch", fetch);
        const button = renderGenerator(undefined, selectedModel);

        // Invoke the component handler directly as well as checking the UI guard.
        await button.onClick();

        expect(fetch).not.toHaveBeenCalled();
        expect(button.disabled).toBe(true);
    });

    test.each([
        ["image", false, false, "/image/draw%20a%20tree", undefined],
        ["image", false, true, "/image/draw%20a%20tree", undefined],
        ["text", false, false, "/v1/chat/completions", "POST"],
        ["audio", true, false, "/v1/audio/speech", "POST"],
        ["text", true, false, "/v1/chat/completions", "POST"],
    ] as const)("dispatches loaded %s metadata (audio %s, video %s) through its endpoint", async (type, hasAudioOutput, hasVideoOutput, pathname, method) => {
        const fetch = vi.fn<
            (url: string, options: RequestInit) => Promise<Response>
        >(async () =>
            Response.json({
                choices: [
                    {
                        message: {
                            content: "fixture",
                            audio: { data: "YQ==" },
                        },
                    },
                ],
            }),
        );
        vi.stubGlobal("fetch", fetch);
        const button = renderGenerator(
            {
                id: "fixture-model",
                name: "fixture-model",
                title: "Fixture",
                type,
                hasImageInput: false,
                hasAudioOutput,
                hasVideoOutput,
            },
            "fixture-model",
        );

        expect(button.disabled).toBe(false);
        await button.onClick();

        expect(fetch).toHaveBeenCalledOnce();
        const [url, options] = fetch.mock.calls[0];
        expect(new URL(url).pathname).toBe(pathname);
        expect(options.method).toBe(method);
        if (method) {
            expect(JSON.parse(options.body as string).model).toBe(
                "fixture-model",
            );
        } else {
            expect(new URL(url).searchParams.get("model")).toBe(
                "fixture-model",
            );
        }
    });
});
