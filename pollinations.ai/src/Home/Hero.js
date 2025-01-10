import React from "react"
import { Box, Typography } from "@mui/material"
import { Colors } from "../config/global"
import ReactMarkdown from "react-markdown"
import useRandomSeed from "../hooks/useRandomSeed"
import { EmojiRephrase } from "../components/EmojiRephrase"
import useResponsivePollinationsText from "../hooks/useResponsivePollinationsText"
import PromptTooltip from "../components/PromptTooltip"
import { SectionContainer } from "../config/style"
import CopyEmailButton from "../components/CopyEmailButton"

const Hero = () => {
  const seed = useRandomSeed()
  const prompt =
    "Shortly introduce our open-source platform that provides easy-to-use text and image generation APIs. It requires no sign-ups or API keys, prioritizing user privacy and anonymity. In one sentence. Format with emojis. Use italics and bold to make the text more engaging."
  const markdownText = useResponsivePollinationsText(prompt, { seed })

  return (
    <SectionContainer
      style={{
        background: `linear-gradient(to top, ${Colors.gray2}, ${Colors.offwhite})`,
      }}
    >
      <Box
        maxWidth="1000px"
        marginX="auto"
        textAlign={{ xs: "center", sm: "left" }}
        marginTop="3em"
        width="90%"
      >
        <Typography
          sx={{
            userSelect: "none",
            fontFamily: "Uncut-Sans-Variable, sans-serif",
            fontStyle: "normal",
            lineHeight: "40px",
            fontSize: { xs: "32px", sm: "36px" },
            color: Colors.offblack,
          }}
        >
          <PromptTooltip title={prompt} seed={seed}>
            <ReactMarkdown>{markdownText}</ReactMarkdown>
          </PromptTooltip>
        </Typography>
      </Box>
      <Box
        maxWidth="1000px"
        marginX="auto"
        textAlign={{ xs: "center", sm: "right" }}
        marginBottom="1em"
        width="90%"
      >
        <Typography
          sx={{
            userSelect: "none",
            fontFamily: "Uncut-Sans-Variable, sans-serif",
            fontStyle: "normal",
            lineHeight: "40px",
            fontSize: { xs: "24px", sm: "24px" },
            color: Colors.offblack,
          }}
        >
          <EmojiRephrase>Talk to us, reach out</EmojiRephrase>
        </Typography>
      </Box>
      <Box
        maxWidth="1000px"
        marginX="auto"
        textAlign={{ xs: "center", sm: "right" }}
        marginBottom="5em"
        width="90%"

      >
        <CopyEmailButton />
      </Box>
    </SectionContainer>
  )
}

export default Hero
