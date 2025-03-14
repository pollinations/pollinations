import React, { useState } from "react"
import { makeStyles } from "@mui/styles"

import { Colors, Fonts, SectionBG } from "../config/global"
import { projects } from "../config/projectList"
import {
  PROJECT_TITLE,
  PROJECT_SUBTITLE,
  PROJECT_CTO_1,
  PROJECT_CTO_2,
  PROJECT_BUTTON,
} from "../config/copywrite"
import { emojify, rephrase, noLink } from "../config/llmTransforms"

import SectionTitle from "../components/SectionTitle"
import {
  SectionContainer,
  SectionSubContainer,
  SectionHeadlineStyle,
} from "../components/SectionContainer"
import ProjectsRender from "../components/Project/ProjectRender"
import { GeneralButton } from "../components/GeneralButton"
import { Box } from "@mui/material"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import { trackEvent } from "../config/analytics"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"

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

const handleSubmitButtonClick = (e) => {
  e.preventDefault()
  window.open(
    "https://github.com/pollinations/pollinations/issues/new?template=project-submission.yml",
    "_blank"
  )
  trackEvent({
    action: "click_submit_project",
    category: "project",
  })
}

const Projects = () => {
  const classes = useStyles()
  const [selectedCategory, setSelectedCategory] = useState("apps")

  return (
    <SectionContainer backgroundConfig={SectionBG.project}>
      <SectionSubContainer>
        <SectionTitle title={PROJECT_TITLE} />
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator text={PROJECT_SUBTITLE} transforms={[rephrase, emojify, noLink]} />
        </SectionHeadlineStyle>
      </SectionSubContainer>
      <SectionSubContainer>
        <ProjectsRender projectList={projects[selectedCategory]} classes={classes} />
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator text={PROJECT_CTO_1} transforms={[rephrase, emojify, noLink]} />
        </SectionHeadlineStyle>
      </SectionSubContainer>
      <SectionSubContainer>
        <Box sx={{ width: "auto", height: "100px" }}>
          <GeneralButton
            onClick={handleSubmitButtonClick}
            textColor={Colors.lime}
            borderColor={Colors.offwhite}
            fontSize="2em"
            backgroundColor={Colors.offblack}
            style={{
              fontSize: "1.5rem",
              fontFamily: Fonts.title,
              fontWeight: 600,
            }}
          >
            <OpenInNewIcon style={{ marginRight: "8px", width: "32px", height: "32px" }} />
            {PROJECT_BUTTON}
          </GeneralButton>
        </Box>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Projects
