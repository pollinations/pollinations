import React from "react"
import { Box, Link } from "@mui/material"
import { Colors, Fonts } from "../../config/global"

export function ModelInfo({ model, referrer }) {
  const formatReferrer = (url) => {
    if (!url) return "-"
    const domain = url.replace(/^https?:\/\//, "").split("/")[0]
    return domain.split(".").slice(-2).join(".")
  }

  // Static model info for common models
  const MODEL_INFO = {
    turbo: {
      modelName: "Boltning",
      modelLink: "https://civitai.com/models/413466/boltning-realistic-lightning-hyper",
    },
    flux: {
      modelName: "Flux.Schnell",
      modelLink: "https://blackforestlabs.ai/",
    },
    "flux-pro": {
      modelName: "Flux.Schnell Pro",
      modelLink: "https://blackforestlabs.ai/",
    },
    "flux-realism": {
      modelName: "Flux.Schnell Realism",
      modelLink: "https://blackforestlabs.ai/",
    },
    "flux-anime": {
      modelName: "Flux.Schnell Anime",
      modelLink: "https://blackforestlabs.ai/",
    },
    "flux-3d": {
      modelName: "Flux.Schnell 3D",
      modelLink: "https://blackforestlabs.ai/",
    },
    "flux-cablyai": {
      modelName: "Flux.Schnell CablyAI",
      modelLink: "https://blackforestlabs.ai/",
    },
    default: {
      modelName: "Unknown Model",
      modelLink: "#",
    },
  }

  // Generate default model info for models not in the static list
  const getModelInfo = (modelName) => {
    if (MODEL_INFO[modelName]) {
      return MODEL_INFO[modelName];
    }
    
    // Format unknown model names nicely
    const formattedName = modelName
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    
    return {
      modelName: formattedName,
      modelLink: "#",
    };
  }

  const { modelName, modelLink } = getModelInfo(model);

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
