import { afterEach, expect, it, vi } from "vitest";
import { setOutputMode } from "../lib/output.js";
import { docsCommand } from "./docs.js";

const originalTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setOutputMode("human");
    if (originalTTY)
        Object.defineProperty(process.stdout, "isTTY", originalTTY);
    else delete (process.stdout as unknown as Record<string, unknown>).isTTY;
});

it.each(["/v1/chat/completions", "/v1/models", "models"])(
    "finds %s in section bodies without splitting fenced examples",
    async (endpoint) => {
        const section = [
            "## API endpoints",
            "| POST /v1/chat/completions | Chat |",
            "| GET /v1/models | Models |",
            "```bash",
            "# POST /v1/chat/completions",
            "curl https://gen.pollinations.ai/v1/chat/completions",
            "## GET /v1/models",
            "curl https://gen.pollinations.ai/v1/models",
            "```",
            "",
        ].join("\n");
        const modelsSection = "## Models\nCatalog documentation.\n";
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue(
                    new Response(
                        `${section}${modelsSection}## Unrelated\nModels are mentioned here.\n`,
                    ),
                ),
        );
        const write = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);
        setOutputMode("json");

        await docsCommand.parseAsync([endpoint], { from: "user" });

        expect(JSON.parse(String(write.mock.calls[0][0]))).toEqual({
            endpoint,
            content: endpoint === "models" ? modelsSection : section,
        });
    },
);

it("keeps raw Markdown when piped", async () => {
    const markdown = "## Chat\nUse `model` to select a model.\n";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(markdown)));
    Object.defineProperty(process.stdout, "isTTY", {
        configurable: true,
        value: false,
    });
    const write = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

    await docsCommand.parseAsync([], { from: "user" });

    expect(write.mock.calls[0][0]).toBe(markdown);
});

it.each(["MCP Servers", "MCP", "Connect a client"])(
    "keeps subsections once and stops at the next peer for %s",
    async (endpoint) => {
        const client = [
            "### Connect a client",
            "Use a Streamable HTTP client.",
            "#### Claude Code MCP",
            "```bash",
            "# MCP setup",
            "claude mcp add --transport http pollinations https://gen.pollinations.ai/mcp/pollinations",
            "```",
            "",
        ].join("\n");
        const chapter = [
            "## MCP Servers",
            "Hosted tools.",
            "### MCP quick start",
            "Run polli mcp install claude.",
            client,
            "### Permissions",
            "Provide a Pollinations key.",
            "",
        ].join("\n");
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue(
                    new Response(
                        `Preamble about MCP.\n## Earlier\nEarlier docs.\n${chapter}## Sandboxes\nUnrelated docs.\n`,
                    ),
                ),
        );
        const write = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);
        setOutputMode("json");

        await docsCommand.parseAsync([endpoint], { from: "user" });

        expect(JSON.parse(String(write.mock.calls[0][0])).content).toBe(
            endpoint === "Connect a client" ? `${client}\n` : chapter,
        );
    },
);

it.each([
    ["/image", "### Image (URL)\nimage example\n"],
    ["/text", "### Text (Python)\ntext example\n"],
    ["/audio", "### Audio (cURL)\naudio example\n"],
])("does not print the preamble for %s", async (endpoint, section) => {
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockResolvedValue(
                new Response(
                    [
                        "> Generate text, images, video, audio, and embeddings.",
                        "",
                        "**Base URL:** https://gen.pollinations.ai",
                        "",
                        "## Quick Start",
                        "",
                        "### Image (URL)\nimage example",
                        "### Text (Python)\ntext example",
                        "### Audio (cURL)\naudio example",
                        "",
                    ].join("\n"),
                ),
            ),
    );
    const write = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
    setOutputMode("json");

    await docsCommand.parseAsync([endpoint], { from: "user" });

    expect(JSON.parse(String(write.mock.calls[0][0])).content).toBe(section);
});
