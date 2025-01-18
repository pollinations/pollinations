import React from "react"
import { Box } from "@mui/material"
import { Colors } from "../config/global"
import { SectionContainer } from "../components/SectionContainer"
import { NavLink } from "react-router-dom"
import { SocialLinks } from "../components/SocialLinks"
import { ReactComponent as PollinationsLogo } from "../assets/logo/logo-text.svg"
import { ReactComponent as LogoIconBlack } from "../assets/logo/logo-icon-black.svg"

const Header = () => {
  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          justifyContent: { xs: "center", md: "space-between" },
          alignItems: "center",
          width: "100%",
          padding: { xs: "1em 1em", md: "0 3em" },
          position: "relative",
          gap: "1em",
        }}
      >
        <NavLink
          to="/"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
          }}
        >
          <LogoIconBlack width={100} height="auto" style={{ marginRight: "2em" }} />
          <PollinationsLogo
            width={{ xs: 300, md: 500 }}
            height={{ xs: 80, md: 130 }}
          />
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
