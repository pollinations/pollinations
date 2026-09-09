import { HTTPException } from "hono/http-exception";

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

    try {
      const { default: agent } = await import("./agent.mjs");
      if (typeof agent !== "function") {
        return jsonError("Code agent must export a default function");
      }
      const response = await agent({ request: safeRequest, pollinations });
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
