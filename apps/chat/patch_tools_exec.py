import re

with open('src/utils/api.js', 'r') as f:
    text = f.read()

exec_replacement = """        if (collectedFunctionCalls.length > 0) {
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
                    } catch (e) {
                        console.error("Failed to parse chart arguments:", e);
                    }
                } else if (call.name === "generate_image") {
                    try {
                        const args = call.arguments;
                        const seed = Math.floor(Math.random() * 2147483647);
                        const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(args.prompt) + "?seed=" + seed + "&nologo=true";
                        finalContent += "\\n\\n![" + (args.prompt.replace(/\\]/g, '')) + "](" + url + ")\\n\\n";
                    } catch (e) { console.error(e); }
                } else if (call.name === "search_web") {
                    try {
                        const args = call.arguments;
                        const qs = encodeURIComponent(args.query);
                        finalContent += "\\n\\n__SEARCH__" + qs + "__SEARCH__\\n\\n";
                    } catch (e) { console.error(e); }
                } else if (call.name === "preview_html_app") {
                    try {
                        const args = call.arguments;
                        const output = { title: args.title, html: args.html };
                        finalContent += "\\n\\n__HTML_PREVIEW__" + JSON.stringify(output) + "__HTML_PREVIEW__\\n\\n";
                    } catch (e) { console.error(e); }
                }
            }
        }"""

# Using regex to replace the old collectedFunctionCalls block
text = re.sub(r'if \(collectedFunctionCalls\.length > 0\) \{[\s\S]*?\}\s*\}\s*\}', exec_replacement, text)

with open('src/utils/api.js', 'w') as f:
    f.write(text)
