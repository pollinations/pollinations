// @ts-nocheck -- Historical parser logic; only module syntax and formatting changed.
// biome-ignore-all lint: Preserve the historical parser logic, including unused variables.
// Source: https://raw.githubusercontent.com/pollinations/MIDIjourney/d1dfb1b457c54a1781b8a00502ef8bb8f5265508/js/encoding/clipFormatter.js
import yaml from "js-yaml";
export function textToClip(response) {
    let parsedResponse;
    try {
        parsedResponse = yaml.load(response);
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
