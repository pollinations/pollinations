import dotenv from "dotenv";

dotenv.config();

/**
 * Creates an OVH AI Endpoints model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - OVH model configuration
 */
export function createOVHModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": "https://gpt-oss-20b.endpoints.kepler.ai.cloud.ovh.net/api/openai_compat/v1",
        authKey: process.env.OVH_API_KEY,
        "max-tokens": 8192,
        ...additionalConfig,
    };
}
