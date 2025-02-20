import React, { useState } from "react"
import styled from "@emotion/styled" // Added to style our ReactSVG icon
import { Box, useTheme, Popover, IconButton } from "@mui/material"
import { SectionBG, Colors, Fonts } from "../config/global"
import { SectionContainer } from "../components/SectionContainer"
import { NavLink } from "react-router-dom"
import { SocialLinks } from "../components/SocialLinks"
import { ReactComponent as PollinationsLogo } from "../assets/logo/logo-text.svg"
import { ReactComponent as LogoIconBlack } from "../assets/logo/logo-icon-black.svg"
import { useMediaQuery } from "@mui/material"
import { trackEvent } from "../config/analytics"
import { GeneralButton } from "../components/GeneralButton"
import { ICONS } from "../assets/icons/icons" // Import the ICONS map
import InfoIcon from "@mui/icons-material/Info"
import { ReactSVG } from "react-svg"

// Styled icon component to control fill color
const AboutUsIcon = styled(ReactSVG)(() => ({
  width: "20px",
  height: "20px",
  marginRight: "0.5em",
  "& svg": {
    fill: Colors.offwhite,
  },
}))

const Header = () => {
  const theme = useTheme() // Use the useTheme hook to access the theme
  const isMobile = useMediaQuery(theme.breakpoints.down("md"))
  const [anchorEl, setAnchorEl] = useState(null)

  const handleNavLinkClick = () => {
    trackEvent({
      action: "click_logo",
      category: "header",
    })
  }

  const handleAboutUsClick = (e) => {
    e.preventDefault()
    trackEvent({
      action: "click_linkedin",
      category: "header",
    })
    window.open("https://www.linkedin.com/company/pollinations-ai", "_blank")
  }

  const open = Boolean(anchorEl)

  return (
    <SectionContainer backgroundConfig={SectionBG.header}>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column-reverse", md: "row" },
          alignItems: "center",
          gap: "2em",
          justifyContent: { xs: "center", md: "space-between" },
          width: "100%",
          position: "relative",
          paddingBottom: "2em",
        }}
      >
        <NavLink
          to="/"
          onClick={handleNavLinkClick}
          style={{
            textDecoration: "none",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column-reverse", md: "row" },
              alignItems: "center",
            }}
          >
            <LogoIconBlack
              style={{
                width: isMobile ? "50px" : "60px",
                height: isMobile ? "50px" : "60px",
                marginRight: isMobile ? "0em" : "1em",
              }}
            />
            <PollinationsLogo
              style={{
                width: isMobile ? "300px" : "350px",
                height: isMobile ? "auto" : "auto",
                marginBottom: isMobile ? "1em" : "0em",
              }}
            />
          </Box>
        </NavLink>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
          }}
        >
          <GeneralButton
            handleClick={handleAboutUsClick}
            isLoading={false}
            backgroundColor={Colors.offblack}
            textColor={Colors.offwhite}
            style={{
              fontSize: "1em",
              fontFamily: Fonts.title,
              fontWeight: 600,
              marginRight: "1em",
              borderRadius: "3em",
              height: "40px",
              minHeight: "40px",
              display: "flex",
              alignItems: "center",
              minWidth: "150px",
            }}
          >
            <AboutUsIcon src={ICONS.linkedin} wrapper="span" aria-label="linkedin-icon" />
            About Us
          </GeneralButton>
          <SocialLinks medium gap="1em" invert location="header" />
        </Box>
      </Box>
    </SectionContainer>
  )
}

export default Header
