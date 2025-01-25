import React, { useState, useEffect } from "react"
import { usePollinationsText } from "@pollinations/react"
import ReactMarkdown from "react-markdown"
import styled from "@emotion/styled"
import { useTheme, useMediaQuery } from "@mui/material"
import { Colors } from "../config/global"


// function AnimatedDots() {
//   const [dotCount, setDotCount] = useState(1)
  
//   useEffect(() => {
//     const interval = setInterval(() => {
//       setDotCount((count) => (count % 3) + 1)
//     }, 500)
//     return () => clearInterval(interval)
//   }, [])

//   return <span>{".".repeat(dotCount)}</span>
// }

export function LLMTextManipulator({ text }) {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.only("xs"))
  const userLanguage = navigator.language || navigator.userLanguage

  const prompt = typeof text === "function" ? text({ isXs, userLanguage }) : null;
  const transformedText = usePollinationsText(prompt) || text;

  if (!transformedText) {
    return (
      <span>
        Generating...
      </span>
    )
  }

  return (
    <MarkDownStyle>
      <ReactMarkdown>{transformedText}</ReactMarkdown>
    </MarkDownStyle>
  )
}

const MarkDownStyle = styled.div`
  a {
    color: ${Colors.lime};
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
  p {
    margin: 0;
  }
`
