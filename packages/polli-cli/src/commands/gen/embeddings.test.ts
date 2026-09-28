import { afterEach, describe, expect, it } from "vitest";
import { createEmbeddingsCommand } from "./embeddings.js";
import { expectExit, resetOutput, runCommand } from "./test-helpers.js";

afterEach(resetOutput);

const vectors = (data: { index: number; embedding: number[] }[]) =>
    new Response(JSON.stringify({ data, usage: { total_tokens: 4 } }));

describe("gen embeddings", () => {
    it("prints one JSON array per input, one per line", async () => {
        await runCommand(
            createEmbeddingsCommand(),
            ["first text", "second text"],
            () =>
                vectors([
                    { index: 1, embedding: [3, 4] },
                    { index: 0, embedding: [1, 2] },
                ]),
            ({ out, calls }) => {
                // Sorted by index, so output order matches input order.
                expect(out.trim().split("\n")).toEqual(["[1,2]", "[3,4]"]);
                expect(calls[0].url).toContain("/v1/embeddings");
                expect(JSON.parse(String(calls[0].init.body))).toEqual({
                    input: ["first text", "second text"],
                });
            },
            "human",
        );
    });

    it("passes the model, dimensions and retrieval hints through", async () => {
        await runCommand(
            createEmbeddingsCommand(),
            [
                "q",
                "--model",
                "m",
                "--dimensions",
                "256",
                "--task-type",
                "RETRIEVAL_QUERY",
                "--input-type",
                "search_query",
            ],
            () => vectors([{ index: 0, embedding: [1] }]),
            ({ calls }) => {
                expect(JSON.parse(String(calls[0].init.body))).toEqual({
                    input: ["q"],
                    model: "m",
                    dimensions: 256,
                    task_type: "RETRIEVAL_QUERY",
                    input_type: "search_query",
                });
            },
        );
    });

    it("--json prints the whole response including usage", async () => {
        await runCommand(
            createEmbeddingsCommand(),
            ["a"],
            () => vectors([{ index: 0, embedding: [1] }]),
            ({ out }) => {
                expect(JSON.parse(out).usage).toEqual({ total_tokens: 4 });
            },
        );
    });

    it("exits with an error when nothing is given", async () => {
        await expectExit(createEmbeddingsCommand(), []);
    });
});
