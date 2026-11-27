import { PolliProvider, useAuthActions } from "@pollinations/sdk/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { Reply, useAgentChat } from "./AgentChat";

type Chat = ReturnType<typeof useAgentChat>;
type Auth = ReturnType<typeof useAuthActions>;

const AGENT = "community/test/agent";

/** One streamed reply: the text, then how the response ended. */
function reply(text: string, end = "response.completed"): Response {
    const events = [
        { type: "response.output_text.delta", item_id: "msg_1", delta: text },
        {
            type: end,
            response: { output: [], incomplete_details: { reason: "length" } },
        },
    ];
    return new Response(
        events
            .map(
                (event) =>
                    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            )
            .join(""),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
}

let chat: Chat;
let auth: Auth;

function Page({ agent }: { agent?: string }) {
    chat = useAgentChat(agent, async () => "");
    auth = useAuthActions();
    return chat.turns.map((turn) => (
        <Reply
            key={turn.id}
            turn={turn}
            renderMedia={(url) => <span data-media={url} />}
        />
    ));
}

const page = (agent?: string) => (
    <PolliProvider>
        <Page agent={agent} />
    </PolliProvider>
);

/** Lets React apply what arrived, until the expectation holds. */
const settled = (expectation: () => void) =>
    vi.waitFor(async () => {
        await act(async () => {});
        expectation();
    });

/** Opens the page signed in, sends one message and waits for the reply. */
async function ask(response: Response): Promise<ReactTestRenderer> {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    let renderer!: ReactTestRenderer;
    await act(async () => {
        renderer = create(page(AGENT));
    });
    await act(async () => auth.setApiKey("sk_test"));
    await act(async () => chat.send("hi"));
    await settled(() => expect(chat.busy).toBe(false));
    return renderer;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it("shows media from other hosts as links and loads nothing from them", async () => {
    const renderer = await ask(
        reply(
            "![chart](https://cdn.example/chart.png)\n\n[Clip](https://cdn.example/clip.mp4)\n\n![image](https://media.pollinations.ai/abc.png)",
        ),
    );
    const links = () =>
        renderer.root.findAllByType("a").map((link) => link.props.href);
    // The reply's text is part of its process, which starts folded.
    await act(async () =>
        renderer.root
            .findByType("details")
            .props.onToggle({ currentTarget: { open: true } }),
    );
    // The Markdown renderer loads with the first reply.
    await settled(() =>
        expect(links()).toContain("https://cdn.example/chart.png"),
    );
    expect(links()).toContain("https://cdn.example/clip.mp4");
    for (const element of ["img", "audio", "video", "source"] as const)
        expect(renderer.root.findAllByType(element)).toEqual([]);
    expect(
        renderer.root
            .findAll((node) => node.props["data-media"])
            .map((node) => node.props["data-media"]),
    ).toEqual(["https://media.pollinations.ai/abc.png"]);
    // The only request the page made itself is the one to the agent.
    expect(fetch).toHaveBeenCalledTimes(1);
});

it("keeps a conversation across tabs and clears it on disconnect", async () => {
    const renderer = await ask(reply("Hello"));
    expect(chat.turns).toHaveLength(1);

    await act(async () => renderer.update(page(undefined)));
    expect(chat.turns).toHaveLength(0);
    await act(async () => renderer.update(page(AGENT)));
    expect(chat.turns).toHaveLength(1);

    await act(async () => auth.logout());
    expect(chat.turns).toHaveLength(0);
    await act(async () => auth.setApiKey("sk_other"));
    expect(chat.turns).toHaveLength(0);
});

it("brings a conversation back after a reload, until disconnect", async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
        removeItem: (key: string) => saved.delete(key),
    });
    const first = await ask(reply("Hello"));
    await act(async () => first.unmount());

    // A reload: a new page that reads its key after the first render.
    let reloaded!: ReactTestRenderer;
    await act(async () => {
        reloaded = create(page(AGENT));
    });
    await act(async () => auth.setApiKey("sk_test"));
    expect(chat.turns).toMatchObject([
        { prompt: "hi", status: "done", items: [{ text: "Hello" }] },
    ]);

    await act(async () => auth.logout());
    await act(async () => reloaded.unmount());
    await act(async () => {
        create(page(AGENT));
    });
    await act(async () => auth.setApiKey("sk_test"));
    expect(chat.turns).toHaveLength(0);
});

it("keeps the text of a reply that was cut off and says why", async () => {
    await ask(reply("Half an ans", "response.incomplete"));
    expect(chat.turns[0]).toMatchObject({
        status: "interrupted",
        error: "The reply reached its limit before it was complete.",
        items: [{ type: "text", text: "Half an ans" }],
    });
    expect(chat.turns[0].output).toBeUndefined();
});
