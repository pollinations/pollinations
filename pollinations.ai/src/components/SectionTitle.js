import React from "react"
import { Typography, useMediaQuery } from "@mui/material"
import { Colors } from "../config/global"

function SectionTitle({ title, color = Colors.lime }) {
  const isSmallScreen = useMediaQuery("(max-width:600px)")
  const fontSize = isSmallScreen ? "6em" : "8em"
  return (
    <Typography
      component="div"
      style={{
        color: color,
        fontSize: fontSize,
        fontWeight: "bold",
        marginTop: "0.5em",
        userSelect: "none",
        letterSpacing: "0.1em",
        textAlign: "center",
      }}
    >
      {title}
    </Typography>
  )
}

export default SectionTitle
