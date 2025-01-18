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
            fontSize: { xs: "28px", sm: "32px" },
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
                  fontSize: "1.8rem",
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
                  fontSize: "1.8rem",
                  fontFamily: Fonts.body,
                  fontWeight: 600,
                }}
              >
                <TextRephraseTranslate>{HERO_DISCORD_LINK}</TextRephraseTranslate>
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
                  fontSize: "1.8rem",
                  fontFamily: Fonts.body,
                  fontWeight: 600,
                }}
              >
                <TextRephraseTranslate>{HERO_GITHUB_LINK}</TextRephraseTranslate>
              </GeneralButton>
            </Grid>
          </Grid>
        </Box>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Hero
