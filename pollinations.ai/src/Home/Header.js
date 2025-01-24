import React from "react"
import { Box, useTheme } from "@mui/material"
import { SectionBG } from "../config/global"
import { SectionContainer } from "../components/SectionContainer"
import { NavLink } from "react-router-dom"
import { SocialLinks } from "../components/SocialLinks"
import { ReactComponent as PollinationsLogo } from "../assets/logo/logo-text.svg"
import { ReactComponent as LogoIconBlack } from "../assets/logo/logo-icon-black.svg"
import { useMediaQuery } from "@mui/material"
import { trackEvent } from "../config/analytics"

const Header = () => {
  const theme = useTheme() // Use the useTheme hook to access the theme
  const isMobile = useMediaQuery(theme.breakpoints.down("md"))

  const handleNavLinkClick = () => {
    trackEvent({
      action: 'Header_Logo_Click',
      category: 'User_Interactions',
      label: 'Header_Logo_NavLink',
      value: 1,
    })
  }

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
                width: isMobile ? "50px" : "75px",
                height: isMobile ? "50px" : "75px",
                marginRight: isMobile ? "0em" : "2em",
              }}
            />
            <PollinationsLogo
              style={{
                width: isMobile ? "300px" : "400px",
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
        <SocialLinks medium gap="1em" invert />
      </Box>
      </Box>

    </SectionContainer>
  )
}

export default Header
