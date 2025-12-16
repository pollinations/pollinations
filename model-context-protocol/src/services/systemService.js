/**
 * Pollinations System Status Service
 *
 * Functions and schemas for system health checks, error handling, and diagnostics
 */

import {
    createMCPResponse,
    createTextContent,
    buildUrl,
} from "../utils/coreUtils.js";
import { z } from "zod";

// Constants
const TEXT_API_BASE_URL = "https://text.pollinations.ai";
const IMAGE_API_BASE_URL = "https://image.pollinations.ai";

/**
 * System status information
 */
const SYSTEM_INFO = {
    mcpVersion: "1.0.15",
    apis: {
        text: { url: TEXT_API_BASE_URL, status: "unknown", lastChecked: null },
        image: { url: IMAGE_API_BASE_URL, status: "unknown", lastChecked: null },
        audio: { url: TEXT_API_BASE_URL, status: "unknown", lastChecked: null }
    },
    models: {
        text: ["openai", "claude-xlarge", "gemini-2.0-thinking", "deepseek-r1", "kimi-k2-thinking"],
        image: ["flux", "turbo", "seedream", "nanobanana-pro"],
        video: ["veo", "seedance"],
        audio: ["openai-audio"]
    }
};

/**
 * Internal function to check API health
 *
 * @param {string} apiUrl - API base URL
 * @param {string} endpoint - Health check endpoint
 * @returns {Promise<Object>} - Health status
 */
async function _checkApiHealth(apiUrl, endpoint = "/models") {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(`${apiUrl}${endpoint}`, {
            method: "GET",
            signal: controller.signal,
            headers: {
                "User-Agent": "PollinationsMCP/1.0",
                "X-Source": "pollinations-mcp",
                "X-Client-Version": "1.0.0"
            }
        });

        clearTimeout(timeoutId);

        return {
            status: response.ok ? "healthy" : "degraded",
            statusCode: response.status,
            responseTime: Date.now(),
            error: null
        };
    } catch (error) {
        return {
            status: error.name === "AbortError" ? "timeout" : "error",
            statusCode: null,
            responseTime: Date.now(),
            error: error.message
        };
    }
}

/**
 * Gets comprehensive system status and health information
 *
 * @param {Object} params - Status check parameters
 * @param {boolean} [params.detailed=false] - Whether to include detailed information
 * @param {boolean} [params.checkApis=false] - Whether to perform API health checks
 * @returns {Promise<Object>} - MCP response with system status
 */
async function getSystemStatus(params) {
    const { detailed = false, checkApis = false } = params;

    try {
        let apiStatus = {};
        
        if (checkApis) {
            // Check API health
            const [textStatus, imageStatus] = await Promise.all([
                _checkApiHealth(TEXT_API_BASE_URL, "/models"),
                _checkApiHealth(IMAGE_API_BASE_URL, "/models")
            ]);

            apiStatus = {
                text: { ...SYSTEM_INFO.apis.text, ...textStatus, lastChecked: new Date().toISOString() },
                image: { ...SYSTEM_INFO.apis.image, ...imageStatus, lastChecked: new Date().toISOString() },
                audio: { ...SYSTEM_INFO.apis.audio, ...textStatus, lastChecked: new Date().toISOString() }
            };
        }

        const statusMessage = detailed 
            ? `🌐 Pollinations MCP System Status (v${SYSTEM_INFO.mcpVersion})

📊 Available Models:
• Text: ${SYSTEM_INFO.models.text.join(", ")}
• Image: ${SYSTEM_INFO.models.image.join(", ")}
• Video: ${SYSTEM_INFO.models.video.join(", ")}
• Audio: ${SYSTEM_INFO.models.audio.join(", ")}

🔧 API Endpoints:
• Text API: ${TEXT_API_BASE_URL}
• Image API: ${IMAGE_API_BASE_URL}
• Audio API: ${TEXT_API_BASE_URL} (via text API)

${checkApis ? `
📈 API Health Status:
• Text API: ${apiStatus.text.status} ${apiStatus.text.statusCode ? `(${apiStatus.text.statusCode})` : ''}
• Image API: ${apiStatus.image.status} ${apiStatus.image.statusCode ? `(${apiStatus.image.statusCode})` : ''}
• Audio API: ${apiStatus.audio.status} ${apiStatus.audio.statusCode ? `(${apiStatus.audio.statusCode})` : ''}

Last Checked: ${new Date().toISOString()}` : ''}

💡 Use 'checkApiHealth' to perform live health checks
Use 'listAvailableModels' to see all available models
Use 'getApiEndpoints' for endpoint information`
            : `🌐 Pollinations MCP System Status

✅ System: Online (v${SYSTEM_INFO.mcpVersion})
📝 Text Models: ${SYSTEM_INFO.models.text.length} available
🎨 Image Models: ${SYSTEM_INFO.models.image.length} available  
🎥 Video Models: ${SYSTEM_INFO.models.video.length} available
🎵 Audio Models: ${SYSTEM_INFO.models.audio.length} available

${checkApis ? `🔍 API Health: ${Object.values(apiStatus).every(api => api.status === "healthy") ? '✅ All APIs healthy' : '⚠️ Some APIs experiencing issues'}` : '💡 Use detailed=true for more info'}`;

        return createMCPResponse([
            createTextContent(statusMessage),
        ]);
    } catch (error) {
        throw new Error(`Failed to get system status: ${error.message}`);
    }
}

/**
 * Lists all available models across different modalities
 *
 * @param {Object} params - List models parameters
 * @param {string} [params.modality] - Specific modality to list (text, image, video, audio)
 * @returns {Promise<Object>} - MCP response with available models
 */
async function listAvailableModels(params) {
    const { modality } = params;

    try {
        let modelsToShow = SYSTEM_INFO.models;
        
        if (modality && SYSTEM_INFO.models[modality]) {
            modelsToShow = { [modality]: SYSTEM_INFO.models[modality] };
        }

        const modelsList = Object.entries(modelsToShow)
            .map(([type, models]) => `• ${type.toUpperCase()}: ${models.join(", ")}`)
            .join("\n");

        return createMCPResponse([
            createTextContent(
                `🎯 Available Models${modality ? ` (${modality})` : ''}\n\n` +
                `${modelsList}\n\n` +
                `${!modality ? `💡 Use modality parameter to filter by type (text, image, video, audio)` : ''}\n` +
                `Example: listAvailableModels({ modality: "text" })`
            ),
        ]);
    } catch (error) {
        throw new Error(`Failed to list models: ${error.message}`);
    }
}

/**
 * Gets API endpoint information
 *
 * @returns {Promise<Object>} - MCP response with API endpoints
 */
async function getApiEndpoints() {
    try {
        return createMCPResponse([
            createTextContent(
                `🔗 Pollinations API Endpoints\n\n` +
                `📝 Text Generation:\n• Base: ${TEXT_API_BASE_URL}\n• Models: ${TEXT_API_BASE_URL}/models\n• OpenAI Compatible: ${TEXT_API_BASE_URL}/openai\n\n` +
                `🎨 Image Generation:\n• Base: ${IMAGE_API_BASE_URL}\n• Models: ${IMAGE_API_BASE_URL}/models\n• Generate: ${IMAGE_API_BASE_URL}/prompt/{prompt}\n\n` +
                `🎵 Audio Generation:\n• Via Text API: ${TEXT_API_BASE_URL}/{prompt}?model=openai-audio\n\n` +
                `💡 All endpoints support various parameters and models.\n` +
                `Check documentation for detailed usage information.`
            ),
        ]);
    } catch (error) {
        throw new Error(`Failed to get API endpoints: ${error.message}`);
    }
}

/**
 * Performs comprehensive API health check
 *
 * @param {Object} params - Health check parameters
 * @param {number} [params.timeout=5000] - Timeout in milliseconds
 * @param {boolean} [params.detailed=false] - Whether to include detailed timing
 * @returns {Promise<Object>} - MCP response with health check results
 */
async function checkApiHealth(params) {
    const { timeout = 5000, detailed = false } = params;

    try {
        const startTime = Date.now();
        
        // Check all APIs in parallel
        const [textHealth, imageHealth] = await Promise.all([
            _checkApiHealth(TEXT_API_BASE_URL, "/models"),
            _checkApiHealth(IMAGE_API_BASE_URL, "/models")
        ]);

        const totalCheckTime = Date.now() - startTime;

        const healthResults = {
            timestamp: new Date().toISOString(),
            totalCheckTime: `${totalCheckTime}ms`,
            timeout: `${timeout}ms`,
            apis: {
                text: {
                    endpoint: `${TEXT_API_BASE_URL}/models`,
                    status: textHealth.status,
                    statusCode: textHealth.statusCode,
                    responseTime: textHealth.responseTime ? `${textHealth.responseTime - startTime}ms` : "unknown",
                    error: textHealth.error
                },
                image: {
                    endpoint: `${IMAGE_API_BASE_URL}/models`,
                    status: imageHealth.status,
                    statusCode: imageHealth.statusCode,
                    responseTime: imageHealth.responseTime ? `${imageHealth.responseTime - startTime}ms` : "unknown",
                    error: imageHealth.error
                }
            },
            overall: {
                healthy: textHealth.status === "healthy" && imageHealth.status === "healthy",
                degraded: textHealth.status === "degraded" || imageHealth.status === "degraded",
                errors: textHealth.status === "error" || imageHealth.status === "error" || 
                       textHealth.status === "timeout" || imageHealth.status === "timeout"
            }
        };

        const statusMessage = detailed
            ? `🔍 API Health Check Results\n\n` +
              `⏱️ Check Duration: ${healthResults.totalCheckTime}\n` +
              `📊 Overall Status: ${healthResults.overall.healthy ? "✅ Healthy" : 
                                   healthResults.overall.degraded ? "⚠️ Degraded" : "❌ Issues Detected"}\n\n` +
              `📝 Text API (${healthResults.apis.text.endpoint}):\n` +
              `  Status: ${healthResults.apis.text.status} ${healthResults.apis.text.statusCode ? `(${healthResults.apis.text.statusCode})` : ''}\n` +
              `  Response Time: ${healthResults.apis.text.responseTime}\n` +
              `  ${healthResults.apis.text.error ? `Error: ${healthResults.apis.text.error}` : ''}\n\n` +
              `🎨 Image API (${healthResults.apis.image.endpoint}):\n` +
              `  Status: ${healthResults.apis.image.status} ${healthResults.apis.image.statusCode ? `(${healthResults.apis.image.statusCode})` : ''}\n` +
              `  Response Time: ${healthResults.apis.image.responseTime}\n` +
              `  ${healthResults.apis.image.error ? `Error: ${healthResults.apis.image.error}` : ''}`
            : `🔍 API Health Check\n\n` +
              `⏱️ Duration: ${healthResults.totalCheckTime}\n` +
              `📊 Status: ${healthResults.overall.healthy ? "✅ All APIs healthy" : 
                           healthResults.overall.degraded ? "⚠️ Some APIs degraded" : "❌ API issues detected"}\n\n` +
              `📝 Text API: ${healthResults.apis.text.status}\n` +
              `🎨 Image API: ${healthResults.apis.image.status}\n\n` +
              `Use detailed=true for comprehensive timing information.`;

        return createMCPResponse([
            createTextContent(statusMessage),
        ]);
    } catch (error) {
        throw new Error(`Failed to check API health: ${error.message}`);
    }
}

/**
 * Export tools as complete arrays ready to be passed to server.tool()
 */
export const systemTools = [
    [
        "getSystemStatus",
        "Get comprehensive system status and health information",
        {
            detailed: z
                .boolean()
                .optional()
                .describe("Whether to include detailed information (default: false)"),
            checkApis: z
                .boolean()
                .optional()
                .describe("Whether to perform live API health checks (default: false)"),
        },
        getSystemStatus,
    ],
    [
        "listAvailableModels",
        "List all available models across different modalities",
        {
            modality: z
                .enum(["text", "image", "video", "audio"])
                .optional()
                .describe("Specific modality to filter by"),
        },
        listAvailableModels,
    ],
    [
        "getApiEndpoints",
        "Get information about all available API endpoints",
        {},
        getApiEndpoints,
    ],
    [
        "checkApiHealth",
        "Perform comprehensive API health check with timing information",
        {
            timeout: z
                .number()
                .optional()
                .describe("Timeout in milliseconds (default: 5000)"),
            detailed: z
                .boolean()
                .optional()
                .describe("Whether to include detailed timing (default: false)"),
        },
        checkApiHealth,
    ],
];