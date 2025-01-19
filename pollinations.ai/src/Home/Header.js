
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
            display: "flex",
            alignItems: "left",
          }}
        >
          <LogoIconBlack width={100} height="auto" style={{ marginRight: "2em" }} />
          <PollinationsLogo
            width={{ xs: 300, md: 500 }}
            height={{ xs: 80, md: 130 }}
            style={{ marginTop: "5px" }}
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
