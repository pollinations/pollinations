import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { expectExit, resetOutput, runCommand } from "./test-helpers.js";
import { create3dCommand } from "./three-d.js";

afterEach(resetOutput);

const mesh = (type: string, bytes = [1]) =>
    new Response(new Uint8Array(bytes), { headers: { "content-type": type } });

describe("gen 3d", () => {
    it("saves the mesh and names the file from the returned content type", async () => {
        await runCommand(
            create3dCommand(),
            ["a red fox"],
            () => mesh("model/gltf-binary", [0x67, 0x6c, 0x54, 0x46]),
            ({ out, calls }) => {
                expect(JSON.parse(out).path).toBe("model.glb");
                expect([...readFileSync("model.glb")]).toEqual([
                    0x67, 0x6c, 0x54, 0x46,
                ]);
                expect(calls[0].url).toContain("/3d/");
            },
        );
    });

    it("uses .ply for the asset-harvester model", async () => {
        await runCommand(
            create3dCommand(),
            ["a fox", "--model", "nvidia/asset-harvester"],
            () => mesh(""),
            ({ out }) => {
                expect(JSON.parse(out).path).toBe("model.ply");
            },
        );
    });

    it("passes reference image URLs and resolution", async () => {
        await runCommand(
            create3dCommand(),
            [
                "a fox",
                "--image",
                "https://example.com/a.png",
                "--resolution",
                "high",
            ],
            () => mesh("model/gltf-binary"),
            ({ calls }) => {
                expect(calls[0].url).toContain(
                    "image=https%3A%2F%2Fexample.com%2Fa.png",
                );
                expect(calls[0].url).toContain("resolution=high");
            },
        );
    });

    it("exits rather than sending a local path as --image", async () => {
        await expectExit(create3dCommand(), [
            "a fox",
            "--image",
            "./local.png",
        ]);
    });
});
