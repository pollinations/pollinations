import React from "react"
import { Colors, Fonts, SectionBG } from "../config/global"
import { GeneralButton } from "../components/GeneralButton"
import {
  SectionContainer,
  SectionSubContainer,
  SectionHeadlineStyle,
} from "../components/SectionContainer"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import {
  HERO_INTRO,
  HERO_CTO,
  HERO_EMAIL_BUTTON,
  HERO_GITHUB_LINK,
  HERO_DISCORD_LINK,
} from "../config/copywrite"
import Grid from "@mui/material/Grid2"
import { ICONS } from "../assets/icons/icons" // Import the ICONS
import ContentCopyIcon from "@mui/icons-material/ContentCopy" // Import the Material UI copy icon
import SvgArtGallery from "../components/SvgArtGallery"
import SvgArtGenerator from "../components/SvgArtGenerator"
import { useMediaQuery } from "@mui/material"
import { useTheme } from "@mui/material/styles"

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
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("md"))
  return (
    <SectionContainer backgroundConfig={SectionBG.hero}>
      <SvgArtGenerator width="1920px" height="100px"></SvgArtGenerator>
      <SectionSubContainer>
        <SectionHeadlineStyle
          fontSize="1.5em"
          color={Colors.offblack}
          textAlign={{ xs: "center", md: "left" }}
        >
          <LLMTextManipulator>{HERO_INTRO}</LLMTextManipulator>
        </SectionHeadlineStyle>
      </SectionSubContainer>
      {/* <SvgArtGallery /> */}
      <SectionSubContainer>
        <Grid container spacing={2} justifyContent={isMobile ? "center" : "flex-end"}>
          <Grid size={12}>
            <SectionHeadlineStyle fontSize="1.5em" color={Colors.offblack} textAlign={isMobile ? "center" : "right"}>
              <LLMTextManipulator>{HERO_CTO}</LLMTextManipulator>
            </SectionHeadlineStyle>
          </Grid>
          <Grid>
            <GeneralButton
              handleClick={handleEmailButtonClick}
              isLoading={false}
              backgroundColor={Colors.offblack}
              textColor={Colors.offwhite}
              style={{
                fontSize: "1.5rem",
                fontFamily: Fonts.parameter,
                fontWeight: 600,
              }}
            >
              <ContentCopyIcon style={{ marginRight: "8px" }} />
              <LLMTextManipulator>{HERO_EMAIL_BUTTON}</LLMTextManipulator>
            </GeneralButton>
          </Grid>
          <Grid>
            <GeneralButton
              handleClick={handleDiscordButtonClick}
              isLoading={false}
              backgroundColor={Colors.offblack}
              textColor={Colors.offwhite}
              style={{
                fontSize: "1.5rem",
                fontFamily: Fonts.parameter,
                fontWeight: 600,
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
              <LLMTextManipulator>{HERO_DISCORD_LINK}</LLMTextManipulator>
            </GeneralButton>
          </Grid>
          <Grid>
            <GeneralButton
              handleClick={handleGithubButtonClick}
              isLoading={false}
              backgroundColor={Colors.offblack}
              textColor={Colors.offwhite}
              style={{
                width: "100%",
                fontSize: "1.5rem",
                fontFamily: Fonts.parameter,
                fontWeight: 600,
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
              <LLMTextManipulator>{HERO_GITHUB_LINK}</LLMTextManipulator>
            </GeneralButton>
          </Grid>
        </Grid>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Hero
