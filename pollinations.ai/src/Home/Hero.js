import React from "react"
import { Box, Typography } from "@mui/material"
import { Colors } from "../config/global"
import { EmojiRephrase } from "../components/EmojiRephrase"
import { SectionContainer, SectionSubContainer } from "../components/SectionContainer"
import SectionSubtitle from "../components/SectionSubtitle"
import {
  HERO_INTRO,
  HERO_CTO,
  HERO_EMAIL_BUTTON,
  HERO_GITHUB_LINK,
  HERO_DISCORD_LINK,
} from "../config/copywrite"
import TextEmojiButton from "../components/TextEmojiButton"
import Grid from "@mui/material/Grid2"

const handleDiscordButtonClick = (e) => {
  e.preventDefault()
  window.open("https://discord.gg/k9F7SyTgqn", "_blank")
}

const handleGithubButtonClick = (e) => {
  e.preventDefault()
  window.open("https://github.com/pollinations/pollinations", "_blank")
}

const handleEmailButtonClick = (e) => {
  e.preventDefault()
  const email = "hello@pollinations.ai"
  navigator.clipboard.writeText(email).then(() => {
    console.log(`Copied to clipboard: ${email}`)
  })
}

const Hero = () => {
  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
      <SectionSubContainer>
        <Typography
          component="div"
          sx={{
            userSelect: "none",
            fontFamily: "Uncut-Sans-Variable, sans-serif",
            fontSize: { xs: "28px", sm: "32px" },
            color: Colors.offblack,
            textAlign: { xs: "center", sm: "left" },
            maxWidth: "90%",
            paddingBottom: "1em",
            paddingTop: "1em",
          }}
        >
          <EmojiRephrase>{HERO_INTRO}</EmojiRephrase>
        </Typography>
        <Box
          display="flex"
          flexDirection="column"
          alignItems={{ xs: "center", sm: "flex-end" }}
          width="100%"
          gap="1em"
          maxWidth="90%"
        >
          <SectionSubtitle subtitle={HERO_CTO} color={Colors.offblack} size="3em" />
          <Grid container spacing={2}>
            <Grid>
              <TextEmojiButton
                subtitle={HERO_EMAIL_BUTTON}
                onClick={handleEmailButtonClick}
                textColor={Colors.offblack}
                textSize="2em"
                backgroundColor={Colors.lime}
              />
            </Grid>
            <Grid>
              <TextEmojiButton
                subtitle={HERO_GITHUB_LINK}
                onClick={handleGithubButtonClick}
                textColor={Colors.offblack}
                textSize="2em"
                backgroundColor={Colors.lime}
              />
            </Grid>
            <Grid>
              <TextEmojiButton
                subtitle={HERO_DISCORD_LINK}
                onClick={handleDiscordButtonClick}
                textColor={Colors.offblack}
                textSize="2em"
                backgroundColor={Colors.lime}
              />
            </Grid>
          </Grid>
        </Box>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Hero
