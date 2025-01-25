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
    },
    flux: {
      modelName: "Flux.Schnell",
      modelLink: "https://blackforestlabs.ai/",
    },
    default: {
      modelName: "Unknown Model",
      modelLink: "#",
    },
  }

  const { modelName, modelLink } = MODEL_INFO[model] || MODEL_INFO.default

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
          href="https://github.com/pollinations/pollinations/blob/master/image.pollinations.ai/groqPimp.js"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: Colors.lime, fontSize: "1em" }}
        >
          Groq
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

  return renderModelInfo(modelName, modelLink, loraLink)
}
