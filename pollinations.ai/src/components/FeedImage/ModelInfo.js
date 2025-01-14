import React from "react"
import { Box, Link } from "@mui/material"
import { Colors, Fonts } from "../../config/global"

export function ModelInfo({ model, wasPimped, referrer }) {
  const formatReferrer = (url) => {
    if (!url) return "-"
    const domain = url.replace(/^https?:\/\//, "").split("/")[0]
    return domain.split(".").slice(-2).join(".")
  }

  const renderModelInfo = (modelName, modelLink, loraLink) => (
    <Box
      sx={{
        color: Colors.offwhite,
        fontSize: "1.2em",
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
          href={modelLink}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: Colors.lime, fontSize: "1.2rem" }}
        >
          {modelName}
        </Link>
      </Box>
      {loraLink && (
        <Box>
          LoRA:{" "}
          <Link
            href={loraLink}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: Colors.lime, fontSize: "1.2rem" }}
          >
            DMD2
          </Link>
        </Box>
      )}
      {wasPimped && (
        <Box>
          Prompt Enhancer:{" "}
          <Link
            href="https://github.com/pollinations/pollinations/blob/master/image.pollinations.ai/groqPimp.js"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: Colors.lime, fontSize: "1.2rem" }}
          >
            Groq
          </Link>
        </Box>
      )}
      {referrer && (
        <Box>
          Referrer:{" "}
          <Link
            href={referrer}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: Colors.lime, fontSize: "1.2rem" }}
          >
            {formatReferrer(referrer)}
          </Link>
        </Box>
      )}
    </Box>
  )

  if (model === "turbo") {
    return renderModelInfo(
      "Boltning",
      "https://civitai.com/models/413466/boltning-realistic-lightning-hyper",
      "https://huggingface.co/tianweiy/DMD2"
    )
  }

  if (model === "flux") {
    return renderModelInfo("Flux.Schnell", "https://blackforestlabs.ai/", null)
  }

  if (model === "flux-anime") {
    return renderModelInfo("Flux.Anime", "https://llmplayground.net/", null)
  }

  if (model === "flux-3d") {
    return renderModelInfo("Flux.3D", "https://llmplayground.net/", null)
  }

  if (model === "flux-realism") {
    return renderModelInfo("Flux.Realism", "https://llmplayground.net/", null)
  }

  if (model === "flux-cablyai") {
    return renderModelInfo("CablyAI Pro", "https://cablyai.com/", null)
  }

  return renderModelInfo("Unknown Model", "#", null)
}
