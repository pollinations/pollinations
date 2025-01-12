import React, { useState } from "react"
import { useMediaQuery, useTheme } from "@mui/material"
import { makeStyles } from '@mui/styles';


import { Colors } from "../config/global"
import { projects } from "../config/projectText"
import {
  APPLICATION_TITLE,
  APPLICATION_SUBTITLE,
  APPLICATION_CTO_1,
  APPLICATION_CTO_2,
} from "../config/copywrite"

import CopyEmailButton from "../components/CopyEmailButton"
import SectionTitle from "../components/SectionTitle"
import SectionSubtitle from "../components/SectionSubtitle"
import { SectionContainer } from "../components/SectionContainer"
import { SectionSubContainer } from "../components/SectionSubContainer"
import { SectionBgBox } from "../components/SectionBgBox"
import { renderProjects } from "../components/Project/ProjectRender"
import { CodeTypeSelector, buttonStyle } from "../components/Project/ProjectMenuButtons"

const useStyles = makeStyles((theme) => ({
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

const Projects = () => {
  const classes = useStyles()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"))
  const [selectedCategory, setSelectedCategory] = useState("apps")

  return (
    <SectionContainer
      style={{
        background: `linear-gradient(to top, ${Colors.offblack}, ${Colors.offblack2})`,
        paddingBottom: "2em",
      }}
    >
      <SectionSubContainer>
        <SectionTitle title={APPLICATION_TITLE} />
        <SectionSubtitle subtitle={APPLICATION_SUBTITLE} />
        <CodeTypeSelector
          setSelectedCategory={setSelectedCategory}
          selectedCategory={selectedCategory}
        />
        <SectionBgBox style={{ padding: "2em" }}>
          {renderProjects(projects[selectedCategory], classes, isMobile)}
        </SectionBgBox>
        <SectionSubtitle subtitle={APPLICATION_CTO_1} />
        <SectionSubtitle subtitle={APPLICATION_CTO_2} />
        <CopyEmailButton />
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Projects
