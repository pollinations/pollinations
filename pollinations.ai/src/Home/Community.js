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
import SectionSubtitle from "../components/SectionSubtitle.js"
import Grid from "@mui/material/Grid2" // v5 Grid2
import Box from "@mui/material/Box"
import SectionTitle from "../components/SectionTitle.js"
import FollowLinkButton from "../components/FollowLinkButton.js"

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
        <SectionSubtitle color={Colors.offblack} subtitle={COMMUNITY_SUBTITLE} size="2em" />

        {/* Main row: Box1 (Discord) and Box2 (GitHub) */}
        <Grid container spacing={4}>
          {/* === DISCORD BOX === */}
          <Grid size={{ xs: 12, md: 6 }}>
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
                    height: "250px",
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
                <FollowLinkButton
                  onClick={handleDiscordButtonClick}
                  subtitle={COMMUNITY_DISCORD_CTO}
                />
              </Grid>
            </Grid>
            <Grid
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                mt: 3,
              }}
            >
              <SectionSubtitle
                color={Colors.offblack}
                subtitle={COMMUNITY_DISCORD_SUBTITLE}
                size="1.5em"
              />
            </Grid>
          </Grid>

          {/* === DISCORD BOX === */}
          <Grid size={{ xs: 12, md: 6 }}>
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
                    height: "250px",
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
                <FollowLinkButton
                  onClick={handleGithubButtonClick}
                  subtitle={COMMUNITY_GITHUB_CTO}
                />
              </Grid>
            </Grid>
            <Grid
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                mt: 3,
              }}
            >
              <SectionSubtitle
                color={Colors.offblack}
                subtitle={COMMUNITY_GITHUB_SUBTITLE}
                size="1.5em"
              />
            </Grid>
          </Grid>
        </Grid>

        <AsciiArtGenerator width={"100px"}  />
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Discord
