import React, { useEffect } from "react"
import { Colors, Fonts, SectionBG } from "../config/global"
import { GeneralButton } from "../components/GeneralButton"
import {
  SectionContainer,
  SectionSubContainer,
  SectionHeadlineStyle,
} from "../components/SectionContainer"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import { HERO_INTRO, HERO_CTO, HERO_GITHUB_LINK, HERO_DISCORD_LINK } from "../config/copywrite"
import { emojify, rephrase, noLink } from "../config/llmTransforms"
import Grid from "@mui/material/Grid2"
import { ICONS } from "../assets/icons/icons"
import { useMediaQuery } from "@mui/material"
import { useTheme } from "@mui/material/styles"
import { trackEvent } from "../config/analytics"
import { ReactSVG } from "react-svg"

const handleDiscordButtonClick = (e) => {
  e.preventDefault()
  // Track the click event
  trackEvent({
    action: 'click_discord',
    category: 'hero',
  })
  window.open("https://discord.gg/k9F7SyTgqn", "_blank")
}

const handleGithubButtonClick = (e) => {
  e.preventDefault()
  // Track the click event
  trackEvent({
    action: 'click_github',
    category: 'hero',
  })
  window.open("https://github.com/pollinations/pollinations", "_blank")
}

const handleEmailButtonClick = (e) => {
  e.preventDefault()
  // Track the click event
  trackEvent({
    action: 'click_email',
    category: 'hero',
  })
}

const Hero = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("md"))
  
  useEffect(() => {
    // Load Ko-fi widget script
    const script = document.createElement('script');
    script.src = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js';
    script.async = true;
    script.onload = () => {
      // Initialize Ko-fi widget after script is loaded
      window.kofiWidgetOverlay.draw('pollinationsai', {
        'type': 'floating-chat',
        'floating-chat.donateButton.text': 'Tip Us',
        'floating-chat.donateButton.background-color': '#d9534f',
        'floating-chat.donateButton.text-color': '#fff'
      });
    };
    document.body.appendChild(script);
    
    // Cleanup function to remove the script when component unmounts
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []); // Empty dependency array means this effect runs once on mount
  return (
    <SectionContainer backgroundConfig={SectionBG.hero}>
      {/* <SvgArtGenerator width="1920px" height="100px"></SvgArtGenerator> */}
      <SectionSubContainer>
        <SectionHeadlineStyle
          maxWidth="1000px"
          fontSize="1.8em"
          color={Colors.offblack}
          textAlign={isMobile ? "center" : "left"}
        >
          <LLMTextManipulator text={HERO_INTRO} transforms={[rephrase, emojify, noLink]} />
        </SectionHeadlineStyle>
      </SectionSubContainer>
      {/* <SvgArtGallery /> */}
      <SectionSubContainer>
        <Grid container spacing={2} justifyContent={isMobile ? "center" : "flex-end"} width="100%">
          <Grid size={12}>
            <SectionHeadlineStyle
              maxWidth="1000px"
              fontSize="1.5em"
              color={Colors.offblack}
              textAlign={isMobile ? "center" : "right"}
            >
              <LLMTextManipulator text={HERO_CTO} transforms={[rephrase, emojify, noLink]} />
            </SectionHeadlineStyle>
          </Grid>

          <Grid>
            <GeneralButton
              handleClick={handleDiscordButtonClick}
              isLoading={false}
              backgroundColor={Colors.offblack}
              textColor={Colors.offwhite}
              style={{
                fontSize: "1.5rem",
                fontFamily: Fonts.title,
                fontWeight: 600,
              }}
            >
              <ReactSVG
                src={ICONS.discord}
                beforeInjection={(svg) => {
                  svg.setAttribute("fill", Colors.offwhite)
                }}
                style={{
                  width: "40px",
                  height: "40px",
                  marginRight: "8px",
                  background: "transparent",
                }}
              />
              <LLMTextManipulator text={HERO_DISCORD_LINK} transforms={[noLink]} />
            </GeneralButton>
          </Grid>
          <Grid>
            <GeneralButton
              handleClick={handleGithubButtonClick}
              isLoading={false}
              backgroundColor={Colors.offblack}
              textColor={Colors.offwhite}
              style={{
                fontSize: "1.5rem",
                fontFamily: Fonts.title,
                fontWeight: 600,
              }}
            >
              <ReactSVG
                src={ICONS.github}
                beforeInjection={(svg) => {
                  svg.setAttribute("fill", Colors.offwhite)
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  marginRight: "8px",
                  background: "transparent",
                }}
              />
              {HERO_GITHUB_LINK}
            </GeneralButton>
          </Grid>
        </Grid>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Hero
