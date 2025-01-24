import React, { useState, useEffect } from "react"
import { usePollinationsText } from "@pollinations/react"
import ReactMarkdown from "react-markdown"
import { useTheme, useMediaQuery } from "@mui/material"
import { REPHRASE, EMOJI, RESPONSIVE, TRANSLATE } from "../config/copywrite"
import { Colors } from "../config/global"
import styled from "@emotion/styled"

/**
 * For this component, we avoid multiple hook calls in a loop. Instead,
 * we combine all text/instructions into a single prompt string and make
 * one call to usePollinationsText, preventing the invalid hook usage.
 * We only show the final transformed text after the entire process.
 * Until processing is complete, we show an animated "Generating..."
 */

function AnimatedDots() {
  const [dotCount, setDotCount] = useState(1)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((count) => (count % 3) + 1)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return <span>{".".repeat(dotCount)}</span>
}

export function LLMTextManipulator({ children }) {
  const LOGS_ENABLED = false // Change this flag to enable/disable logs

  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.only("xs"))
  const userLanguage = navigator.language || navigator.userLanguage
  const isEnglish = userLanguage.startsWith("en")

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
   * We build a single prompt that processes each child’s text/instructions
   * sequentially. We ask pollinations to do all transformations internally
   * and only return the final output.
   */
  function buildAggregatedPrompt(childArray) {
    let promptParts = []

    childArray.forEach((childContent, index) => {
      const childString = childContent.toString()
      const { textWithoutInstructions, instructions } = extractInstructionsFromString(childString)

      // Filter out instructions that we'll skip
      const relevantInstructions = instructions.filter(instruction => {
        if (instruction === TRANSLATE && isEnglish) {
          return false
        }
        if (instruction === RESPONSIVE && !isXs) {
          return false
        }
        return true
      })

      if (LOGS_ENABLED) {
        console.group(`Child #${index + 1}`)
        console.log("Original text:", childString)
        console.log("Parsed text (no instructions):", textWithoutInstructions)
        console.log("All extracted instructions:", instructions)
        console.log("Relevant instructions (after skipping):", relevantInstructions)
        console.groupEnd()
      }

      // If there's nothing to transform, just pass the text as-is
      if (relevantInstructions.length === 0) {
        promptParts.push(
          `**Child #${index + 1}**\nNo transformations.\nFinal Text:\n${textWithoutInstructions}`
        )
        return
      }

      // If translation is present, we append user language
      // (In a single aggregated approach, we just mention it)
      const instructionDescriptions = relevantInstructions.map(instr => {
        return instr === TRANSLATE ? `${instr} ${userLanguage}` : instr
      })

      promptParts.push(
        `**Child #${index + 1}**\n` +
          `Original Text:\n${textWithoutInstructions}\n\n` +
          `Instructions (in order): ${instructionDescriptions.join(", ")}\n` +
          `Please apply them sequentially and return only the final result.\n`
      )
    })

    return (
      `You are a text transformer. For each 'Child' section below, apply the listed instructions in sequence.\n` +
      `After applying all specified transformations for each child, return that child's final text.\n\n` +
      promptParts.join("\n\n") +
      `\n\n---\nReturn only the final output for all children in order.\n`
    )
  }

  // 1) Convert children into an array
  const childArray = React.Children.toArray(children)

  // 2) Build one aggregated prompt for all children
  const aggregatedPrompt = buildAggregatedPrompt(childArray)

  // 3) Fetch the final output at once
  const finalOutput = usePollinationsText(aggregatedPrompt)

  if (LOGS_ENABLED) {
    console.log("Aggregated prompt sent to pollinations:\n", aggregatedPrompt)
    console.log("Pollinations output:\n", finalOutput)
  }

  // 4) Render the final result only after pollinations returns a non-empty, non-429 error text
  const isRateLimited = finalOutput && finalOutput.includes("HTTP error! status: 429")
  if (!finalOutput || isRateLimited) {
    return (
      <MarkDownStyle>
        Generating<AnimatedDots />
      </MarkDownStyle>
    )
  }

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

