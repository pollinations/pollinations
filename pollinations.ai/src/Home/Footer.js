import { Box } from "@mui/material"
import { SocialLinks } from "../components/SocialLinks"
import { Fonts, SectionBG } from "../config/global"
import StyledLink from "../components/StyledLink"
import { SectionContainer } from "../components/SectionContainer"
import Grid from "@mui/material/Grid2"
import { FOOTER_INFO, FOOTER_TERMS_CONDITIONS_LINK } from "../config/copywrite"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import { trackEvent } from "../config/analytics"
import { useTheme } from "@mui/material/styles"
import { useMediaQuery } from "@mui/material"

const Footer = () => {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.only("xs"))
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
    <SectionContainer backgroundConfig={SectionBG.footer}>
      <Box
        width="100%"
        display="flex"
        flexDirection={isXs ? "column" : "row"}
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
            alignItems: isXs ? "center" : "flex-start",
            gap: "1em",
            fontSize: "1.5em",
            fontFamily: Fonts.title,
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
          <SocialLinks gap="1em" />
        </Grid>
        <Grid
          size={{ xs: 12, md: 6 }}
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            marginTop: isXs ? "1em" : "0em",
            alignItems: isXs ? "center" : "flex-end",
            fontFamily: Fonts.title,
          }}
        >
          <Box height="100%" sx={{ fontSize: "1.5em" }} >
            <StyledLink to="/terms" onClick={handleTermsLinkClick}>
              <LLMTextManipulator text={FOOTER_TERMS_CONDITIONS_LINK} />
            </StyledLink>
          </Box>
          <Box sx={{ fontSize: "1.2em" }}>
            <LLMTextManipulator text={FOOTER_INFO} />
          </Box>
        </Grid>
      </Box>
    </SectionContainer>
  )
}

export default Footer
