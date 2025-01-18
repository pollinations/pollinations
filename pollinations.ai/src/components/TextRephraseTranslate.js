import React from "react"
import useRandomSeed from "../hooks/useRandomSeed"
import ReactMarkdown from "react-markdown"
import useResponsivePollinationsText from "../hooks/useResponsivePollinationsText"
import PromptTooltip from "./PromptTooltip"

export function TextRephraseTranslate({ children }) {
  const seed = useRandomSeed()
  const prompt = `Text: '${children}'. Only respond with the markdown. No explanation. No code box. try not to change the length much.`
  const rephrase = useResponsivePollinationsText(prompt, { seed })

  return (
    <PromptTooltip title={prompt} seed={seed}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p style={{ margin: "0px" }}>{children}</p>,
        }}
      >
        {rephrase}
      </ReactMarkdown>
    </PromptTooltip>
  )
}
