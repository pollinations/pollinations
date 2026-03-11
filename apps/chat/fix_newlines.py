import re

with open("src/utils/api.js", "r") as f:
    text = f.read()

# I am going to nuke the whole collectedFunctionCalls block and replace it correctly!
new_code = """
        if (collectedFunctionCalls.length > 0) {
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
                } else if (call.name === "generate_video") {
                    try {
                        const args = call.arguments;
                        const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(args.prompt);
                        finalContent += "\\n\\n__VIDEO__" + url + "__VIDEO__\\n\\n";
                    } catch (e) { console.error(e); }
                }
            }
        }
"""

start_str = "if (collectedFunctionCalls.length > 0) {"
end_str = "if (onComplete) onComplete(finalContent, \"\");"

idx1 = text.find(start_str)
idx2 = text.find(end_str)

if idx1 != -1 and idx2 != -1:
    text = text[:idx1] + new_code + "\n\n        " + text[idx2:]
    
    with open("src/utils/api.js", "w") as f:
        f.write(text)
    print("SUCCESS")
else:
    print("FAILED TO FIND")

