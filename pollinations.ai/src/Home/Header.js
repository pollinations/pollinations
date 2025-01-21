import React from "react"
import { Box, useTheme } from "@mui/material"
import { Colors } from "../config/global"
import { SectionContainer } from "../components/SectionContainer"
import { NavLink } from "react-router-dom"
import { SocialLinks } from "../components/SocialLinks"
import { ReactComponent as PollinationsLogo } from "../assets/logo/logo-text.svg"
import { ReactComponent as LogoIconBlack } from "../assets/logo/logo-icon-black.svg"
import { useMediaQuery } from "@mui/material"

const Header = () => {
  const theme = useTheme() // Use the useTheme hook to access the theme

  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
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
                width: "100px",
                height: "100px",
                marginRight: useMediaQuery(theme.breakpoints.down("md")) ? "0em" : "2em",
              }}
            />
            <PollinationsLogo
              style={{
                width: useMediaQuery(theme.breakpoints.down("md")) ? "300px" : "500px",
                height: useMediaQuery(theme.breakpoints.down("md")) ? "80px" : "130px",
                marginTop: "5px",
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
