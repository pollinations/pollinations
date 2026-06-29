import type { Model3dSubmission } from "./asyncJob.ts";

const JOB_KEY_PREFIX = "3d-job:";
// Generous vs. the ~5 minute worst case (inferenceport's cheap-hardware
// models) so a slow-to-poll client doesn't lose its job mid-generation.
const JOB_TTL_SECONDS = 60 * 60;

export interface Model3dJobRecord {
    submission: Model3dSubmission;
    model: string;
    resolvedModel: string;
    format: string;
    createdAt: number;
    status: "pending" | "completing" | "completed" | "failed";
    contentType?: string;
    r2Key?: string;
    error?: string;
}

export async function putModel3dJob(
    kv: KVNamespace,
    jobId: string,
    record: Model3dJobRecord,
): Promise<void> {
    await kv.put(JOB_KEY_PREFIX + jobId, JSON.stringify(record), {
        expirationTtl: JOB_TTL_SECONDS,
    });
}

export async function getModel3dJob(
    kv: KVNamespace,
    jobId: string,
): Promise<Model3dJobRecord | null> {
    const raw = await kv.get(JOB_KEY_PREFIX + jobId);
    return raw ? (JSON.parse(raw) as Model3dJobRecord) : null;
}
