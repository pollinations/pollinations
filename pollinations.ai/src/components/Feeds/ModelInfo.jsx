import React from "react";
import { Box, Link } from "@mui/material";
import { Colors, Fonts } from "../../config/global";
import { useModels } from "../../utils/useModels.js";

/**
 * Shared ModelInfo component for both image and text feeds
 *
 * @param {Object} props
 * @param {string} props.model - Model identifier
 * @param {string} props.referrer - Referrer URL
 * @param {string} props.itemType - Type of item ("image" or "text")
 */
export function ModelInfo({ model, referrer, itemType = "text" }) {
    // Fetch models from API based on item type
    const { models } = useModels(itemType);

    // Format referrer to show just the domain
    const formatReferrer = (url) => {
        if (!url) return "-";
        const domain = url.replace(/^https?:\/\//, "").split("/")[0];
        return domain.split(".").slice(-2).join(".");
    };

    // Get model info based on item type and model ID
    const getModelInfo = () => {
        // Try to find model in API-provided models
        if (models && Array.isArray(models)) {
            const foundModel = models.find((m) => m.id === model);
            if (foundModel) {
                return {
                    name: foundModel.name,
                    link: "https://pollinations.ai",
                };
            }
        }

        // If model not found in API data, format the ID nicely
        return {
            name:
                typeof model === "string"
                    ? model
                          .split("-")
                          .map(
                              (word) =>
                                  word.charAt(0).toUpperCase() + word.slice(1),
                          )
                          .join(" ")
                    : model
                      ? String(model)
                      : "Unknown Model",
            link: "https://pollinations.ai",
        };
    };

    // Get appropriate prompt enhancer link based on item type
    const getPromptEnhancerLink = () => {
        return itemType === "image"
            ? "https://github.com/pollinations/pollinations/blob/main/image.pollinations.ai/src/promptEnhancer.ts"
            : "https://github.com/pollinations/pollinations/blob/main/text.pollinations.ai/prompts/promptEnhancer.js";
    };

    const modelInfo = getModelInfo();

    return (
        <Box
            sx={{
                color: Colors.offwhite,
                fontSize: "1em",
                fontFamily: Fonts.parameter,
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                flexWrap: "wrap",
                gap: { xs: 1, md: 2 },
                justifyContent: "center",
                alignItems: "center",
            }}
        >
            <Box>
                {"Model: "}
                <Link
                    href={modelInfo.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: Colors.lime, fontSize: "1em" }}
                >
                    {modelInfo.name}
                </Link>
            </Box>

            {/* <Box>
        {"Prompt Enhancer: "}
        <Link
          href={getPromptEnhancerLink()}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: Colors.lime, fontSize: "1em" }}
        >
          Azure OpenAI
        </Link>
      </Box> */}

            {/* Always render Referrer */}
            <Box>
                {"Referrer: "}
                {/* Conditionally render Link only if referrer is a valid URL string */}
                {referrer &&
                typeof referrer === "string" &&
                referrer.trim() !== "" &&
                referrer !== "unknown"
                    ? <Link
                          href={referrer}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ color: Colors.lime, fontSize: "1em" }}
                      >
                          {formatReferrer(referrer)}
                      </Link>
                    : // Otherwise, display the raw referrer value, defaulting to "unknown" for falsy values
                      referrer || "unknown"}
            </Box>
        </Box>
    );
}
