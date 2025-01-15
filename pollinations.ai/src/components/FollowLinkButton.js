import React from "react"
import Button from "@mui/material/Button"
import { Colors } from "../config/global"
import SectionSubtitle from "./SectionSubtitle"
import AsciiArtGenerator from "./AsciiArtGenerator"
import { Box } from "@mui/material"

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

      <SectionSubtitle
        color={Colors.offblack}
        subtitle={subtitle}
        size={"1.8em"}
      />
    </Button>
  )
}

export default FollowLinkButton 