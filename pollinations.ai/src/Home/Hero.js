import React from "react"
import { Box, Typography } from "@mui/material"
import { Colors } from "../config/global"
import { EmojiRephrase } from "../components/EmojiRephrase"
import { SectionContainer } from "../components/SectionContainer"
import { SectionSubContainer } from "../components/SectionSubContainer"
import SectionSubtitle from "../components/SectionSubtitle"
import CopyEmailButton from "../components/CopyEmailButton"
import { HERO_INTRO , HERO_CTO, HERO_BUTTON } from "../config/copywrite"

const Hero = () => {
  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
      <SectionSubContainer>
        <Typography
          component="div"
          sx={{
            userSelect: "none",
            fontFamily: "Uncut-Sans-Variable, sans-serif",
            fontSize: { xs: "28px", sm: "32px" },
            color: Colors.offblack,
            textAlign: { xs: "center", sm: "left" },
            maxWidth: "90%",
            paddingBottom: "1em",
            paddingTop: "1em",
          }}
        >
          <EmojiRephrase>{HERO_INTRO}</EmojiRephrase>
        </Typography>
        <Box
          display="flex"
          flexDirection="column"
          alignItems={{ xs: "center", sm: "flex-end" }}
          width="100%"
          gap="1em"
          maxWidth="90%"
        >
          <SectionSubtitle subtitle={HERO_CTO} color={Colors.offblack} size="2em" />
          <CopyEmailButton buttonText={HERO_BUTTON}/>
        </Box>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Hero
