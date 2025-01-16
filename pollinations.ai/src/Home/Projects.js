import React, { useState } from "react"
import { makeStyles } from "@mui/styles"

import { Colors } from "../config/global"
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
import { SectionContainer, SectionSubContainer, SectionBgBox } from "../components/SectionContainer"
import ProjectsRender from "../components/Project/ProjectRender"
import { CodeTypeSelector } from "../components/Project/ProjectMenuButtons"
import TextEmojiButton from "../components/TextEmojiButton"
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
        <TextEmojiText subtitle={PROJECT_SUBTITLE} />
        <CodeTypeSelector
          setSelectedCategory={setSelectedCategory}
          selectedCategory={selectedCategory}
        />
        <SectionBgBox style={{ padding: "2em" }} backgroundcolor={Colors.offblack}>
          <ProjectsRender projectList={projects[selectedCategory]} classes={classes} />
        </SectionBgBox>
        <TextEmojiText subtitle={PROJECT_CTO_1} />
        <TextEmojiText subtitle={PROJECT_CTO_2} />
        <Box sx={{ width: "auto", height: "100px" }}>
          <TextEmojiButton
            subtitle={PROJECT_BUTTON}
            onClick={handleEmailButtonClick}
            textColor={Colors.lime}
            borderColor={Colors.offwhite}
            textSize="2em"
            backgroundColor={`${Colors.offblack}`}
          />
        </Box>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Projects
