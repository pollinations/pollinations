import React from "react"
import { Typography, Link, useMediaQuery } from "@material-ui/core"
import { Colors } from "../../../styles/global"
import { useTheme } from "@material-ui/core/styles"

export function ModelInfo({ model, wasPimped, referrer }) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"))

  const formatReferrer = (url) => {
    if (!url) return "-"
    const domain = url.replace(/^https?:\/\//, "").split("/")[0]
    return domain.split(".").slice(-2).join(".")
  }

  const renderModelInfo = (modelName, modelLink, loraLink) => (
    <Typography variant="body1" color="textSecondary" style={{ textAlign: "center", fontSize: "1.2rem" }}>
      {isMobile ? (
        <>
          Model: <Link href={modelLink} target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime, fontSize: "1.2rem" }}>{modelName}</Link><br />
          {loraLink && (
            <>
              LoRA: <Link href={loraLink} target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime, fontSize: "1.2rem" }}>DMD2</Link><br />
            </>
          )}
          {wasPimped && (
            <>
              Prompt Enhancer: <Link href="https://github.com/pollinations/pollinations/blob/master/image.pollinations.ai/groqPimp.js" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime, fontSize: "1.2rem" }}>Groq</Link><br />
            </>
          )}
          {referrer && (
            <>
              Referrer: <Link href={referrer} target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime, fontSize: "1.2rem" }}>{formatReferrer(referrer)}</Link>
            </>
          )}
        </>
      ) : (
        <>
          Model: <Link href={modelLink} target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime, fontSize: "1.2rem" }}>{modelName}</Link>&nbsp;&nbsp;
          {loraLink && (
            <>
              LoRA: <Link href={loraLink} target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime, fontSize: "1.2rem" }}>DMD2</Link>&nbsp;&nbsp;
            </>
          )}
          {wasPimped && (
            <>
              Prompt Enhancer: <Link href="https://github.com/pollinations/pollinations/blob/master/image.pollinations.ai/groqPimp.js" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime, fontSize: "1.2rem" }}>Groq</Link>&nbsp;&nbsp;
            </>
          )}
          {referrer && (
            <>
              Referrer: <Link href={referrer} target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime, fontSize: "1.2rem" }}>{formatReferrer(referrer)}</Link>
            </>
          )}
        </>
      )}
    </Typography>
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

  return renderModelInfo("Unknown Model", "#", null)
}
