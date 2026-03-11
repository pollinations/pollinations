const fs = require('fs');

// Patch tools inside api.js
let apiCode = fs.readFileSync('src/utils/api.js', 'utf8');

const toolsBlock = `const tools = [
        {
            type: "function",
            function: {
                name: "create_chart",
                description: "Create a chart or graph visualization from data points.",
                parameters: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "Title displayed above the chart." },
                        data: { type: "array", items: { type: "object" }, description: "Data points where each object represents a row with keys for x/y values." },
                        series: { type: "array", items: { type: "object", properties: { key: { type: "string" }, name: { type: "string" }, color: { type: "string" } }, required: ["key", "name"] }, description: "Series definitions for the chart." },
                        xKey: { type: "string", description: "The key in data objects to use for x-axis values." },
                        xLabel: { type: "string" },
                        yLabel: { type: "string" },
                    },
                    required: ["title", "data", "series", "xKey"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "generate_image",
                description: "Generate and display a high-quality image based on a prompt. Use this when the user explicitly asks for an image, photo, or visual representation.",
                parameters: {
                    type: "object",
                    properties: {
                        prompt: { type: "string", description: "A highly detailed description of the image to generate." },
                        width: { type: "number", description: "Image width (e.g. 1024 or 1920)", default: 1024 },
                        height: { type: "number", description: "Image height (e.g. 1024 or 1080)", default: 1024 }
                    },
                    required: ["prompt"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "search_web",
                description: "Search the web to redirect the user to a search result via an embedded iframe. Use this when the user asks for real-time information or search results.",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The search query to look up." }
                    },
                    required: ["query"]
                }
            }
        }
    ];`;

apiCode = apiCode.replace(/const tools = \[\s*\{\s*type: "function",\s*function: \{\s*name: "create_chart"[\s\S]*?\];/m, toolsBlock);

// Update tool execution handling in api.js
const toolExeBlock = `if (collectedFunctionCalls.length > 0) {
            for (const call of collectedFunctionCalls) {
                if (call.name === "create_chart") {
                    try {
                        const args = call.arguments;
                        const chartData = {
                            type: "chart",
                            output: {
                                title: args.title,
                                data: args.data,
                                series: args.series,
                                xKey: args.xKey,
                                xLabel: args.xLabel || "X Axis",
                                yLabel: args.yLabel || "Y Axis",
                            },
                        };
                        finalContent += "\\n\\n__CHART__" + JSON.stringify(chartData) + "__CHART__";
                    } catch (e) { console.error(e); }
                } else if (call.name === "generate_image") {
                    try {
                        const args = call.arguments;
                        const w = args.width || 1024;
                        const h = args.height || 1024;
                        const seed = Math.floor(Math.random() * 2147483647);
                        const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(args.prompt) + "?width=" + w + "&height=" + h + "&seed=" + seed + "&nologo=true";
                        finalContent += "\\n\\n![" + (args.prompt.replace(/\\]/g, '')) + "](" + url + ")\\n\\n";
                    } catch (e) { console.error(e); }
                } else if (call.name === "search_web") {
                    try {
                        const args = call.arguments;
                        const qs = encodeURIComponent(args.query);
                         // Output a custom embedded search iframe or link
                        finalContent += "\\n\\n__SEARCH__" + qs + "__SEARCH__\\n\\n";
                    } catch (e) {}
                }
            }
        }`;

apiCode = apiCode.replace(/if \(collectedFunctionCalls\.length > 0\) \{[\s\S]*?\}\s*\}\s*\}\s*\}\s*/m, toolExeBlock + '\n        ');

fs.writeFileSync('src/utils/api.js', apiCode);

console.log("Patched api.js!");
