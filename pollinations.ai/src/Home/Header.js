import React from "react"
import { Box } from "@mui/material"
import { Colors } from "../config/global"
import { SectionContainer } from "../components/SectionContainer"
import { NavLink } from "react-router-dom"
import { SocialLinks } from "../components/SocialLinks"
import { ImageHeading } from "../components/ImageHeading"
import { HEADER_LOGO } from "../config/copywrite"

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
        }}
      >
        <NavLink
          to="/"
          style={{
            textDecoration: "none",
          }}
        >
          <ImageHeading whiteText={false} width={400} height={100}>
            {HEADER_LOGO}
          </ImageHeading>
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
