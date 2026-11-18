import { z } from "zod";

const API_ROOT = "https://api.securityscorecards.dev/projects";
const REASON_LIMIT = 200;

function formatCheck(check) {
    return {
        name: check.name ?? null,
        score: typeof check.score === "number" ? check.score : null,
        reason:
            typeof check.reason === "string" && check.reason
                ? check.reason.slice(0, REASON_LIMIT)
                : null,
    };
}

export const scorecardTools = [
    [
        "scorecard",
        "Get the OpenSSF Scorecard security posture of a GitHub repository: aggregate score (0-10) plus per-check scores for code review, branch protection, dependency pinning, fuzzing, SAST and more. A check score of -1 means the check was inconclusive. This rates a project's security practices, not its known vulnerabilities — for those, use the OSV vulnerability lookup in packages-mcp.",
        {
            repo: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "GitHub repository as owner/name, e.g. 'kubernetes/kubernetes'",
                ),
        },
        async ({ repo }, fetchJson) => {
            const normalized = repo
                .trim()
                .replace(/^https?:\/\/github\.com\//i, "")
                .replace(/\/$/, "");
            if (!/^[\w.-]+\/[\w.-]+$/.test(normalized))
                throw new Error(
                    "Use a GitHub repository as owner/name, e.g. 'kubernetes/kubernetes'.",
                );
            const [owner, name] = normalized.split("/");
            let data;
            try {
                data = await fetchJson(
                    `${API_ROOT}/github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
                );
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.includes("HTTP 404")
                )
                    throw new Error(
                        `No Scorecard entry for ${normalized} — the project is not in the OpenSSF Scorecard database.`,
                    );
                throw error;
            }
            if (
                !data ||
                typeof data.score !== "number" ||
                !Array.isArray(data.checks)
            )
                throw new Error(
                    `Unexpected Scorecard response for ${normalized}.`,
                );
            return {
                repo: data.repo?.name ?? `github.com/${normalized}`,
                date: data.date ?? null,
                commit: data.repo?.commit ?? null,
                score: data.score,
                checks: data.checks.map(formatCheck),
            };
        },
    ],
];
