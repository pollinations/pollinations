import { NavLink } from "react-router-dom"
import { Box } from "@mui/material"
import { SocialLinks } from "../components/SocialLinks"
import { Colors, Fonts, SectionBG } from "../config/global"
import StyledLink from "../components/StyledLink"
import { SectionContainer } from "../components/SectionContainer"
import Grid from "@mui/material/Grid2"
import { FOOTER_INFO, FOOTER_TERMS_CONDITIONS_LINK } from "../config/copywrite"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import { trackEvent } from "../config/analytics" // Import trackEvent

const Footer = () => {
  const handleEmailLinkClick = (e) => {
    e.preventDefault()
    navigator.clipboard.writeText("hello@pollinations.ai").then(() => {})
    trackEvent({
      action: 'Email_Link_Click',
      category: 'User_Interactions',
      label: 'Footer_Email_Link',
      value: 1,
    })
  }

  const handleTermsLinkClick = () => {
    trackEvent({
      action: 'Terms_Link_Click',
      category: 'User_Interactions',
      label: 'Footer_Terms_Link',
      value: 1,
    })
  }

  return (
    <SectionContainer backgroundColor={SectionBG.footer}>
      <Box
        width="100%"
        display="flex"
        flexDirection={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        padding="1em"
        maxWidth="95%"
        gap="2em"
      >
        <Grid
          size={{ xs: 12, md: 6 }}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: { xs: "center", md: "flex-start" },
            gap: "2em",
          }}
        >
          <StyledLink
            isExternal
            onClick={handleEmailLinkClick}
            href="mailto:hello@pollinations.ai"
            sx={{ userSelect: "text" }}
          >
            <b>hello@pollinations.ai</b>
          </StyledLink>
          <SocialLinks medium gap="1em" invert />
        </Grid>
        <Grid
          size={{ xs: 12, md: 6 }}
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            marginTop: { xs: "1em", md: "0em" },
            alignItems: { xs: "center", md: "flex-end" },
            height: "100%",
            fontFamily: Fonts.title,
          }}
        >
          <StyledLink to="/terms" onClick={handleTermsLinkClick}>
            <LLMTextManipulator>{FOOTER_TERMS_CONDITIONS_LINK}</LLMTextManipulator>
          </StyledLink>
          <br />
          <LLMTextManipulator>{FOOTER_INFO}</LLMTextManipulator>
        </Grid>
      </Box>
    </SectionContainer>
  )
}

export default Footer
