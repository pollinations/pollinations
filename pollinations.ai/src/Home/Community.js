 // Start of Selection
/* 
  Below is the requested code rewrite of the selection. 
  The height and width were not being applied because they were incorrectly captured 
  in the .map callback's parameter list rather than accessed from the platform object.
*/

import { Colors, Fonts } from "../config/global.js"
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
import { SectionBG } from "../config/global"
import { trackEvent } from "../config/analytics.js" // Import trackEvent
import { ReactSVG } from "react-svg"

const Community = () => {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.only("xs"))

  const handleDiscordButtonClick = (e) => {
    e.preventDefault()
    trackEvent({
      action: 'Discord_Click',
      category: 'User_Interactions',
      label: 'Community_Discord_Button',
      value: 1,
    })
    window.open("https://discord.gg/k9F7SyTgqn", "_blank")
  }

  const handleGithubButtonClick = (e) => {
    e.preventDefault()
    trackEvent({
      action: 'Github_Click',
      category: 'User_Interactions',
      label: 'Community_Github_Button',
      value: 1,
    })
    window.open("https://github.com/pollinations/pollinations", "_blank")
  }

  const handleAsciiArtClick = (e) => {
    e.preventDefault()
    trackEvent({
      action: 'AsciiArt_Click',
      category: 'User_Interactions',
      label: 'Community_AsciiArt_Button',
      value: 1,
    })
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
      height: "50px",
      width: "50px",
    },
    {
      platform: "github",
      buttonClickHandler: handleGithubButtonClick,
      cto: COMMUNITY_GITHUB_CTO,
      subtitle: COMMUNITY_GITHUB_SUBTITLE,
      height: "40px",
      width: "40px",
    },
  ]

  return (
    <SectionContainer backgroundConfig={SectionBG.community}>
      <SectionSubContainer>
        <SectionTitle title={COMMUNITY_TITLE} color={Colors.lime} />
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
                    style={{ fontFamily: Fonts.title }}
                  >
                    <ReactSVG
                      src={getPlatformIcon(platform.platform)}
                      beforeInjection={(svg) => {
                        svg.setAttribute("fill", Colors.offwhite)
                      }}
                      style={{
                        width: platform.width,
                        height: platform.height,
                        marginRight: "0.5em",
                        background: "transparent",
                        lineHeight: "0em",
                      }}
                    />
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
                  <SectionHeadlineStyle color={Colors.offwhite} fontSize="1.2em" >
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
