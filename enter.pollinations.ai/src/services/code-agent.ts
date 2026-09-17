import { runtimeModule, sdkModules } from "virtual:code-agent-sdk";
import { HTTPException } from "hono/http-exception";
import { transform } from "sucrase";
import { z } from "zod";
import { type GitHubApiEnv, githubApiHeaders } from "./github-api.ts";

type CodeAgentDeploymentEnv = {
    CLOUDFLARE_ACCOUNT_ID: string;
    CODE_AGENT_DEPLOY_API_TOKEN?: string;
    CODE_AGENT_DISPATCH_NAMESPACE?: string;
    GEN_BASE_URL: string;
};

const MAIN_MODULE = `
import agent from "./agent.mjs";
import createCodeAgentWorker from "./runtime.mjs";
export default createCodeAgentWorker(agent);
`.trim();

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";
const MAX_SOURCE_BYTES = 65_536;
const GitHubCommitSchema = z.object({
    sha: z.string().regex(/^[0-9a-f]{40}$/),
});
const GitHubRepositorySchema = z.object({
    name: z.string().min(1),
    full_name: z.string().regex(/^[^/]+\/[^/]+$/),
    description: z.string().nullable(),
    private: z.boolean(),
});

function githubRepositoryParts(repository: string) {
    const [, owner, name] = new URL(repository).pathname.split("/");
    return { owner, name };
}

export async function resolveCodeAgentRepository(
    env: GitHubApiEnv,
    repository: string,
) {
    const { owner, name } = githubRepositoryParts(repository);
    const headers = await githubApiHeaders(env);
    const repositoryUrl = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const [response, commitResponse] = await Promise.all([
        fetch(repositoryUrl, { headers }),
        fetch(`${repositoryUrl}/commits/HEAD`, { headers }),
    ]);
    if (response.status === 404) {
        throw new HTTPException(400, {
            message: "Code agent repository must exist and be public",
        });
    }
    if (!response.ok) {
        throw new HTTPException(502, {
            message: `GitHub repository lookup failed (${response.status})`,
        });
    }
    const parsed = GitHubRepositorySchema.safeParse(await response.json());
    if (!parsed.success) {
        throw new HTTPException(502, {
            message: "GitHub returned invalid repository metadata",
        });
    }
    if (parsed.data.private) {
        throw new HTTPException(400, {
            message: "Code agent repository must exist and be public",
        });
    }
    if (commitResponse.status === 404 || commitResponse.status === 409) {
        throw new HTTPException(400, {
            message: "Code agent repository must exist and be public",
        });
    }
    if (!commitResponse.ok) {
        throw new HTTPException(502, {
            message: `GitHub repository lookup failed (${commitResponse.status})`,
        });
    }
    const commit = GitHubCommitSchema.safeParse(await commitResponse.json());
    if (!commit.success) {
        throw new HTTPException(502, {
            message: "GitHub returned an invalid repository revision",
        });
    }
    return {
        repository: `https://github.com/${parsed.data.full_name}`,
        name: parsed.data.name,
        description: parsed.data.description,
        deployedCommitSha: commit.data.sha,
    };
}

/** Load agent.ts from an already resolved, immutable GitHub revision. */
export async function loadCodeAgentSource(
    repository: string,
    commitSha: string,
): Promise<string> {
    const { owner, name } = githubRepositoryParts(repository);
    const sourceResponse = await fetch(
        `${GITHUB_RAW}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${commitSha}/agent.ts`,
    );
    if (sourceResponse.status === 404) {
        throw new HTTPException(400, {
            message: "agent.ts was not found at the repository root",
        });
    }
    if (!sourceResponse.ok) {
        throw new HTTPException(502, {
            message: `GitHub source download failed (${sourceResponse.status})`,
        });
    }
    const contentLength = Number(sourceResponse.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_BYTES) {
        throw new HTTPException(400, {
            message: "agent.ts must be at most 64 KiB",
        });
    }
    const source = (await sourceResponse.text()).trim();
    if (!source) {
        throw new HTTPException(400, { message: "agent.ts must not be empty" });
    }
    if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
        throw new HTTPException(400, {
            message: "agent.ts must be at most 64 KiB",
        });
    }
    return source;
}

function transpileCodeAgent(source: string) {
    try {
        return transform(source, {
            transforms: ["typescript"],
            disableESTransforms: true,
        }).code;
    } catch {
        throw new HTTPException(400, {
            message: "agent.ts contains invalid TypeScript",
        });
    }
}

function deploymentConfig(env: CodeAgentDeploymentEnv) {
    const token = env.CODE_AGENT_DEPLOY_API_TOKEN;
    const namespace = env.CODE_AGENT_DISPATCH_NAMESPACE;
    if (!token || !namespace) {
        throw new HTTPException(503, {
            message: "Code agent deployment is not configured",
        });
    }
    return { token, namespace };
}

function scriptUrl(env: CodeAgentDeploymentEnv, namespace: string, id: string) {
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts/${encodeURIComponent(id)}`;
}

async function requireCloudflareSuccess(response: Response) {
    if (response.ok) return;
    throw new HTTPException(502, {
        message: `Code agent deployment failed (${response.status})`,
    });
}

export async function deployCodeAgent(
    env: CodeAgentDeploymentEnv,
    id: string,
    source: string,
) {
    const { token, namespace } = deploymentConfig(env);
    const form = new FormData();
    form.set(
        "metadata",
        new Blob(
            [
                JSON.stringify({
                    main_module: "index.mjs",
                    compatibility_date: "2026-09-01",
                    bindings: [
                        {
                            type: "plain_text",
                            name: "POLLINATIONS_BASE_URL",
                            text: env.GEN_BASE_URL,
                        },
                    ],
                }),
            ],
            { type: "application/json" },
        ),
    );
    form.set(
        "index.mjs",
        new Blob([MAIN_MODULE], { type: "application/javascript+module" }),
        "index.mjs",
    );
    form.set(
        "runtime.mjs",
        new Blob([runtimeModule], { type: "application/javascript+module" }),
        "runtime.mjs",
    );
    for (const [name, source] of Object.entries(sdkModules)) {
        form.set(
            name,
            new Blob([source], { type: "application/javascript+module" }),
            name,
        );
    }
    form.set(
        "agent.mjs",
        new Blob([transpileCodeAgent(source)], {
            type: "application/javascript+module",
        }),
        "agent.mjs",
    );
    const response = await fetch(scriptUrl(env, namespace, id), {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    await requireCloudflareSuccess(response);
}

export async function deleteCodeAgent(env: CodeAgentDeploymentEnv, id: string) {
    const { token, namespace } = deploymentConfig(env);
    const response = await fetch(scriptUrl(env, namespace, id), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status !== 404) await requireCloudflareSuccess(response);
}
