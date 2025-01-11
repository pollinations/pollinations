import React from "react"
import { Button } from "@mui/material"
import FileCopyIcon from "@material-ui/icons/FileCopy"
import { Colors } from "../config/global"

const CopyEmailButton = () => {
  const handleLinkClick = (e) => {
    e.preventDefault()
    const link = e.currentTarget.textContent
    navigator.clipboard.writeText(link).then(() => {
      console.log(`Copied to clipboard: ${link}`)
    })
  }

  return (
    <Button
      onClick={handleLinkClick}
      sx={{
        color: Colors.offblack,
        userSelect: "none",
        fontFamily: "Uncut-Sans-Variable, sans-serif",
        fontWeight: "bold",
        lineHeight: "40px",
        fontSize: { xs: "20px", sm: "28px" },
        backgroundColor: `${Colors.lime}`,
        borderRadius: "5px",
        padding: "0.3em 0.6em",
        "&:hover": {
          backgroundColor: `${Colors.lime}90`,
        },
      }}
    >
      <FileCopyIcon fontSize="large" style={{ marginRight: "0.5em" }} />
      hello@thot-labs.com
    </Button>
  )
}

export default CopyEmailButton 