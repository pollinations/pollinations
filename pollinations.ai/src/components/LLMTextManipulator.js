
import React from "react"
import { usePollinationsText } from "@pollinations/react"
import ReactMarkdown from "react-markdown"
import { useTheme, useMediaQuery } from "@mui/material"
import { REPHRASE, EMOJI, RESPONSIVE, TRANSLATE } from "../config/copywrite"

export function LLMTextManipulator({ children }) {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.only("xs"))
  const userLanguage = navigator.language || navigator.userLanguage
  const isEnglish = userLanguage.startsWith("en")

  // Convert children to a single string
  let childString = React.Children.toArray(children).join(" ")

  // Check if any of the instruction strings are present
  const hasInstructions =
    childString.includes(REPHRASE) ||
    childString.includes(EMOJI) ||
    childString.includes(RESPONSIVE) ||
    childString.includes(TRANSLATE)

  // If none of the 4 strings are found, return the input as is
  if (!hasInstructions) {
    console.log("LLMTextManipulator: No instructions found, returning child text without LLM processing.")
    return (
      <ReactMarkdown
        components={{
          p: ({ children }) => <p style={{ margin: "0px" }}>{children}</p>,
        }}
      >
        {childString}
      </ReactMarkdown>
    )
  }

  // Build the instruction chain conditionally
  let instructionChain = []

  if (childString.includes(REPHRASE)) {
    instructionChain.push(REPHRASE)
    childString = childString.replaceAll(REPHRASE, "")
  }

  if (!isEnglish && childString.includes(TRANSLATE)) {
    instructionChain.push(`${TRANSLATE} ${userLanguage}.`)
    childString = childString.replaceAll(TRANSLATE, "")
  }

  if (childString.includes(RESPONSIVE)) {
    if (isXs) {
      instructionChain.push(RESPONSIVE)
      childString = childString.replaceAll(RESPONSIVE, "")
    } else {
      childString = childString.replaceAll(RESPONSIVE, "")
    }
  }

  if (childString.includes(EMOJI)) {
    instructionChain.push(EMOJI)
    childString = childString.replaceAll(EMOJI, "")
  }

  // Combine instructions and original text into a single prompt
  const promptWithInstructions = instructionChain.join(" ") + " " + childString
  console.log("Text Prompt", promptWithInstructions)

  // Process the prompt with usePollinationsText
  const processedText = usePollinationsText(promptWithInstructions) || promptWithInstructions
  console.log("Text Output:", processedText)

  // Render the processed text in Markdown format
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p style={{ margin: "0px" }}>{children}</p>,
        a: ({ children, ...props }) => (
          <a style={{ color: "Colors.lime" }} {...props}>
            {children}
          </a>
        ),
      }}
    >
      {processedText}
    </ReactMarkdown>
  )
}
