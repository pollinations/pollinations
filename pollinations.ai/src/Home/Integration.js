import React from "react"
import { Grid, Box, useMediaQuery, Typography } from "@material-ui/core"
import { Colors } from "../config/global"
import { CodeExamples } from "../components/CodeExamples"
import { EmojiRephrase } from "../components/EmojiRephrase"
import { SectionContainer } from "../config/style"
import { GenerativeImageURLContainer } from "../components/ImageHeading"

export const Integration = ({ image }) => {
  const isMobile = useMediaQuery(`(max-width:768px)`)

  return (
    <SectionContainer
      style={{
        background: `linear-gradient(to bottom, ${Colors.offblack}, ${Colors.offblack2})`,
      }}
    >
      <GenerativeImageURLContainer>
        <Typography
          variant="h1"
          style={{
            color: Colors.lime,
            fontSize: isMobile ? "4em" : "8em",
            fontWeight: "bold",
            textAlign: "center",
            userSelect: "none",
            letterSpacing: "0.1em",
          }}
        >
          Integrate
        </Typography>
        <Typography
          style={{
            color: Colors.offwhite,
            fontSize: "1.5em",
            margin: "0 auto",
            marginTop: "1em",
            textAlign: "center",
            maxWidth: "750px",
          }}
        >
          <EmojiRephrase>
            Discover how to seamlessly integrate our free image and text generation API into your
            projects. Below are code examples to help you get started.
          </EmojiRephrase>
        </Typography>
        <Box style={{ width: "100%", marginTop: "2em", marginBottom: "4em" }}>
          <CodeExamples image={image} />
        </Box>
      </GenerativeImageURLContainer>
    </SectionContainer>
  )
}
