import React from "react"
import { Box, Typography } from "@mui/material"
import { Colors } from "../config/global"
import { SectionContainer } from "../components/SectionContainer"
import { NavLink } from "react-router-dom"

const Header = () => {
  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
      <Box
        sx={{
          gridArea: "logo",
          display: "flex",
          alignItems: { xs: "center", md: "flex-start" },
          justifyContent: { xs: "center", md: "flex-start" },
          width: "100%",
          marginLeft: { xs: "0em", md: "3em" },
          position: "relative",
        }}
      >
        <NavLink
          to="/"
          style={{
            textDecoration: "none",
          }}
        >
          <Typography
            component="div"
            style={{
              color: Colors.offblack,
              fontSize: "3em",
              fontWeight: "bold",
              userSelect: "none",
            }}
          >
            Pollinations.AI
          </Typography>
        </NavLink>
      </Box>
    </SectionContainer>
  )
}

export default Header
