import { simulateSSEFunctionStream } from "../src/utils/api.js";

(async () => {
    const fullArgs = JSON.stringify({
        type: "bar",
        title: "Q1",
        data: {
            labels: ["Jan", "Feb"],
            datasets: [{ label: "Sales", data: [100, 150] }],
        },
    });
    const half = Math.floor(fullArgs.length / 2);
    const firstHalf = fullArgs.slice(0, half);
    const secondHalf = fullArgs.slice(half);
    const doubleEncodedFullArgs = JSON.stringify(fullArgs);
    const doubleEncodedHalf = doubleEncodedFullArgs.slice(0, half);
    const doubleEncodedHalf2 = doubleEncodedFullArgs.slice(half);

    const chunks = [
        // Simulate a short text chunk before invoking function
        JSON.stringify({
            choices: [
                { delta: { content: "Sure, I can create a chart for you.\n" } },
            ],
        }),
        // Single-chunk fully encoded function call
        JSON.stringify({
            choices: [
                {
                    delta: {
                        tool_calls: [
                            {
                                function: {
                                    name: "create_chart",
                                    arguments: fullArgs,
                                },
                            },
                        ],
                    },
                },
            ],
        }),
        // Chunked, split function call argument (raw JSON inside arguments), to simulate stream splitting
        JSON.stringify({
            choices: [
                {
                    delta: {
                        tool_calls: [
                            {
                                function: {
                                    name: "create_chart",
                                    arguments: firstHalf,
                                },
                            },
                        ],
                    },
                },
            ],
        }),
        JSON.stringify({
            choices: [
                {
                    delta: {
                        tool_calls: [{ function: { arguments: secondHalf } }],
                    },
                },
            ],
        }),
        // Chunked, split double-encoded string scenario
        JSON.stringify({
            choices: [
                {
                    delta: {
                        tool_calls: [
                            {
                                function: {
                                    name: "create_chart",
                                    arguments: doubleEncodedHalf,
                                },
                            },
                        ],
                    },
                },
            ],
        }),
        JSON.stringify({
            choices: [
                {
                    delta: {
                        tool_calls: [
                            { function: { arguments: doubleEncodedHalf2 } },
                        ],
                    },
                },
            ],
        }),
    ];
    const res = await simulateSSEFunctionStream(chunks);
    console.log("simulate result", JSON.stringify(res, null, 2));
})();
