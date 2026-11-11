import { UpstreamError } from "@shared/error.ts";
import { getImageEnv } from "../env.ts";
import { sleep } from "../util.ts";
import { fetchUpstream } from "./fetchUpstream.ts";

type AlibabaResult = {
    output?: {
        task_id?: string;
        task_status?: string;
        code?: string;
        message?: string;
        video_url?: string;
        choices?: { message?: { content?: { image?: string }[] } }[];
    };
    usage?: {
        duration?: number;
        input_video_duration?: number;
        output_video_duration?: number;
        image_count?: number;
        input_image_count?: number;
        output_image_count?: number;
    };
};

/** Submit once; keep polling the same job inside the durable generation. */
export async function callAlibabaMedia(
    path: string,
    body: Record<string, unknown>,
    asynchronous: boolean,
): Promise<AlibabaResult> {
    const key = getImageEnv("DASHSCOPE_API_KEY");
    if (!key) {
        throw UpstreamError.fromProvider(503, {
            message: "Alibaba media generation is not configured",
        });
    }
    const base = "https://dashscope-intl.aliyuncs.com/api/v1";
    const headers = { Authorization: `Bearer ${key}` };
    async function read(response: Response): Promise<AlibabaResult> {
        try {
            return await response.json();
        } catch {
            throw UpstreamError.fromProvider(502, {
                message: "Alibaba returned invalid JSON",
            });
        }
    }
    let result = await read(
        await fetchUpstream(`${base}${path}`, {
            method: "POST",
            headers: {
                ...headers,
                "Content-Type": "application/json",
                ...(asynchronous ? { "X-DashScope-Async": "enable" } : {}),
            },
            body: JSON.stringify(body),
            errorLabel: "Alibaba media submission failed",
        }),
    );
    if (!asynchronous) return result;
    const id = result.output?.task_id;
    if (!id) {
        throw UpstreamError.fromProvider(502, {
            message: "Alibaba returned no task ID",
        });
    }
    while (result.output?.task_status !== "SUCCEEDED") {
        const output = result.output;
        if (
            output?.task_status !== "PENDING" &&
            output?.task_status !== "RUNNING"
        ) {
            const code = output?.code ?? "";
            const contentError = /DataInspection|ContentInspection/.test(code);
            const invalidInput =
                /InvalidParameter|InvalidURL|InvalidImage|InvalidVideo|InvalidAudio/.test(
                    code,
                );
            throw UpstreamError.fromProvider(
                contentError ? 422 : invalidInput ? 400 : 502,
                {
                    ...(contentError
                        ? { errorCode: "content_policy_violation" }
                        : {}),
                    message:
                        output?.message || "Alibaba media generation failed",
                    responseBody: JSON.stringify(output),
                },
            );
        }
        await sleep(2_000);
        result = await read(
            await fetchUpstream(`${base}/tasks/${encodeURIComponent(id)}`, {
                headers,
                errorLabel: "Alibaba media status check failed",
            }),
        );
    }
    return result;
}

export function requireAlibabaUsage(
    value: number | undefined,
    label: string,
    allowZero = false,
): number {
    if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        (allowZero ? value < 0 : value <= 0)
    ) {
        throw UpstreamError.fromProvider(502, {
            message: `Alibaba returned invalid ${label} usage`,
        });
    }
    return value;
}
