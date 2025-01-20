import React, { useState } from "react"
import { makeStyles } from "@mui/styles"

import { Colors, Fonts } from "../config/global"
import { projects } from "../config/projectList"
import {
  PROJECT_TITLE,
  PROJECT_SUBTITLE,
  PROJECT_CTO_1,
  PROJECT_CTO_2,
  PROJECT_BUTTON,
} from "../config/copywrite"

import SectionTitle from "../components/SectionTitle"
import TextEmojiText from "../components/TextEmojiText"
import { SectionContainer, SectionSubContainer } from "../components/SectionContainer"
import { TextRephraseTranslate } from "../components/TextRephraseTranslate"
import ProjectsRender from "../components/Project/ProjectRender"
import { GeneralButton } from "../components/GeneralButton"
import { Box } from "@mui/material"

const useStyles = makeStyles(() => ({
  gridContainer: {
    justifyContent: "center",
  },
  gridItem: {
    padding: "8px 16px",
    fontSize: "1.1em",
    display: "flex",
    alignItems: "center",
  },
}))

const handleEmailButtonClick = (e) => {
  e.preventDefault()
  const email = "hello@pollinations.ai"
  navigator.clipboard.writeText(email).then(() => {
    console.log(`Copied to clipboard: ${email}`)
  })
}

const Projects = () => {
  const classes = useStyles()
  const [selectedCategory, setSelectedCategory] = useState("apps")

  return (
    <SectionContainer style={{ backgroundColor: Colors.offblack }}>
      <SectionSubContainer>
        <SectionTitle title={PROJECT_TITLE} />
      </SectionSubContainer>
      <SectionSubContainer>
        <TextEmojiText subtitle={PROJECT_SUBTITLE} />
      </SectionSubContainer>
      <SectionSubContainer>
        <ProjectsRender projectList={projects[selectedCategory]} classes={classes} />
      </SectionSubContainer>
      <SectionSubContainer>
        <TextEmojiText subtitle={PROJECT_CTO_1} />
      </SectionSubContainer>
      <SectionSubContainer>
        <TextEmojiText subtitle={PROJECT_CTO_2} />
        <Box sx={{ width: "auto", height: "100px" }}>
          <GeneralButton
            onClick={handleEmailButtonClick}
            textColor={Colors.lime}
            borderColor={Colors.offwhite}
            fontSize="2em"
            backgroundColor={Colors.offblack}
            style={{
              width: "100%",
              fontSize: "1.8rem",
              fontFamily: Fonts.body,
              fontWeight: 600,
              marginTop: "1em",
            }}
          >
            <TextRephraseTranslate>{PROJECT_BUTTON}</TextRephraseTranslate>
          </GeneralButton>
        </Box>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Projects
