import { describe, expect, it } from "vitest";
import { partitionFiles } from "./partition-files.ts";

const file = (name: string, type: string, size: number): File =>
    new File([new Uint8Array(size)], name, { type });

describe("partitionFiles", () => {
    it("accepts files within count and size", () => {
        const r = partitionFiles([file("a.png", "image/png", 10)], [], {
            maxFiles: 2,
            maxSizeBytes: 100,
        });
        expect(r.accepted).toHaveLength(1);
        expect(r.rejected).toHaveLength(0);
    });

    it("rejects by type, then size, then count — order preserved, each with a reason", () => {
        const r = partitionFiles(
            [
                file("a.txt", "text/plain", 10),
                file("b.png", "image/png", 999),
                file("c.png", "image/png", 10),
                file("d.png", "image/png", 10),
            ],
            [],
            { maxFiles: 1, maxSizeBytes: 100, accept: "image/*" },
        );
        expect(r.accepted.map((f) => f.name)).toEqual(["c.png"]);
        expect(r.rejected.map((x) => x.reason)).toEqual([
            "type",
            "size",
            "count",
        ]);
    });

    it("counts the current selection against maxFiles", () => {
        const r = partitionFiles(
            [file("b.png", "image/png", 10)],
            [file("a.png", "image/png", 10)],
            { maxFiles: 1, maxSizeBytes: 100 },
        );
        expect(r.accepted).toHaveLength(0);
        expect(r.rejected[0]?.reason).toBe("count");
    });

    it("matches extension and exact-mime accept tokens", () => {
        const r = partitionFiles(
            [
                file("a.webp", "", 10),
                file("b.png", "image/png", 10),
                file("c.gif", "image/gif", 10),
            ],
            [],
            { maxFiles: 9, maxSizeBytes: 100, accept: ".webp, image/png" },
        );
        expect(r.accepted.map((f) => f.name)).toEqual(["a.webp", "b.png"]);
        expect(r.rejected[0]).toMatchObject({ reason: "type" });
    });
});
