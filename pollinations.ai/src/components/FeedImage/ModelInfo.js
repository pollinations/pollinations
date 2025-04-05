import React from "react"
import { Box, Link } from "@mui/material"
import { Colors, Fonts } from "../../config/global"

export function ModelInfo({ model, referrer }) {
  const formatReferrer = (url) => {
    if (!url) return "-"
    const domain = url.replace(/^https?:\/\//, "").split("/")[0]
    return domain.split(".").slice(-2).join(".")
  }

  // Define only special cases that need custom links or names
  const SPECIAL_MODEL_LINKS = {
    turbo: "https://civitai.com/models/413466/boltning-realistic-lightning-hyper",
    flux: "https://blackforestlabs.ai/",
    // Add any other special model links here as needed
  }

  // Get the model link based on the model name
  const getModelLink = (modelName) => {
    if (modelName.startsWith("flux")) {
      return "https://blackforestlabs.ai/"
    }
    return SPECIAL_MODEL_LINKS[modelName] || "#"
  }

  // Format the model name for display
  const formatModelName = (modelName) => {
    if (modelName === "turbo") return "Boltning"
    if (modelName === "flux") return "Flux.Schnell"
    
    // Format other model names nicely
    return modelName
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const modelLink = getModelLink(model)
  const modelName = formatModelName(model)

  const renderModelInfo = (name, link) => (
    <Box
      sx={{
        color: Colors.offwhite,
        fontSize: "1em",
        fontFamily: Fonts.parameter,
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        flexWrap: "wrap",
        gap: { xs: 1, md: 2 },
      }}
    >
      <Box>
        {"Model: "}
        <Link
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: Colors.lime, fontSize: "1em" }}
        >
          {name}
        </Link>
      </Box>

      <Box>
        {"Prompt Enhancer: "}
        <Link
          href="https://github.com/pollinations/pollinations/blob/master/image.pollinations.ai/promptEnhancer.js"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: Colors.lime, fontSize: "1em" }}
        >
          Azure OpenAI
        </Link>
      </Box>

      <Box>
      {"Referrer: "}
        <Link
          href={referrer}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: Colors.lime, fontSize: "1em" }}
        >
          {formatReferrer(referrer)}
        </Link>
      </Box>
    </Box>
  )

  return renderModelInfo(modelName, modelLink)
}
