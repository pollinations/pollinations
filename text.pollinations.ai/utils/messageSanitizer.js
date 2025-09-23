import debug from "debug";
import { getProvider } from "../modelCost.js";

const log = debug("pollinations:portkey");

const PLACEHOLDER = "-";

/**
 * Ensure user messages have non-empty content and apply provider-specific fixes.
 * - Replaces empty user message content with a placeholder
 * - For Bedrock models: ensures the first non-system message is a user message and removes empty messages
 *
 * @param {Array} messages - Original messages array
 * @param {Object} modelConfig - Model configuration object (from availableModels.js)
 * @param {string} originalModelName - The originally requested model name
 * @returns {{ messages: Array, replacedCount: number, bedrockAdjusted: boolean }}
 */
export function sanitizeMessagesWithPlaceholder(messages, modelConfig, originalModelName) {
  let replacedCount = 0;
  let bedrockAdjusted = false;

  if (!Array.isArray(messages)) {
    return { messages, replacedCount, bedrockAdjusted };
  }

  let result = messages.map((msg) => {
    if (!msg || msg.role !== "user") return msg;
    const m = { ...msg };

    if (typeof m.content === "string") {
      if (m.content.trim() === "") {
        m.content = PLACEHOLDER;
        replacedCount++;
      }
    } else if (Array.isArray(m.content)) {
      if (m.content.length === 0) {
        m.content = [{ type: "text", text: PLACEHOLDER }];
        replacedCount++;
      } else {
        let hadReplacement = false;
        let hasNonEmptyPart = false;
        m.content = m.content.map((part) => {
          if (part && part.type === "text") {
            const text = (part.text ?? "").toString();
            if (text.trim() === "") {
              hadReplacement = true;
              return { ...part, text: PLACEHOLDER };
            } else {
              hasNonEmptyPart = true;
              return part;
            }
          }
          // Non-text parts are considered non-empty
          hasNonEmptyPart = true;
          return part;
        });
        if (!hasNonEmptyPart) {
          m.content = [{ type: "text", text: PLACEHOLDER }];
          hadReplacement = true;
        }
        if (hadReplacement) replacedCount++;
      }
    } else if (m.content == null) {
      m.content = PLACEHOLDER;
      replacedCount++;
    }
    return m;
  });

  if (replacedCount > 0) {
    log(`Replaced ${replacedCount} empty user message content with placeholder`);
  }

  // Bedrock-specific conversation rules
  const actualModelName =
    modelConfig?.model ||
    modelConfig?.["azure-model-name"] ||
    modelConfig?.["azure-deployment-id"] ||
    originalModelName;
  const provider = getProvider(actualModelName);

  if (provider === "bedrock") {
    // Filter out empty string user messages
    result = result.filter((msg) => {
      if (msg && typeof msg.content === "string" && msg.content.trim() === "") {
        return false;
      }
      return true;
    });

    const firstNonSystemIndex = result.findIndex((msg) => msg.role !== "system");

    if (
      firstNonSystemIndex !== -1 &&
      result[firstNonSystemIndex].role !== "user"
    ) {
      log(
        `Bedrock model detected (${originalModelName}), inserting placeholder user message before first non-system message`,
      );
      result = [
        ...result.slice(0, firstNonSystemIndex),
        { role: "user", content: PLACEHOLDER },
        ...result.slice(firstNonSystemIndex),
      ];
      bedrockAdjusted = true;
    }

    log(
      `Final Bedrock messages: roles are [${result.map((m) => m.role).join(", ")}]`,
    );
  }

  return { messages: result, replacedCount, bedrockAdjusted };
}
