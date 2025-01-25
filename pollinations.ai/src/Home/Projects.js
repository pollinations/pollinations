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
import {
  translate,
  oneSentence,
  emojify
} from "../config/llmTransforms"

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
import ContentCopyIcon from "@mui/icons-material/ContentCopy"

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
  trackEvent({
    action: "Email_Button_Click",
    category: "User_Interactions",
    label: "Projects_Email_Button",
    value: 1,
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
          <LLMTextManipulator text={PROJECT_SUBTITLE} transforms={[translate, oneSentence]} />
        </SectionHeadlineStyle>
      </SectionSubContainer>
      <SectionSubContainer>
        <ProjectsRender projectList={projects[selectedCategory]} classes={classes} />
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator text={PROJECT_CTO_1} transforms={[translate, oneSentence]} />
        </SectionHeadlineStyle>
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator text={PROJECT_CTO_2} transforms={[translate, emojify]} />
        </SectionHeadlineStyle>
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
              fontFamily: Fonts.title,
              fontWeight: 600,
              marginTop: "1em",
            }}
          >
            <ContentCopyIcon style={{ marginRight: "8px", width: "32px", height: "32px" }} />
            {PROJECT_BUTTON}
          </GeneralButton>
        </Box>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Projects
