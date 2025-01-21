import React from "react"
import { Box, Link } from "@mui/material"
import { Colors, Fonts } from "../../config/global"

export function ModelInfo({ model, referrer }) {
  const formatReferrer = (url) => {
    if (!url) return "-"
    const domain = url.replace(/^https?:\/\//, "").split("/")[0]
    return domain.split(".").slice(-2).join(".")
  }

  const MODEL_INFO = {
    turbo: {
      modelName: "Boltning",
      modelLink: "https://civitai.com/models/413466/boltning-realistic-lightning-hyper",
      loraLink: "https://huggingface.co/tianweiy/DMD2",
    },
    flux: {
      modelName: "Flux.Schnell",
      modelLink: "https://blackforestlabs.ai/",
      loraLink: null,
    },
    "flux-anime": {
      modelName: "Flux.Anime",
      modelLink: "https://llmplayground.net/",
      loraLink: null,
    },
    "flux-3d": {
      modelName: "Flux.3D",
      modelLink: "https://llmplayground.net/",
      loraLink: null,
    },
    "flux-realism": {
      modelName: "Flux.Realism",
      modelLink: "https://llmplayground.net/",
      loraLink: null,
    },
    "flux-cablyai": {
      modelName: "CablyAI Pro",
      modelLink: "https://cablyai.com/",
      loraLink: null,
    },
    default: {
      modelName: "Unknown Model",
      modelLink: "#",
      loraLink: null,
    },
  }

  const { modelName, modelLink, loraLink } = MODEL_INFO[model] || MODEL_INFO.default

  const renderModelInfo = (name, link, lora) => (
    <Box
      sx={{
        color: Colors.offwhite,
        fontSize: "1em",
        fontFamily: Fonts.body,
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        flexWrap: "wrap",
        gap: { xs: 1, md: 2 },
      }}
    >
      <Box>
        Model:{" "}
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
        LoRA:{" "}
        <Link
          href={lora}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: Colors.lime, fontSize: "1em" }}
        >
          DMD2
        </Link>
      </Box>

      <Box>
        Prompt Enhancer:{" "}
        <Link
          href="https://github.com/pollinations/pollinations/blob/master/image.pollinations.ai/groqPimp.js"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: Colors.lime, fontSize: "1em" }}
        >
          Groq
        </Link>
      </Box>

      <Box>
        Referrer:{" "}
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

  return renderModelInfo(modelName, modelLink, loraLink)
}
