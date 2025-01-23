import React from "react"
import { usePollinationsText } from "@pollinations/react"
import ReactMarkdown from "react-markdown"
import { useTheme, useMediaQuery } from "@mui/material"
import { REPHRASE, EMOJI, RESPONSIVE, TRANSLATE } from "../config/copywrite"
import { Colors } from "../config/global"
import styled from "@emotion/styled"

export function LLMTextManipulator({ children }) {
  const LOGS_ENABLED = false // Change this flag to enable/disable logs

  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.only("xs"))
  const userLanguage = navigator.language || navigator.userLanguage
  const isEnglish = userLanguage.startsWith("en")

  if (LOGS_ENABLED) {
    console.log(`User language is: ${userLanguage}`)
  }

  /**
   * Helper function:
   *   1) Finds instructions in the string & returns them in the order they appear.
   *   2) Strips those instructions from the text, returning { textWithoutInstructions, instructions }.
   */
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

      // Grab the earliest instruction occurrence
      const earliest = indices.reduce((min, cur) => (cur.idx < min.idx ? cur : min))
      instructions.push(earliest.name)

      // Remove that occurrence from the text
      text =
        text.slice(0, earliest.idx) +
        text.slice(earliest.idx + earliest.name.length)
    }

    return {
      textWithoutInstructions: text.trim(),
      instructions,
    }
  }

  /**
   * Helper function to build a multi-line markdown prompt that keeps
   * the "instruction" and the "text" separated to avoid confusion.
   */
  function buildInstructionPrompt(instructionText, textToProcess) {
    // Derive a shorter label from instructionText
    // (e.g., if "instructionText" starts with "Rephrase...", just call it "Rephrase")
    let shortLabel = "Generic"
    if (instructionText.startsWith("Rewrite") || instructionText.startsWith("Rephrase")) {
      shortLabel = "Rephrase"
    } else if (instructionText.startsWith("Enrich") || instructionText.startsWith("Add")) {
      shortLabel = "Emoji"
    } else if (instructionText.startsWith("Most important,")) {
      shortLabel = "Responsive"
    } else if (instructionText.startsWith("Translate")) {
      shortLabel = "Translate"
    }

    // Return a structured markdown so the text is clearly separated
    return `## Function: ${shortLabel}
**Context**: ${instructionText}
**Prompt**: ${textToProcess}`
  }

  // Turn "children" into an array in case multiple items were passed
  const childArray = React.Children.toArray(children)

  // Process each child individually
  const processedOutputs = childArray.map((childContent, index) => {
    const childString = childContent.toString()

    // 1) Extract instructions & remove them from text
    const { textWithoutInstructions, instructions } = extractInstructionsFromString(childString)

    if (LOGS_ENABLED) {
      console.group(`Child #${index + 1} - Initial Parsing`)
      console.log("Initial text:", childString)
      console.log("Parsed text (without instructions):", textWithoutInstructions)
      console.log("Instructions order:", instructions)
      console.groupEnd()
    }

    let currentText = textWithoutInstructions

    // 2) Apply each instruction in turn
    instructions.forEach((instruction) => {
      // Bypass if user is English & instruction is TRANSLATE
      if (instruction === TRANSLATE && isEnglish) {
        if (LOGS_ENABLED) {
          console.log("Skipping TRANSLATE (user is English).")
        }
        return
      }

      // Bypass if not on XS screen & instruction is RESPONSIVE
      if (instruction === RESPONSIVE && !isXs) {
        if (LOGS_ENABLED) {
          console.log("Skipping RESPONSIVE (not on xs screen).")
        }
        return
      }

      // If it's a translate instruction, append the user language
      let finalInstruction = instruction
      if (instruction === TRANSLATE) {
        finalInstruction += ` ${userLanguage}`
      }

      // Build a dedicated markdown prompt (to keep instruction and text separate)
      const promptMarkdown = buildInstructionPrompt(finalInstruction, currentText)

      if (LOGS_ENABLED) {
        console.group(`Applying instruction: ${instruction}`)
        console.log("Input to usePollinationsText (markdown prompt):\n", promptMarkdown)
      }

      // Use the pollinations function
      const result = usePollinationsText(promptMarkdown) || currentText

      if (result.includes("HTTP error! status: 429")) {
        if (LOGS_ENABLED) {
          console.log("Rate limit error (429) => output replaced with 'Loading...'.")
        }
        currentText = "Loading..."
      } else {
        currentText = result
      }

      if (LOGS_ENABLED) {
        console.log("Output from usePollinationsText:", currentText)
        console.groupEnd()
      }
    })

    return currentText
  })

  // Combine all processed child outputs
  const finalOutput = processedOutputs.join("\n\n")
  if (LOGS_ENABLED) {
    console.log("Final Output after all children processed:", finalOutput)
  }

  // 3) Render the final result in Markdown
  return (
    <MarkDownStyle>
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
    </MarkDownStyle>
  )
}

const MarkDownStyle = styled.div`
  a {
    color: ${Colors.lime};
    text-decoration: none;
    &:hover {
      color: ${Colors.lime}90;
    }
  }
`
