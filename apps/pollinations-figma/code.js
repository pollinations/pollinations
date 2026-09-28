// code.js — Figma plugin main code (runs in the "main" / plugin context)
// Communicates with ui.html via postMessage. The UI handles network requests
// (Figma's main context cannot fetch external URLs).

figma.showUI(__html__, { width: 480, height: 520, visible: false });

figma.ui.postMessage({ type: "init" });

const POLLINATIONS_IMAGE_HOST = "https://image.pollinations.ai";
const _POLLINATIONS_TEXT_HOST = "https://text.pollinations.ai";
const _POLLINATIONS_GEN_HOST = "https://gen.pollinations.ai";

// Listen for messages from the UI
figma.ui.onmessage = (msg) => {
    if (msg.type === "save-api-key") {
        figma.clientStorage.setAsync("apiKey", msg.key);
    } else if (msg.type === "get-api-key") {
        figma.clientStorage.getAsync("apiKey").then(key => {
            figma.ui.postMessage({ type: "api-key-result", key: key || "" });
        });
    } else if (msg.type === "generate-image") {
        handleGenerateImage(msg);
    } else if (msg.type === "edit-image") {
        handleEditImage(msg);
    } else if (msg.type === "image-ready") {
        renderImageInSelection(msg.imageBytes, msg.prompt);
    } else if (msg.type === "close-plugin") {
        figma.closePlugin();
    }
};

async function handleGenerateImage(msg) {
    try {
        const prompt = msg.prompt;
        const model = msg.model || "gptimage";
        const width = msg.width || 1024;
        const height = msg.height || 1024;

        // Build the Pollinations image URL
        const params = new URLSearchParams({
            model: model,
            width: String(width),
            height: String(height),
            nologo: "true",
        });

        if (msg.apiKey) params.set("key", msg.apiKey);

        const imageUrl = `${POLLINATIONS_IMAGE_HOST}/${encodeURIComponent(prompt)}?${params.toString()}`;

        // Tell the UI to fetch the image (main context can't fetch external URLs)
        figma.ui.postMessage({
            type: "fetch-image",
            url: imageUrl,
            prompt: prompt,
            model: model,
        });
    } catch (err) {
        figma.notify(`Error: ${err.message || err}`);
    }
}

async function handleEditImage(msg) {
    try {
        const node = figma.currentPage.selection[0];
        if (!node || !("fills" in node)) {
            figma.notify(
                "Select a rectangle or frame to fill with the generated image.",
            );
            return;
        }

        // For image editing, we treat the selected node's current fill as the input image
        const imageRef = extractImageFromNode(node);
        if (!imageRef) {
            figma.notify("Could not extract image from selection.");
            return;
        }

        // Tell UI to use the edit-with-image endpoint
        figma.ui.postMessage({
            type: "edit-image-via-ui",
            prompt: msg.prompt,
            model: msg.model || "gptimage",
            apiKey: msg.apiKey,
            baseImage: imageRef,
        });
    } catch (err) {
        figma.notify(`Error: ${err.message || err}`);
    }
}

function extractImageFromNode(node) {
    // Extract paint image hash if the node has a fill with an image
    try {
        const fills = JSON.parse(JSON.stringify(node.fills));
        for (const fill of fills) {
            if (fill.type === "IMAGE" && fill.imageHash) {
                return fill.imageHash;
            }
        }
    } catch (_e) {
        // Not a paintable node or no image fill
    }
    return null;
}

// Image rendering is handled via the combined onmessage handler above

async function renderImageInSelection(imageBytes, prompt) {
    try {
        // Create an image from the bytes
        const image = await figma.createImageAsync(new Uint8Array(imageBytes));

        const selection = figma.currentPage.selection;
        if (selection.length > 0) {
            const node = selection[0];

            if (
                node.type === "RECTANGLE" ||
                node.type === "FRAME" ||
                node.type === "STAR" ||
                node.type === "ELLIPSE"
            ) {
                // Fill the selected shape with the generated image
                const fills = JSON.parse(JSON.stringify(node.fills));
                if (fills.length === 0)
                    fills.push({ type: "SOLID", color: { r: 1, g: 1, b: 1 } });
                fills[0] = {
                    type: "IMAGE",
                    imageRef: image.imageHash,
                    imageHash: image.imageHash,
                    scaleMode: "FILL",
                };
                node.fills = fills;
            }

            const rect = figma.createRectangle();
            rect.fills = [
                {
                    type: "IMAGE",
                    imageRef: image.imageHash,
                    imageHash: image.imageHash,
                    scaleMode: "FILL",
                },
            ];
            rect.x = node.x ?? 0;
            rect.y = node.y ?? 0;
            rect.name = `Pollinations: ${prompt.substring(0, 30)}`;
            figma.currentPage.appendChildChild(rect);
            figma.currentPage.selection = [rect];
        }

        figma.notify("Image generated and placed! ✅");
        figma.ui.postMessage({ type: "generation-success" });
    } catch (err) {
        figma.notify(`Failed to place image: ${err.message || err}`);
    }
}
