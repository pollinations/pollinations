import { NavLink } from "react-router-dom"
import { Box } from "@mui/material"
import { SocialLinks } from "../components/SocialLinks"
import { Colors } from "../config/global"
import StyledLink from "../components/StyledLink"
import { SectionContainer } from "../components/SectionContainer"
import Grid from "@mui/material/Grid2"
import TextEmojiText from "../components/SectionTitle"
import { FOOTER_INFO } from "../config/copywrite"

const Footer = () => {
  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
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
            marginTop: "1em",
            alignItems: { xs: "center", md: "flex-end" },
          }}
        >
          <StyledLink to="/terms" component={NavLink}>
            <b>TERMS & CONDITIONS </b>
          </StyledLink>
          <TextEmojiText subtitle={FOOTER_INFO} color={Colors.offblack} size="10em" />
        </Grid>
      </Box>
    </SectionContainer>
  )
}

export default Footer
