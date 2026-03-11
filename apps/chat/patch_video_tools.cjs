const fs = require('fs');

let apiCode = fs.readFileSync('src/utils/api.js', 'utf8');

const videoToolStr = `,
        {
            type: "function",
            function: {
                name: "generate_video",
                description: "Generate and display a short video based on a prompt. Use this when the user explicitly asks for a video, animation, or moving picture.",
                parameters: {
                    type: "object",
                    properties: {
                        prompt: { type: "string", description: "A detailed description of the video to generate." }
                    },
                    required: ["prompt"]
                }
            }
        }`;

apiCode = apiCode.replace(/name: "search_web"[\s\S]*?\}\s*\}\s*\}\s*\];/, (match) => {
    return match.replace(/\];$/, videoToolStr + '\n    ];');
});

const videoExecStr = `} else if (call.name === "generate_video") {
                    try {
                        const args = call.arguments;
                        const seed = Math.floor(Math.random() * 2147483647);
                        const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(args.prompt) + "?seed=" + seed + "&nologo=true&model=veo";
                        finalContent += "\\n\\n__VIDEO__" + url + "__VIDEO__\\n\\n";
                    } catch (e) { console.error(e); }
                }`;

apiCode = apiCode.replace(/} else if \(call\.name === "search_web"\) \{[\s\S]*?\}\s*\}\s*\}\s*\}\s*/, (match) => {
    return match.replace(/}\s*}$/, '} ' + videoExecStr + '\n            }\n        }');
});

fs.writeFileSync('src/utils/api.js', apiCode);
console.log("Patched api.js with video tool!");
