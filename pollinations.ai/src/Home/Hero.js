import React from "react"
import { Box, Typography } from "@mui/material"
import { Colors, Fonts } from "../config/global"
import { GeneralButton } from "../components/GeneralButton"
import { TextRephraseTranslate } from "../components/TextRephraseTranslate"
import { SectionContainer, SectionSubContainer } from "../components/SectionContainer"
import TextEmojiText from "../components/TextEmojiText"
import {
  HERO_INTRO,
  HERO_CTO,
  HERO_EMAIL_BUTTON,
  HERO_GITHUB_LINK,
  HERO_DISCORD_LINK,
} from "../config/copywrite"
import Grid from "@mui/material/Grid2"
import { ICONS } from "../assets/icons/icons" // Import the ICONS

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
            fontFamily: Fonts.headline,
            fontSize: { xs: "20px", sm: "24px" },
            color: Colors.offblack,
            textAlign: { xs: "center", sm: "left" },
            maxWidth: "90%",
          }}
        >
          <TextRephraseTranslate>{HERO_INTRO}</TextRephraseTranslate>
        </Typography>
      </SectionSubContainer>
      <SectionSubContainer>
        <Box
          display="flex"
          flexDirection="column"
          alignItems={{ xs: "center", sm: "flex-end" }}
          width="100%"
          gap="1em"
          maxWidth="90%"
        >
          <TextEmojiText subtitle={HERO_CTO} color={Colors.offblack} size="2em" />
          <Grid container spacing={2} justifyContent={{ xs: "center", md: "flex-end" }}>
            <Grid>
              <GeneralButton
                handleClick={handleEmailButtonClick}
                isLoading={false}
                borderColor={Colors.offblack}
                backgroundColor={`${Colors.offblack}100`}
                textColor={Colors.offblack}
                style={{
                  width: "100%",
                  fontSize: "1.5rem",
                  fontFamily: Fonts.body,
                  fontWeight: 600,
                }}
              >
                <TextRephraseTranslate>{HERO_EMAIL_BUTTON}</TextRephraseTranslate>
              </GeneralButton>
            </Grid>
            <Grid>
              <GeneralButton
                handleClick={handleDiscordButtonClick}
                isLoading={false}
                borderColor={Colors.offblack}
                backgroundColor={`${Colors.offblack}100`}
                textColor={Colors.offblack}
                style={{
                  width: "100%",
                  fontSize: "1.5rem",
                  fontFamily: Fonts.body, 
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 1024 1024"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ marginRight: "8px" }}
                >
                  <path d={ICONS.discord} />
                </svg>
                {HERO_DISCORD_LINK}
              </GeneralButton>
            </Grid>
            <Grid>
              <GeneralButton
                handleClick={handleGithubButtonClick}
                isLoading={false}
                borderColor={Colors.offblack}
                backgroundColor={`${Colors.offblack}100`}
                textColor={Colors.offblack}
                style={{
                  width: "100%",
                  fontSize: "1.5rem",
                  fontFamily: Fonts.body,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 1024 1024"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ marginRight: "8px" }}
                >
                  <path d={ICONS.github} />
                </svg>
                {HERO_GITHUB_LINK}
              </GeneralButton>
            </Grid>
          </Grid>
        </Box>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Hero
