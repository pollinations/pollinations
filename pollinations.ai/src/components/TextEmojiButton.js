import React from "react"
import Button from "@mui/material/Button"
import { Colors } from "../config/global"
import { EmojiRephrase } from "./EmojiRephrase"

const TextEmojiButton = ({ onClick, subtitle, textColor, textSize, backgroundColor }) => {
  return (
    <Button
      onClick={onClick}
      sx={{
        userSelect: "none",
        backgroundColor: `${backgroundColor}`,
        borderRadius: "15px",
        display: "flex",
        fontSize: textSize,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-end",
        width: "100%",
        color: textColor,
        "&:hover": {
          backgroundColor: `${backgroundColor}90`,
        },
      }}
    >
      <EmojiRephrase  >{subtitle}</EmojiRephrase>
    </Button>
  )
}

export default TextEmojiButton
