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
import { useTheme, useMediaQuery } from "@mui/material"
import background from "../assets/background/Deep_sea_bioluminescent_city.webp"

const Community = () => {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.only("xs"))

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
  const getPlatformIcon = (platform) => {
    if (platform === "discord") {
      return ICONS.discord
    } else if (platform === "github") {
      return ICONS.github
    }
    return ""
  }

  const communityPlatforms = [
    {
      platform: "discord",
      buttonClickHandler: handleDiscordButtonClick,
      cto: COMMUNITY_DISCORD_CTO,
      subtitle: COMMUNITY_DISCORD_SUBTITLE,
    },
    {
      platform: "github",
      buttonClickHandler: handleGithubButtonClick,
      cto: COMMUNITY_GITHUB_CTO,
      subtitle: COMMUNITY_GITHUB_SUBTITLE,
    },
  ]

  return (
    <SectionContainer backgroundImage={background}>
      <SectionSubContainer>
        <SectionTitle title={COMMUNITY_TITLE} color={Colors.offwhite} />
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionHeadlineStyle color={Colors.offwhite}>
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
                    fontSize={isXs ? "1.5em" : "2.5em"}
                    borderColor={Colors.offwhite}
                  >
                    <svg
                      width={isXs ? "40" : "50"}
                      height={isXs ? "40" : "50"}
                      viewBox="0 0 1024 1024"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ marginRight: "8px" }}
                    >
                      <path d={getPlatformIcon(platform.platform)} />
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
                  <SectionHeadlineStyle color={Colors.offwhite} fontSize="1.2em">
                    <LLMTextManipulator>{platform.subtitle}</LLMTextManipulator>
                  </SectionHeadlineStyle>
                </Grid>
              </Grid>
            </Grid>
          ))}
        </Grid>
        <CustomTooltip
          title={<LLMTextManipulator>{ASCII_APP_TOOLTIP}</LLMTextManipulator>}
          interactive
        >
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
              <AsciiArtGenerator
                width="100px"
                style={{ fontWeight: "bold", color: Colors.offwhite }}
              />
            </Box>
          </SectionSubContainer>
        </CustomTooltip>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Community
