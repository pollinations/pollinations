/**
 * Simple object cleaning utilities
 * Eliminates duplication between cleanUndefined and cleanNullAndUndefined
 */

import debug from "debug";

const log = debug("pollinations:utils:cleaners");

/**
 * Removes undefined values from an object
 * @param {Object} obj - Object to clean
 * @returns {Object} Object without undefined values
 */
export const cleanUndefined = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return obj;
    }

    const cleaned = { ...obj };
    Object.keys(cleaned).forEach((key) => {
        if (cleaned[key] === undefined) {
            delete cleaned[key];
        }
    });
    return cleaned;
};

/**
 * Removes null and undefined values from an object
 * @param {Object} obj - Object to clean
 * @returns {Object} Object without null or undefined values
 */
export const cleanNullAndUndefined = (obj) => {
    log(
        `Cleaning null and undefined values from object keys: ${obj && typeof obj === "object" ? Object.keys(obj).join(", ") : "N/A"}`,
    );

    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return obj;
    }

    const cleaned = { ...obj };
    const removedProps = [];

    Object.keys(cleaned).forEach((key) => {
        // Never clean modalities, audio properties or Gemini thought signatures
        if (key === "modalities" || key === "audio" || key.startsWith("thought_")) {
            return;
        }

        if (cleaned[key] === undefined || cleaned[key] === null) {
            removedProps.push(
                `${key}: ${cleaned[key] === null ? "null" : "undefined"}`,
            );
            delete cleaned[key];
        } else if (
            typeof cleaned[key] === "object" &&
            cleaned[key] !== null &&
            !Array.isArray(cleaned[key])
        ) {
            // Recursively clean nested objects
            const cleanedNestedObj = cleanNullAndUndefined(cleaned[key]);

            // If the cleaned nested object has no properties, remove it entirely
            if (
                cleanedNestedObj &&
                Object.keys(cleanedNestedObj).length === 0
            ) {
                removedProps.push(`${key}: (empty object after cleaning)`);
                delete cleaned[key];
            } else {
                cleaned[key] = cleanedNestedObj;
            }
        }
    });

    if (removedProps.length > 0) {
        log(`Removed properties: ${removedProps.join(", ")}`);
    }

    log(`Cleaned object now has keys: ${Object.keys(cleaned).join(", ")}`);
    return cleaned;
};
