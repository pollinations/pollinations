import { Colors } from "../config/global.js"
import AsciiArtGenerator from "../components/AsciiArtGenerator.js"
import { SectionContainer, SectionSubContainer } from "../components/SectionContainer.js"
import {
  COMMUNITY_SUBTITLE,
  COMMUNITY_DISCORD_CTO,
  COMMUNITY_TITLE,
  COMMUNITY_DISCORD_SUBTITLE,
  COMMUNITY_GITHUB_SUBTITLE,
  COMMUNITY_GITHUB_CTO,
  COMMUNITY_DISCORD_LOGO_PROMPT,
  COMMUNITY_GITHUB_LOGO_PROMPT,
  ASCII_APP_TOOLTIP,
} from "../config/copywrite.js"
import Grid from "@mui/material/Grid2" // v5 Grid2
import SectionTitle from "../components/SectionTitle.js"
import { SectionHeadlineStyle } from "../components/SectionContainer.js"
import { Box } from "@mui/material"
import { GeneralButton } from "../components/GeneralButton.js"
import { CustomTooltip } from "../components/CustomTooltip.js"
import { LLMTextManipulator } from "../components/LLMTextManipulator.js"
import { ICONS } from "../assets/icons/icons.js" // Import ICONS

const Community = () => {
  const handleDiscordButtonClick = (e) => {
    e.preventDefault()
    window.open("https://discord.gg/k9F7SyTgqn", "_blank")
  }

  const handleGithubButtonClick = (e) => {
    e.preventDefault()
    window.open("https://github.com/pollinations/pollinations", "_blank")
  }

  const handleAsciiArtClick = (e) => {
    e.preventDefault()
    window.open("https://pollinations.github.io/hive/main/llm-feedback/", "_blank")
  }

  // Helper function to return the proper icon for each platform
  const getPlatformIcon = (prompt) => {
    if (prompt === COMMUNITY_DISCORD_LOGO_PROMPT) {
      return ICONS.discord
    } else if (prompt === COMMUNITY_GITHUB_LOGO_PROMPT) {
      return ICONS.github
    }
    return ""
  }

  const communityPlatforms = [
    {
      imagePrompt: COMMUNITY_DISCORD_LOGO_PROMPT,
      buttonClickHandler: handleDiscordButtonClick,
      cto: COMMUNITY_DISCORD_CTO,
      subtitle: COMMUNITY_DISCORD_SUBTITLE,
    },
    {
      imagePrompt: COMMUNITY_GITHUB_LOGO_PROMPT,
      buttonClickHandler: handleGithubButtonClick,
      cto: COMMUNITY_GITHUB_CTO,
      subtitle: COMMUNITY_GITHUB_SUBTITLE,
    },
  ]

  return (
    <SectionContainer style={{ backgroundColor: Colors.lime }}>
      <SectionSubContainer>
        <SectionTitle title={COMMUNITY_TITLE} color={Colors.offblack} />
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionHeadlineStyle color={Colors.offblack}>
          <LLMTextManipulator>{COMMUNITY_SUBTITLE}</LLMTextManipulator>
        </SectionHeadlineStyle>
      </SectionSubContainer>
      <SectionSubContainer>
        <Grid container spacing={4} justifyContent="space-between">
          {communityPlatforms.map((platform, index) => (
            <Grid key={index} size={{ xs: 6, md: 6 }}>
              <Grid
                container
                direction="column"
                gap="1em"
                sx={{
                  borderRadius: "15px",
                  backgroundColor: "transparent",
                }}
              >
                <Grid
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                ></Grid>
                <Grid
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <GeneralButton
                    handleClick={platform.buttonClickHandler}
                    isLoading={false}
                    backgroundColor={Colors.offblack}
                    textColor={Colors.offwhite}
                    fontSize="1.8em"
                    borderColor={Colors.offwhite}
                  >
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 1024 1024"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ marginRight: "8px" }}
                    >
                      <path d={getPlatformIcon(platform.imagePrompt)} />
                    </svg>
                    <LLMTextManipulator>{platform.cto}</LLMTextManipulator>
                  </GeneralButton>
                </Grid>
                <Grid
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                  }}
                >
                  <SectionHeadlineStyle color={Colors.offblack} fontSize="1.2em">
                    <LLMTextManipulator>{platform.subtitle}</LLMTextManipulator>
                  </SectionHeadlineStyle>
                </Grid>
              </Grid>
            </Grid>
          ))}
        </Grid>
        <CustomTooltip title={ASCII_APP_TOOLTIP} interactive>
          <SectionSubContainer>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                maxWidth: "400px",
                
              }}
              onClick={handleAsciiArtClick}
            >
              <AsciiArtGenerator width="100px" style={{fontWeight: "bold"}} />
            </Box>
          </SectionSubContainer>
        </CustomTooltip>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Community
