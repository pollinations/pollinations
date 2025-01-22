import { NavLink } from "react-router-dom"
import { Box } from "@mui/material"
import { SocialLinks } from "../components/SocialLinks"
import { Colors, Fonts, SectionBG } from "../config/global"
import StyledLink from "../components/StyledLink"
import { SectionContainer } from "../components/SectionContainer"
import Grid from "@mui/material/Grid2"
import { FOOTER_INFO } from "../config/copywrite"
import { LLMTextManipulator } from "../components/LLMTextManipulator"

const Footer = () => {
  return (
    <SectionContainer backgroundColor={SectionBG.footer}>
      <Box
        width="100%"
        display="flex"
        flexDirection={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        padding="1em"
        maxWidth="95%"
      >
        <Grid
          size={{ xs: 12, md: 6 }}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: { xs: "center", md: "flex-start" },
            gap: "1em",
          }}
        >
          <StyledLink
            isExternal
            onClick={(e) => {
              e.preventDefault()
              navigator.clipboard.writeText("hello@pollinations.ai").then(() => {})
            }}
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
            marginTop: "1em",
            alignItems: { xs: "center", md: "flex-end" },
            height: "100%",
            fontFamily: Fonts.parameter,
          }}
        >
          <StyledLink to="/terms">
            <b>TERMS & CONDITIONS </b>
          </StyledLink>
          <LLMTextManipulator>{FOOTER_INFO}</LLMTextManipulator>
        </Grid>
      </Box>
    </SectionContainer>
  )
}

export default Footer
