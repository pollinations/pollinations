// @ts-nocheck -- Historical parser logic; only module syntax and formatting changed.
// biome-ignore-all lint: Preserve the historical parser logic, including unused variables.
// Source: https://raw.githubusercontent.com/pollinations/MIDIjourney/87768cda8c01814215cba9949633e98e8abde2ea/js/encoding/clipFormatter.js
import yaml from "js-yaml";
export function textToClip(response) {
    let parsedResponse;

    // Check for ``` quoted code blocks
    const codeBlocks = response.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/g);
    let yamlContent;

    console.error("codeblocks", codeBlocks);

    if (codeBlocks && codeBlocks.length >= 1) {
        // Extract text between the first ```
        yamlContent = codeBlocks[0].replace(/```(?:\w+)?\s*|\s*```/g, "");
    } else {
        // No code blocks found, use the whole response
        yamlContent = response;
    }

    console.error("trying to parse", yamlContent);

    try {
        parsedResponse = yaml.load(yamlContent);
    } catch (error) {
        console.error("Failed to parse YAML:", error);
        throw error;
    }

    // Destructure and check for required fields
    const { title, duration, key, explanation, notation } = parsedResponse;

    if (!title) {
        throw new Error("Missing required fields: title");
    }

    if (!notation) {
        throw new Error("Missing or empty required field: notation");
    }

    // Remove all " ' ` and \ characters in notes
    const cleanedNotation = notation.replace(/["'`\\]/g, "");

    return {
        title: title.trim(),
        duration,
        key: key ? key.trim() : null,
        explanation: explanation ? explanation.trim() : "",
        notation: cleanedNotation,
    };
}
