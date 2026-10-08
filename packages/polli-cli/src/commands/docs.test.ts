import chalk from "chalk";
import { afterEach, expect, it, vi } from "vitest";
import { setOutputMode } from "../lib/output.js";
import { docsCommand } from "./docs.js";

const originalLevel = chalk.level;
const originalTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    chalk.level = originalLevel;
    setOutputMode("human");
    if (originalTTY)
        Object.defineProperty(process.stdout, "isTTY", originalTTY);
    else delete (process.stdout as unknown as Record<string, unknown>).isTTY;
});

it.each([
    "/v1/chat/completions",
    "/v1/models",
    "models",
])("finds %s in section bodies without splitting fenced examples", async (endpoint) => {
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
});

it("prints raw Markdown without styling when documentation is piped", async () => {
    const markdown = "## Chat\nUse `model` to select a model.\n";
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(markdown)),
    );
    Object.defineProperty(process.stdout, "isTTY", {
        configurable: true,
        value: false,
    });
    chalk.level = 0;
    setOutputMode("human");
    const write = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
    await docsCommand.parseAsync([], { from: "user" });
    expect(write.mock.calls.map(([value]) => String(value)).join("")).toBe(
        `${markdown}\n`,
    );
});
