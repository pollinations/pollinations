import React from "react"
import { Typography, Link } from "@material-ui/core"
import { Colors } from "../../../styles/global"

export function ModelInfo({ model, wasPimped, referrer }) {
  const formatReferrer = (url) => {
    if (!url) return "-"
    const domain = url.replace(/^https?:\/\//, "").split("/")[0]
    return domain.split(".").slice(-2).join(".")
  }

  const renderModelInfo = (modelName, modelLink, loraLink) => (
    <Typography
      variant="caption"
      color="textSecondary"
      style={{ textAlign: "center", fontSize: "1rem" }}
    >
      Model: <Link
        href={modelLink}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: Colors.lime }}
      >
        {modelName}
      </Link>
      <br />
      {loraLink && (
        <>
          LoRA: <Link
            href={loraLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: Colors.lime }}
          >
            DMD2
          </Link>
          <br />
        </>
      )}
      Prompt Enhancer: {wasPimped ? (
        <Link
          href="https://github.com/pollinations/pollinations/blob/master/image.pollinations.ai/groqPimp.js"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: Colors.lime }}
        >
          Groq
        </Link>
      ) : (
        <i>N/A</i>
      )}
      <br />
      {referrer && (
        <>
          Referrer: <Link
            href={referrer}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: Colors.lime }}
          >
            {formatReferrer(referrer)}
          </Link>
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

  return null
}
