import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
    CodeAgentInputSchema,
    PromptAgentInputSchema,
} from "@shared/community-endpoints.ts";
import { describe, expect, it } from "vitest";

// `polli agents create --config <file>` sends these files to the agents API,
// which rejects what these schemas reject. Listing fields may come from flags
// instead, so they are left to the API.
const apps = new URL("./", import.meta.url);
const files = readdirSync(apps)
    .filter((app) => app.startsWith("agent-"))
    .flatMap((app) => [`${app}/agent.json`, `${app}/code-agent.json`])
    .filter((file) => existsSync(new URL(file, apps)));

describe("agent config files", () => {
    it.each(files)("%s is accepted by the agents API", (file) => {
        const {
            type,
            name,
            title,
            description,
            visibility,
            requiredSafetyFeatures,
            ...config
        } = JSON.parse(readFileSync(new URL(file, apps), "utf8"));
        expect(type ?? "prompt_agent").toMatch(/^(code|prompt)_agent$/);
        const schema =
            type === "code_agent"
                ? CodeAgentInputSchema
                : PromptAgentInputSchema;
        expect(schema.safeParse(config).error?.issues ?? []).toEqual([]);
    });
});
