import { Colors } from "../config/global.js"
import { ICONS } from "../assets/icons/icons.js"
import AsciiArtGenerator from "../components/AsciiArtGenerator.js"
import { SectionContainer, SectionSubContainer } from "../components/SectionContainer.js"
import {
  COMMUNITY_SUBTITLE,
  COMMUNITY_DISCORD_CTO,
  COMMUNITY_TITLE,
  COMMUNITY_DISCORD_SUBTITLE,
  COMMUNITY_GITHUB_SUBTITLE,
  COMMUNITY_GITHUB_CTO,
} from "../config/copywrite.js"
import TextEmojiText from "../components/TextEmojiText.js"
import Grid from "@mui/material/Grid2" // v5 Grid2
import SectionTitle from "../components/SectionTitle.js"

import TextEmojiButton from "../components/TextEmojiButton.js"

const Community = () => {
  const handleDiscordButtonClick = (e) => {
    e.preventDefault()
    window.open("https://discord.gg/k9F7SyTgqn", "_blank")
  }

  const handleGithubButtonClick = (e) => {
    e.preventDefault()
    window.open("https://github.com/pollinations/pollinations", "_blank")
  }

  const communityPlatforms = [
    {
      icon: ICONS.discord,
      buttonClickHandler: handleDiscordButtonClick,
      cto: COMMUNITY_DISCORD_CTO,
      subtitle: COMMUNITY_DISCORD_SUBTITLE,
    },
    {
      icon: ICONS.github,
      buttonClickHandler: handleGithubButtonClick,
      cto: COMMUNITY_GITHUB_CTO,
      subtitle: COMMUNITY_GITHUB_SUBTITLE,
    },
  ]

  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
      <SectionSubContainer>
        <SectionTitle title={COMMUNITY_TITLE} color={Colors.offblack} />
        <TextEmojiText color={Colors.offblack} subtitle={COMMUNITY_SUBTITLE} size="2em" />
        <Grid container spacing={8} justifyContent="center">
          {communityPlatforms.map((platform, index) => (
            <Grid key={index} size={{ xs: 12, md: 6 }}>
              <Grid
                container
                direction="column"
                sx={{
                  borderRadius: "15px",
                  backgroundColor: Colors.offwhite,
                }}
              >
                <Grid
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill={Colors.offblack}
                    viewBox="0 0 1024 1024"
                    style={{
                      height: "200px",
                      objectFit: "contain",
                    }}
                  >
                    <path d={platform.icon} />
                  </svg>
                </Grid>
                <Grid
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                <TextEmojiText
                  color={Colors.offblack}
                  subtitle={platform.subtitle}
                  size="1.5em"
                />
              </Grid>
                <Grid
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 2,
                  }}
                >
                  <TextEmojiButton
                    onClick={platform.buttonClickHandler}
                    subtitle={platform.cto}
                    textColor={Colors.offwhite}
                    textSize="1.3em"
                    backgroundColor={Colors.offblack}
                    textWeight={Colors.offwhite}
                  />
                </Grid>
              </Grid>

            </Grid>
          ))}
        </Grid>

        <AsciiArtGenerator width={"100px"} />
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Community
