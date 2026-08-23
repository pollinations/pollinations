import {
    type PromptAgentGitHubSource,
    type PromptAgentGitHubSourceInput,
    PromptAgentGitHubSourceInputSchema,
} from "@shared/community-endpoints.ts";
import { HTTPException } from "hono/http-exception";
import {
    type PromptAgentConfig,
    PromptAgentInputSchema,
} from "./prompt-agent.ts";

const GITHUB_API_BASE_URL = "https://api.github.com";
const MAX_MANIFEST_BYTES = 64 * 1024;
const GITHUB_REPOSITORY_OWNER =
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_REPOSITORY_NAME = /^[A-Za-z0-9._-]{1,100}$/;

type GitHubRepository = {
    private: boolean;
    default_branch: string;
    html_url: string;
    owner: { id: number };
};

function githubHeaders(accessToken: string, accept: string): HeadersInit {
    return {
        Accept: accept,
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "pollinations-enter",
        "X-GitHub-Api-Version": "2022-11-28",
    };
}

function githubFailure(response: Response, resource: string): never {
    if (response.status === 401) {
        throw new HTTPException(400, {
            message:
                "GitHub authorization expired. Sign out and reconnect GitHub, then try again.",
        });
    }
    if (response.status === 404) {
        throw new HTTPException(400, {
            message: `${resource} was not found or is not public`,
        });
    }
    if (
        response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0"
    ) {
        throw new HTTPException(503, {
            message: "GitHub rate limit reached. Try again later.",
        });
    }
    throw new HTTPException(502, {
        message: `GitHub could not load ${resource}`,
    });
}

export function parseGitHubRepositoryUrl(repositoryUrl: string): {
    owner: string;
    repository: string;
} {
    const parsed =
        PromptAgentGitHubSourceInputSchema.shape.repositoryUrl.parse(
            repositoryUrl,
        );
    const url = new URL(parsed);
    const segments = url.pathname.split("/").filter(Boolean);
    if (
        url.protocol !== "https:" ||
        url.hostname.toLowerCase() !== "github.com" ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        segments.length !== 2
    ) {
        throw new HTTPException(400, {
            message: "Repository URL must be https://github.com/owner/repo",
        });
    }
    const owner = segments[0] ?? "";
    const repository = (segments[1] ?? "").replace(/\.git$/i, "");
    if (
        !GITHUB_REPOSITORY_OWNER.test(owner) ||
        !GITHUB_REPOSITORY_NAME.test(repository)
    ) {
        throw new HTTPException(400, {
            message: "Repository URL has an invalid GitHub owner or name",
        });
    }
    return { owner, repository };
}

function manifestApiPath(manifestPath: string): string {
    const normalized = manifestPath.trim();
    const segments = normalized.split("/");
    if (
        normalized.startsWith("/") ||
        normalized.includes("\\") ||
        segments.some(
            (segment) =>
                !segment ||
                segment === "." ||
                segment === ".." ||
                segment === ".git",
        )
    ) {
        throw new HTTPException(400, {
            message: "Manifest path must be a relative file path",
        });
    }
    return segments.map(encodeURIComponent).join("/");
}

export async function importPromptAgentFromGitHub(
    rawSource: PromptAgentGitHubSourceInput,
    ownerGithubId: number,
    accessToken: string,
): Promise<{
    config: PromptAgentConfig;
    source: PromptAgentGitHubSource;
}> {
    const source = PromptAgentGitHubSourceInputSchema.parse(rawSource);
    const { owner, repository } = parseGitHubRepositoryUrl(
        source.repositoryUrl,
    );
    const repositoryApiUrl = `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
    const repositoryResponse = await fetch(repositoryApiUrl, {
        headers: githubHeaders(accessToken, "application/vnd.github+json"),
    });
    if (!repositoryResponse.ok) {
        githubFailure(repositoryResponse, "repository");
    }
    const repositoryData =
        (await repositoryResponse.json()) as GitHubRepository;
    if (repositoryData.private) {
        throw new HTTPException(400, {
            message: "Agent source repository must be public",
        });
    }
    if (repositoryData.owner.id !== ownerGithubId) {
        throw new HTTPException(403, {
            message:
                "Agent source repository must be owned by your linked GitHub account",
        });
    }

    const commitResponse = await fetch(
        `${repositoryApiUrl}/commits/${encodeURIComponent(repositoryData.default_branch)}`,
        {
            headers: githubHeaders(accessToken, "application/vnd.github.sha"),
        },
    );
    if (!commitResponse.ok) githubFailure(commitResponse, "default branch");
    const commitSha = (await commitResponse.text()).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(commitSha)) {
        throw new HTTPException(502, {
            message: "GitHub returned an invalid commit SHA",
        });
    }

    const manifestResponse = await fetch(
        `${repositoryApiUrl}/contents/${manifestApiPath(source.manifestPath)}?ref=${commitSha}`,
        {
            headers: githubHeaders(
                accessToken,
                "application/vnd.github.raw+json",
            ),
        },
    );
    if (!manifestResponse.ok) githubFailure(manifestResponse, "agent manifest");
    const declaredLength = Number(
        manifestResponse.headers.get("content-length") ?? "0",
    );
    if (declaredLength > MAX_MANIFEST_BYTES) {
        throw new HTTPException(400, {
            message: "Agent manifest must be 64 KB or smaller",
        });
    }
    const manifestText = await manifestResponse.text();
    if (
        new TextEncoder().encode(manifestText).byteLength > MAX_MANIFEST_BYTES
    ) {
        throw new HTTPException(400, {
            message: "Agent manifest must be 64 KB or smaller",
        });
    }

    let manifest: unknown;
    try {
        manifest = JSON.parse(manifestText);
    } catch {
        throw new HTTPException(400, {
            message: "Agent manifest must contain valid JSON",
        });
    }
    const config = PromptAgentInputSchema.safeParse(manifest);
    if (!config.success) {
        throw new HTTPException(400, {
            message: `Invalid agent manifest: ${config.error.issues[0]?.message ?? "invalid configuration"}`,
        });
    }
    return {
        config: config.data,
        source: {
            repositoryUrl: repositoryData.html_url,
            manifestPath: source.manifestPath,
            commitSha,
            syncedAt: new Date().toISOString(),
        },
    };
}
