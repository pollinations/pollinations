export type RejectReason = "type" | "size" | "count";

export type RejectedFile = { file: File; reason: RejectReason };

export type PartitionOptions = {
    maxFiles: number;
    maxSizeBytes: number;
    /** Comma-separated list: mime ("image/png"), wildcard ("image/*"), or extension (".webp"). */
    accept?: string;
};

export type PartitionResult = {
    accepted: File[];
    rejected: RejectedFile[];
};

function matchesAccept(file: File, accept: string | undefined): boolean {
    if (!accept) return true;
    const tokens = accept
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    if (tokens.length === 0) return true;
    return tokens.some((token) => {
        if (token.startsWith(".")) {
            return file.name.toLowerCase().endsWith(token.toLowerCase());
        }
        if (token.endsWith("/*")) {
            const prefix = token.slice(0, token.length - 1); // "image/"
            return file.type.startsWith(prefix);
        }
        return file.type === token;
    });
}

/**
 * Partition `incoming` files against the already-selected `current` files.
 * Deterministic: order preserved; every rejection carries a reason.
 * The count limit counts `current.length` against `maxFiles`.
 */
export function partitionFiles(
    incoming: File[],
    current: File[],
    { maxFiles, maxSizeBytes, accept }: PartitionOptions,
): PartitionResult {
    const accepted: File[] = [];
    const rejected: RejectedFile[] = [];
    let slots = Math.max(0, maxFiles - current.length);

    for (const file of incoming) {
        if (!matchesAccept(file, accept)) {
            rejected.push({ file, reason: "type" });
        } else if (file.size > maxSizeBytes) {
            rejected.push({ file, reason: "size" });
        } else if (slots <= 0) {
            rejected.push({ file, reason: "count" });
        } else {
            accepted.push(file);
            slots -= 1;
        }
    }

    return { accepted, rejected };
}
