import re

with open('src/utils/api.js', 'r') as f:
    text = f.read()

tools_replacement = """    const tools = [
        {
            type: "function",
            function: {
                name: "create_chart",
                description: "Create a chart or graph visualization from data points.",
                parameters: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "Title displayed above the chart." },
                        data: { type: "array", items: { type: "object" } },
                        series: { type: "array", items: { type: "object", properties: { key: { type: "string" }, name: { type: "string" }, color: { type: "string" } }, required: ["key", "name"] } },
                        xKey: { type: "string" },
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
                name: "preview_html_app",
                description: "Create an interactive HTML/JS/CSS app or component that runs in a sandboxed preview iframe.",
                parameters: {
                    type: "object",
                    properties: {
                        html: { type: "string", description: "The complete HTML code including inline <style> and <script> tags for the app." },
                        title: { type: "string", description: "A short title for the preview window." }
                    },
                    required: ["html", "title"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "generate_image",
                description: "Generate and display a high-quality image based on a prompt. Use this when the user asks for a picture or drawing.",
                parameters: {
                    type: "object",
                    properties: {
                        prompt: { type: "string", description: "A detailed visual description for the image to generate." }
                    },
                    required: ["prompt"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "search_web",
                description: "Provide the user with a web search link for looking up real-time information.",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The search query." }
                    },
                    required: ["query"]
                }
            }
        }
    ];"""

text = re.sub(r'const tools = \[\s*\{\s*type: "function",\s*function: \{\s*name: "create_chart"[\s\S]*?\];', tools_replacement, text)

with open('src/utils/api.js', 'w') as f:
    f.write(text)
