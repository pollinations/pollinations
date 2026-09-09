import { HTTPException } from "hono/http-exception";
import { z } from "zod";

type CodeAgentDeploymentEnv = {
    CLOUDFLARE_ACCOUNT_ID: string;
    CODE_AGENT_DEPLOY_API_TOKEN?: string;
    CODE_AGENT_DISPATCH_NAMESPACE?: string;
    GEN_BASE_URL: string;
};

const MAIN_MODULE = `
function jsonError(message, status = 500) {
  return Response.json({ error: { message } }, { status });
}

export default {
  async fetch(request, env) {
    const headers = new Headers(request.headers);
    headers.delete("authorization");
    headers.delete("cookie");
    const safeRequest = new Request(request, { headers });
    const baseUrl = new URL(env.POLLINATIONS_BASE_URL);
    const pollinations = (path, init = {}) => {
      const url = new URL(path, baseUrl);
      if (url.origin !== baseUrl.origin) {
        throw new Error("pollinations() only accepts Pollinations API URLs");
      }
      return fetch(url, init);
    };
    const mcp = async (server, tool, args = {}) => {
      if (typeof server !== "string" || typeof tool !== "string") {
        throw new Error("mcp() requires a server and tool name");
      }
      const response = await pollinations(\`/mcp/\${encodeURIComponent(server)}\`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: { name: tool, arguments: args },
        }),
      });
      if (!response.ok) {
        throw new Error(\`MCP tool call failed (\${response.status})\`);
      }
      const body = await response.json();
      if (body.error) {
        throw new Error(body.error.message || "MCP tool call failed");
      }
      return body.result;
    };

    try {
      const { default: agent } = await import("./agent.mjs");
      if (typeof agent !== "function") {
        return jsonError("Code agent must export a default function");
      }
      const response = await agent({ request: safeRequest, pollinations, mcp });
      return response instanceof Response
        ? response
        : jsonError("Code agent must return a Response");
    } catch {
      console.error("Code agent execution failed");
      return jsonError("Code agent execution failed");
    }
  },
};
`.trim();

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";
const MAX_SOURCE_BYTES = 65_536;
const GitHubCommitSchema = z.object({
    sha: z.string().regex(/^[0-9a-f]{40}$/),
});

function githubRepositoryParts(repository: string) {
    const [, owner, name] = new URL(repository).pathname.split("/");
    return { owner, name };
}

function githubHeaders() {
    return {
        Accept: "application/vnd.github+json",
        "User-Agent": "pollinations-enter",
        "X-GitHub-Api-Version": "2022-11-28",
    };
}

/** Resolve and load the fixed agent.js entrypoint from a public GitHub repo. */
export async function loadCodeAgentSource(
    repository: string,
    directory: string,
): Promise<{ source: string; deployedCommitSha: string }> {
    const { owner, name } = githubRepositoryParts(repository);
    const commitResponse = await fetch(
        `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/HEAD`,
        { headers: githubHeaders() },
    );
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

    const entrypoint = directory ? `${directory}/agent.js` : "agent.js";
    const sourceResponse = await fetch(
        `${GITHUB_RAW}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${commit.data.sha}/${entrypoint
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
    );
    if (sourceResponse.status === 404) {
        throw new HTTPException(400, {
            message: `${entrypoint} was not found in the repository`,
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
            message: "agent.js must be at most 64 KiB",
        });
    }
    const source = (await sourceResponse.text()).trim();
    if (!source) {
        throw new HTTPException(400, { message: "agent.js must not be empty" });
    }
    if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
        throw new HTTPException(400, {
            message: "agent.js must be at most 64 KiB",
        });
    }
    return { source, deployedCommitSha: commit.data.sha };
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
        "agent.mjs",
        new Blob([source], { type: "application/javascript+module" }),
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
