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

  console.log("User language is English:", isEnglish)

  // Helper function: finds instructions in the string & returns them in the order found,
  // plus the text with those instructions removed.
  function extractInstructionsFromString(originalText) {
    let text = originalText
    let instructions = []

    while (true) {
      const indices = [
        { name: REPHRASE, idx: text.indexOf(REPHRASE) },
        { name: EMOJI, idx: text.indexOf(EMOJI) },
        { name: RESPONSIVE, idx: text.indexOf(RESPONSIVE) },
        { name: TRANSLATE, idx: text.indexOf(TRANSLATE) },
      ].filter(item => item.idx !== -1)

      if (indices.length === 0) break

      const earliest = indices.reduce((min, cur) => (cur.idx < min.idx ? cur : min))
      instructions.push(earliest.name)

      text =
        text.slice(0, earliest.idx) +
        text.slice(earliest.idx + earliest.name.length)
    }

    return {
      textWithoutInstructions: text.trim(),
      instructions,
    }
  }

  // Convert "children" to an array in case multiple items were passed
  const childArray = React.Children.toArray(children)

  // Process each child individually
  const processedOutputs = childArray.map((childContent, index) => {
    const childString = childContent.toString()

    // Extract the instructions in order & remove them from the text
    const { textWithoutInstructions, instructions } = extractInstructionsFromString(childString)

    console.group(`Child #${index + 1} - Initial Parsing`)
    console.log("Initial text:", childString)
    console.log("Parsed text (without instructions):", textWithoutInstructions)
    console.log("Instructions order:", instructions)
    console.groupEnd()

    let currentText = textWithoutInstructions

    instructions.forEach((instruction) => {
      // Skip TRANSLATE if user is English
      if (instruction === TRANSLATE && isEnglish) {
        console.log("Skipping TRANSLATE (user is English).")
        return
      }

      // Skip RESPONSIVE if screen is not 'xs'
      if (instruction === RESPONSIVE && !isXs) {
        console.log("Skipping RESPONSIVE (not on xs screen).")
        return
      }

      // Build the prompt to send to usePollinationsText
      // If it's TRANSLATE, append the user language.
      // Otherwise, just prepend the instruction.
      let combinedPrompt
      if (instruction === TRANSLATE) {
        // The user language might be appended in a way that your translation logic expects
        combinedPrompt = `${instruction} ${userLanguage} ${currentText}`
      } else {
        combinedPrompt = `${instruction} ${currentText}`
      }

      console.group(`Applying instruction: ${instruction}`)
      console.log("Input to usePollinationsText:", combinedPrompt)

      // Transform with Pollinations
      const result = usePollinationsText(combinedPrompt) || currentText
      if (result.includes("HTTP error! status: 429")) {
        console.log("Rate limit (429) detected. Output replaced with 'Loading...'.")
        currentText = "Loading..."
      } else {
        currentText = result
      }
      console.log("Output from usePollinationsText:", currentText)
      console.groupEnd()
    })

    return currentText
  })

  // Combine all processed child outputs
  const finalOutput = processedOutputs.join("\n\n")
  console.log("Final Output after all children processed:", finalOutput)

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
      {finalOutput}
    </ReactMarkdown>
  )
}
