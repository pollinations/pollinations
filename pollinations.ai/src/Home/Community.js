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
import FollowLinkButton from "../components/FollowLinkButton.js"
import TextEmojiButton from "../components/TextEmojiButton.js"
const Discord = () => {
  const handleDiscordButtonClick = (e) => {
    e.preventDefault()
    window.open("https://discord.gg/k9F7SyTgqn", "_blank")
  }

  const handleGithubButtonClick = (e) => {
    e.preventDefault()
    window.open("https://github.com/pollinations/pollinations", "_blank")
  }

  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
      <SectionSubContainer>
        <SectionTitle title={COMMUNITY_TITLE} color={Colors.offblack} />
        <TextEmojiText color={Colors.offblack} subtitle={COMMUNITY_SUBTITLE} size="2em" />
        <Grid container spacing={4} justifyContent="center">
          {/* === DISCORD BOX === */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Grid
              container
              direction="column"
              sx={{
                borderRadius: "15px",
                backgroundColor: Colors.offblack,
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
                  fill={Colors.offwhite}
                  viewBox="0 0 1024 1024"
                  style={{
                    height: "200px",
                    objectFit: "contain",
                  }}
                >
                  <path d={ICONS.discord} />
                </svg>
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
                  onClick={handleDiscordButtonClick}
                  subtitle={COMMUNITY_DISCORD_CTO}
                  textColor={Colors.offblack}
                  textSize="1.3em"
                  backgroundColor={Colors.offwhite}
                  textWeight={Colors.offblack}
                />
              </Grid>
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
                subtitle={COMMUNITY_DISCORD_SUBTITLE}
                size="1.5em"
              />
            </Grid>
          </Grid>

          {/* === GITHUB BOX === */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Grid
              container
              direction="column"
              sx={{
                borderRadius: "15px",
                backgroundColor: Colors.offblack,
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
                  fill={Colors.offwhite}
                  viewBox="0 0 1024 1024"
                  style={{
                    height: "200px",
                    objectFit: "contain",
                  }}
                >
                  <path d={ICONS.github} />
                </svg>
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
                  onClick={handleGithubButtonClick}
                  subtitle={COMMUNITY_GITHUB_CTO}
                  textColor={Colors.offblack}
                  textSize="1.3em"
                  backgroundColor={Colors.offwhite}
                  textWeight={Colors.offblack}
                />
              </Grid>
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
                subtitle={COMMUNITY_GITHUB_SUBTITLE}
                size="1.5em"
              />
            </Grid>
          </Grid>
        </Grid>

        <AsciiArtGenerator width={"100px"} />
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Discord
