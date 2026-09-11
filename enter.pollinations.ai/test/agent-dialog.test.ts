import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, it, vi } from "vitest";
import { AgentDialog } from "../frontend/src/components/community-endpoints/agent-dialog.tsx";
import type { ManagedAgent } from "../frontend/src/components/community-endpoints/types.ts";

vi.hoisted(() => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    vi.stubEnv("MODE", "development");
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

it.each([
    "code_agent",
    "prompt_agent",
    undefined,
] as const)("offers a non-submit sync button only when editing a code agent (%s)", (type) => {
    const common = {
        id: "example-agent",
        name: "example",
        title: "Example",
        description: null,
        visibility: "private" as const,
        requiredSafetyFeatures: [],
        createdAt: "2026-09-11T00:00:00Z",
        updatedAt: "2026-09-11T00:00:00Z",
    };
    const agent: ManagedAgent | undefined =
        type === "code_agent"
            ? {
                  ...common,
                  type,
                  repository: "https://github.com/example/agent",
                  deployedCommitSha: "a".repeat(40),
              }
            : type === "prompt_agent"
              ? {
                    ...common,
                    type,
                    systemPrompt: "Hello",
                    baseModel: "openai",
                    mcpServers: [],
                }
              : undefined;
    const html = renderToStaticMarkup(
        createElement(AgentDialog, {
            agent,
            open: true,
            canPublish: false,
            onOpenChange: () => {},
            onSubmit: async () => {},
            onSync: async () => {},
        }),
    );
    const syncButton = html.match(
        /<button\b[^>]*>Sync from GitHub<\/button>/,
    )?.[0];
    if (type === "code_agent") {
        expect(syncButton).toContain('type="button"');
        expect(syncButton).not.toContain("disabled");
    } else {
        expect(syncButton).toBeUndefined();
    }
});
