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
} from "../config/copywrite.js"
import TextEmojiText from "../components/TextEmojiText.js"
import Grid from "@mui/material/Grid2" // v5 Grid2
import SectionTitle from "../components/SectionTitle.js"
import { Box } from "@mui/material"
import { GeneralButton } from "../components/GeneralButton.js"
import { TextRephraseTranslate } from "../components/TextRephraseTranslate.js"
import { ImageHeading } from "../components/ImageHeading.js"
import { CustomTooltip } from "../components/CustomTooltip.js" // Import CustomTooltip
import { ASCII_APP_TOOLTIP } from "../config/copywrite.js" // Define the tooltip text

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

  const communityPlatforms = [
    {
      imagePrompt: "Discord Community Logo",
      buttonClickHandler: handleDiscordButtonClick,
      cto: COMMUNITY_DISCORD_CTO,
      subtitle: COMMUNITY_DISCORD_SUBTITLE,
    },
    {
      imagePrompt: "GitHub Community Logo",
      buttonClickHandler: handleGithubButtonClick,
      cto: COMMUNITY_GITHUB_CTO,
      subtitle: COMMUNITY_GITHUB_SUBTITLE,
    },
  ]

  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
      <SectionSubContainer>
        <SectionTitle title={COMMUNITY_TITLE} color={Colors.offblack} />
      </SectionSubContainer>
      <SectionSubContainer>
        <TextEmojiText color={Colors.offblack} subtitle={COMMUNITY_SUBTITLE} />
      </SectionSubContainer>
      <SectionSubContainer>
        <Grid container spacing={4} justifyContent="space-between">
          {communityPlatforms.map((platform, index) => (
            <Grid key={index} size={{ xs: 6, md: 6 }}>
              <Grid
                container
                direction="column"
                gap={"1em"}
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
                  <Box
                    sx={{
                      borderRadius: "50%",
                      overflow: "hidden",
                      width: "200px",
                      height: "200px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ImageHeading
                      customPrompt={platform.imagePrompt}
                      width={250}
                      height={250}
                  >
                    {platform.imagePrompt}
                  </ImageHeading>
                  </Box>
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
                  }}
                >
                  <GeneralButton
                    handleClick={platform.buttonClickHandler}
                    isLoading={false}
                    backgroundColor={Colors.offwhite}
                    textColor={Colors.offblack}
                    borderColor={Colors.offblack}
                  >
                    <TextRephraseTranslate>{platform.cto}</TextRephraseTranslate>
                  </GeneralButton>
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
              maxWidth: "300px",
            }}
            onClick={handleAsciiArtClick}
          >
            <AsciiArtGenerator width={"100px"} />
            </Box>
          </SectionSubContainer>
        </CustomTooltip>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Community
