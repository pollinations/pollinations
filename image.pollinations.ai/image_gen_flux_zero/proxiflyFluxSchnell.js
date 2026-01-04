import { exec } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import sleep from "await-sleep";
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from "node-fetch";
import tempfile from "tempfile";

const execAsync = promisify(exec);

function getRandomProxyAgent() {
    const proxyFilePath = path.join("webshare_100_proxies.txt");
    const proxyList = fs
        .readFileSync(proxyFilePath, "utf-8")
        .split("\n")
        .filter(Boolean);

    const proxies = proxyList.map((proxy) => {
        const [ip, port, username, password] = proxy.split(":");
        return { ip, port, username, password };
    });

    const randomIndex = Math.floor(Math.random() * proxies.length);
    const selectedProxy = proxies[randomIndex];
    const proxyUrl = `http://${selectedProxy.username}:${selectedProxy.password}@${selectedProxy.ip}:${selectedProxy.port}`;
    console.log(`Using proxy: ${proxyUrl}`);
    return new HttpsProxyAgent(proxyUrl);
}

async function convertWebPToJPG(webpBuffer) {
    const webpFilePath = tempfile({ extension: "webp" });
    const jpgFilePath = tempfile({ extension: "jpg" });
    fs.writeFileSync(webpFilePath, webpBuffer);

    await execAsync(`ffmpeg -i ${webpFilePath} ${jpgFilePath}`);

    const jpgBuffer = fs.readFileSync(jpgFilePath);
    fs.unlinkSync(webpFilePath);
    fs.unlinkSync(jpgFilePath);

    return jpgBuffer;
}

async function generateImage(
    prompt,
    seed,
    randomizeSeed,
    width = 768,
    height = 768,
    numInferenceSteps = 2,
    endpoint,
) {
    const agent = getRandomProxyAgent();
    console.log(
        "prompt",
        prompt,
        seed,
        randomizeSeed,
        width,
        height,
        numInferenceSteps,
    );
    console.log(`Using endpoint: ${endpoint}`);

    // Ensure width and height are integers and greater than 32, else use defaults
    width = Number.isInteger(width) && width > 32 ? width : 768;
    height = Number.isInteger(height) && height > 32 ? height : 768;

    // Ensure width and height are multiples of 8
    width = Math.floor(width / 8) * 8;
    height = Math.floor(height / 8) * 8;

    try {
        console.log("Sending initial request to generate image");
        const initialResponse = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                data: [
                    prompt,
                    seed,
                    randomizeSeed,
                    width,
                    height,
                    numInferenceSteps,
                ],
            }),
            agent,
        });
        console.log("Initial request sent");
        const initialText = await initialResponse.text();
        console.log("responseText", initialText);
        let responseJson;
        try {
            responseJson = JSON.parse(initialText);
        } catch (error) {
            console.error("Error parsing JSON:", error);
            throw new Error("Error parsing JSON:", initialText);
        }
        console.log("Initial response received:", responseJson);
        const eventId = responseJson.event_id;
        console.log("eventId", eventId);

        while (true) {
            console.log("Checking for eventId", eventId);
            const finalResponse = await fetch(`${endpoint}/${eventId}`, {
                agent,
            });
            console.log("Final request sent for eventId:", eventId);
            const finalText = await finalResponse.text();
            console.log("Final response received:", finalText);

            const events = finalText.split("\n\n").filter(Boolean);
            for (const eventText of events) {
                if (eventText.startsWith("event:")) {
                    const [event, data] = eventText.split("\ndata: ");
                    const eventType = event.split(": ")[1];
                    console.log("eventType", eventType);
                    if (eventType === "error") {
                        console.error("Error event received:", data);
                        throw new Error("Error event received:", data);
                    } else if (eventType === "complete") {
                        const finalData = JSON.parse(data);
                        console.log("Final URL:", finalData[0].url);

                        // Fetch the final URL with the same proxy and convert the image to JPG
                        console.log("Fetching final image from URL");
                        const finalUrlResponse = await fetch(finalData[0].url, {
                            agent,
                        });
                        const webpBuffer = await finalUrlResponse.buffer();
                        const jpgBuffer = await convertWebPToJPG(webpBuffer);
                        const base64Image = jpgBuffer.toString("base64");
                        console.log("Returning base64 image");
                        return { image: base64Image };
                    }
                }
            }

            await sleep(500);
        }
    } catch (error) {
        console.error("Error:", error);
        throw error;
    }
}
async function generateImageRetry(
    prompt,
    seed,
    randomizeSeed,
    width,
    height,
    numInferenceSteps,
    _agent,
) {
    let attempt = 0;
    const endpoints = [
        "https://black-forest-labs-flux-1-schnell.hf.space/call/infer",
        // 'https://voodoohop-flux-1-schnell.hf.space/call/infer',
        "https://voodoohop-flux-1-schnell.hf.space/call/infer",
    ];
    while (attempt < 3) {
        try {
            const endpoint = attempt < 2 ? endpoints[0] : endpoints[1];
            console.log(`Attempting to use endpoint: ${endpoint}`);
            return await generateImage(
                prompt,
                seed,
                randomizeSeed,
                width,
                height,
                numInferenceSteps,
                endpoint,
            );
        } catch (_error) {
            console.error(
                "Error generating image, retry #:",
                attempt,
                prompt,
                width,
                height,
            );
            await sleep(500);
            attempt++;
        }
    }
}

async function getImage({
    prompt = null,
    prompts = null,
    seed = 123,
    randomizeSeed = false,
    width = 768,
    height = 768,
    numInferenceSteps = 2,
} = {}) {
    // Ensure width and height are integers and greater than 32, else use defaults
    width = Number.isInteger(width) && width > 32 ? width : 768;
    height = Number.isInteger(height) && height > 32 ? height : 768;

    // Ensure width and height are multiples of 8
    width = Math.floor(width / 8) * 8;
    height = Math.floor(height / 8) * 8;

    if (prompts) {
        const imagePromises = prompts.map((p) =>
            generateImageRetry(
                p,
                seed,
                randomizeSeed,
                width,
                height,
                numInferenceSteps,
            ),
        );
        const images = await Promise.all(imagePromises);
        return images;
    } else {
        return [
            await generateImageRetry(
                prompt,
                seed,
                randomizeSeed,
                width,
                height,
                numInferenceSteps,
            ),
        ];
    }
}

const server = http.createServer(async (req, res) => {
    console.log(`Received request: ${req.method} ${req.url}`);
    if (req.method === "POST" && req.url === "/generate") {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
            console.log("Received chunk of data");
        });
        req.on("end", async () => {
            console.log("Request body fully received:", body);
            try {
                const params = JSON.parse(body);
                console.log("Parsed request parameters:", params);
                const base64Images = await getImage(params);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(base64Images));
                console.log("Response sent with generated images");
            } catch (error) {
                console.error("Error processing request:", error);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        console.log("Request not found");
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
    }
});

const PORT = process.env.PORT || 5556;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

export { getImage };
