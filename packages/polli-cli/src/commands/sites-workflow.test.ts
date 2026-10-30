import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflow = parse(
    readFileSync(
        new URL(
            "../../../../.github/workflows/deploy-pollinations-site.yml",
            import.meta.url,
        ),
        "utf8",
    ),
);

describe("Sites deployment workflow", () => {
    it.each([
        ["refs/heads/production", "push", 0],
        ["refs/heads/production", "workflow_dispatch", 0],
        ["refs/heads/main", "workflow_dispatch", 1],
        ["refs/heads/feature", "push", 1],
        ["refs/pull/1/merge", "pull_request", 1],
        ["refs/heads/production", "pull_request_target", 1],
    ])("checks branch/event before building: %s, %s", (ref, event, status) => {
        const result = spawnSync("bash", ["-e"], {
            input: workflow.jobs.build.steps[0].run,
            env: { ...process.env, DEPLOY_REF: ref, DEPLOY_EVENT: event },
            encoding: "utf8",
        });
        expect(result.status).toBe(status);
        if (status)
            expect(result.stderr).toContain(
                "require a push or manual run from production",
            );
    });

    it("keeps app code and its environment out of the publishing job", () => {
        const { build, publish } = workflow.jobs;
        expect(build.environment).toBeUndefined();
        expect(JSON.stringify(build)).not.toContain("secrets.");
        expect(publish.needs).toBe("build");
        expect(publish.environment).toBe("production");
        expect(
            publish.steps.some((step: { uses?: string }) =>
                step.uses?.startsWith("actions/checkout@"),
            ),
        ).toBe(false);
        const upload = build.steps.find((step: { uses?: string }) =>
            step.uses?.startsWith("actions/upload-artifact@"),
        );
        const download = publish.steps.find((step: { uses?: string }) =>
            step.uses?.startsWith("actions/download-artifact@"),
        );
        expect(download.with.name).toBe(upload.with.name);
        expect(download.with.path).toBe(
            `\${{ runner.temp }}/pollinations-site`,
        );
        const scripts = publish.steps.filter(
            (step: { run?: string }) => step.run,
        );
        expect(scripts).toHaveLength(2);
        expect(scripts[0].run).toMatch(
            /^npm install --global --ignore-scripts /,
        );
        expect(scripts[0].env).toBeUndefined();
        expect(scripts[1].run).toBe(
            'polli sites deploy "$RUNNER_TEMP/pollinations-site" --name "$SITE_NAME" --verify',
        );
        expect(scripts[1].env.POLLINATIONS_API_KEY).toBe(
            `\${{ secrets.POLLINATIONS_API_KEY }}`,
        );
    });
});
