import re

with open('src/utils/api.js', 'r') as f:
    text = f.read()

# 1. Expand the tools array
# We find:
#         {
#             type: "function",
#             function: {
#                 name: "create_chart",
# ...

tools_injection = """,
        {
            type: "function",
            function: {
                name: "generate_image",
                description: "Generate and display an image based on a prompt. Use this when the user explicitly asks for an image, photo, or visual representation.",
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
                description: "Search the web for real-time information or specific queries.",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The search query to look up." }
                    },
                    required: ["query"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "generate_video",
                description: "Generate and display a short video/animation based on a prompt.",
                parameters: {
                    type: "object",
                    properties: {
                        prompt: { type: "string", description: "A detailed description of the video to generate." }
                    },
                    required: ["prompt"]
                }
            }
        }
"""

text = re.sub(r'required: \["title", "data", "series", "xKey"\],\s*\},?\s*\},?\s*\},?', 
              r'required: ["title", "data", "series", "xKey"],\n                },\n            },\n        }' + tools_injection, 
              text)

# 2. Extract tools inside `collectedFunctionCalls`
# replace the loop that matches `if (call.name === "create_chart") {` block.

exec_injection = """
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
                        finalContent += "\\n\\n__SEARCH__" + qs + "__SEARCH__\\n\\n";
                    } catch (e) { console.error(e); }
                } else if (call.name === "generate_video") {
                    try {
                        const args = call.arguments;
                        const seed = Math.floor(Math.random() * 2147483647);
                        const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(args.prompt) + "?seed=" + seed + "&nologo=true&model=veo";
                        finalContent += "\\n\\n__VIDEO__" + url + "__VIDEO__\\n\\n";
                    } catch (e) { console.error(e); }
                }
"""

text = re.sub(
    r'if \(call\.name === "create_chart"\) \{[\s\S]*? \}\n            \}',
    exec_injection + '\n            }',
    text
)

with open('src/utils/api.js', 'w') as f:
    f.write(text)

