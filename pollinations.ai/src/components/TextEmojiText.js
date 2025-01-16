import React from "react"
import { Typography } from "@mui/material"
import { Colors } from "../config/global"
import { TextRephraseTranslate } from "./TextRephraseTranslate"

function TextEmojiText({
  subtitle,
  color = Colors.offwhite,
  textAlign = "center",
  size = "1.8em",
  sx = {},
}) {
  return (
    <Typography
      component="div" 
      sx={{
        color: color,
        fontSize: size,
        maxWidth: "750px",
        textAlign: textAlign,
        ...sx,
        '& a': {
          color: Colors.yellow, // Apply yellow color to links
        },
      }}
    >
      <TextRephraseTranslate>{subtitle}</TextRephraseTranslate>
    </Typography>
  )
}

export default TextEmojiText
