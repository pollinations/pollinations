import React from "react"
import Button from "@mui/material/Button"
import { Colors } from "../config/global"
import TextEmojiText from "./TextEmojiText"
import { EmojiRephrase } from "./EmojiRephrase"

const FollowLinkButton = ({ onClick, subtitle }) => {
  return (
    <Button
      onClick={onClick}
      sx={{
        userSelect: "none",
        backgroundColor: `${Colors.lime}`,
        borderRadius: "15px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-end",
        width: "100%" ,
        "&:hover": {
          backgroundColor: `${Colors.lime}90`,
        },
      }}
    >

      <TextEmojiText
        color={Colors.offblack}
        subtitle={subtitle}
        size={"1.8em"}
      />
      <EmojiRephrase>{subtitle}</EmojiRephrase>
    </Button>
  )
}

export default FollowLinkButton 