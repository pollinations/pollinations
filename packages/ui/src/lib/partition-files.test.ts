import { describe, expect, it } from "vitest";
import { partitionFiles } from "./partition-files.ts";

const png = (name: string, bytes = 4) =>
    new File(["x".repeat(bytes)], name, { type: "image/png" });

describe("partitionFiles", () => {
    it("accepts matching files within all limits", () => {
        const a = png("a.png");
        const b = png("b.png");
        const result = partitionFiles([a, b], [], {
            maxFiles: 4,
            maxSizeBytes: 1000,
            accept: "image/*",
        });
        expect(result.accepted).toEqual([a, b]);
        expect(result.rejected).toEqual([]);
    });

    it("rejects files whose type does not match accept", () => {
        const txt = new File(["x"], "note.txt", { type: "text/plain" });
        const result = partitionFiles([txt], [], {
            maxFiles: 4,
            maxSizeBytes: 1000,
            accept: "image/*",
        });
        expect(result.accepted).toEqual([]);
        expect(result.rejected).toEqual([{ file: txt, reason: "type" }]);
    });

    it("matches accept by file extension and exact mime", () => {
        const webp = new File(["x"], "pic.WEBP", { type: "" });
        const jpeg = png("p.jpg");
        const result = partitionFiles([webp, jpeg], [], {
            maxFiles: 4,
            maxSizeBytes: 1000,
            accept: ".webp,image/png",
        });
        expect(result.accepted).toEqual([webp, jpeg]);
    });

    it("rejects oversized files", () => {
        const big = png("big.png", 200);
        const result = partitionFiles([big], [], {
            maxFiles: 4,
            maxSizeBytes: 100,
            accept: "image/*",
        });
        expect(result.rejected).toEqual([{ file: big, reason: "size" }]);
    });

    it("rejects files past the remaining count, accounting for current selection", () => {
        const a = png("a.png");
        const b = png("b.png");
        const c = png("c.png");
        const result = partitionFiles([a, b, c], [png("existing.png")], {
            maxFiles: 2,
            maxSizeBytes: 1000,
            accept: "image/*",
        });
        expect(result.accepted).toEqual([a]);
        expect(result.rejected).toEqual([
            { file: b, reason: "count" },
            { file: c, reason: "count" },
        ]);
    });

    it("accepts everything when accept is omitted", () => {
        const txt = new File(["x"], "note.txt", { type: "text/plain" });
        const result = partitionFiles([txt], [], {
            maxFiles: 4,
            maxSizeBytes: 1000,
        });
        expect(result.accepted).toEqual([txt]);
    });
});
