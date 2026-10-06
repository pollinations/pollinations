import { afterEach, expect, it, vi } from "vitest";
import { processCopy } from "../src/copy/translation/process";

afterEach(() => {
    vi.unstubAllGlobals();
});

it("translates different text independently when concurrent lists reuse item IDs", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
            const prompt = JSON.parse(String(init.body)).messages[0]
                .content as string;
            const text = prompt.includes('"text": "Goodbye"')
                ? "Adiós"
                : "Hola";
            return Response.json({
                choices: [
                    {
                        message: {
                            content: JSON.stringify([{ id: "item-0", text }]),
                        },
                    },
                ],
            });
        }),
    );

    const first = processCopy([{ id: "item-0", text: "Hello" }], "es");
    const second = processCopy([{ id: "item-0", text: "Goodbye" }], "es");

    expect(await Promise.all([first, second])).toEqual([
        [{ id: "item-0", text: "Hola" }],
        [{ id: "item-0", text: "Adiós" }],
    ]);
});
