import React from "react"
import { Typography, useMediaQuery, useTheme } from "@mui/material"
import { Colors } from "../config/global"
import styled from "@emotion/styled"

function SectionTitle({ title, color = Colors.lime }) {
  const theme = useTheme()
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'))
  const fontSize = isSmallScreen ? "6em" : "8em"
  return (
    <StyledTypography
      component="div"
      color={color}
      fontSize={fontSize}
      fontWeight="bold"
      letterSpacing="0.1em"
      textAlign="center"
    >
      {title}
    </StyledTypography>
  )
}

const StyledTypography = styled(Typography)`
  ${({ theme }) => theme.breakpoints.down('md')} {
    font-size: 6em;
  }
`

export default SectionTitle
