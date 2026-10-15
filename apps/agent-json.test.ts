import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
    CodeAgentInputSchema,
    PromptAgentInputSchema,
} from "@shared/community-endpoints.ts";
import { describe, expect, it } from "vitest";

// `polli agents create --config <file>` sends these files to the agents API,
// which rejects unknown keys. The listing fields each agent type accepts may
// come from flags instead, so only their presence is allowed here.
const apps = new URL("./", import.meta.url);
const files = readdirSync(apps)
    .filter((app) => app.startsWith("agent-"))
    .flatMap((app) => [`${app}/agent.json`, `${app}/code-agent.json`])
    .filter((file) => existsSync(new URL(file, apps)));

describe("agent config files", () => {
    it.each(files)("%s is accepted by the agents API", (file) => {
        const {
            type,
            description,
            visibility,
            requiredSafetyFeatures,
            ...config
        } = JSON.parse(readFileSync(new URL(file, apps), "utf8"));
        expect([undefined, "prompt_agent", "code_agent"]).toContain(type);
        if (type === "code_agent") {
            // Code agents take their name and title from the repository.
            const result = CodeAgentInputSchema.strict().safeParse(config);
            expect(result.error?.issues ?? []).toEqual([]);
            return;
        }
        const { name, title, ...prompt } = config;
        const result = PromptAgentInputSchema.strict().safeParse(prompt);
        expect(result.error?.issues ?? []).toEqual([]);
    });
});
