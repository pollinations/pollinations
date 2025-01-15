import React, { useState } from "react";
import { makeStyles } from "@mui/styles";

import { Colors } from "../config/global";
import { projects } from "../config/projectList";
import {
  PROJECT_TITLE,
  PROJECT_SUBTITLE,
  PROJECT_CTO_1,
  PROJECT_CTO_2,
  PROJECT_BUTTON,
} from "../config/copywrite";

import CopyEmailButton from "../components/CopyEmailButton";
import SectionTitle from "../components/SectionTitle";
import SectionSubtitle from "../components/SectionSubtitle";
import { SectionContainer, SectionSubContainer, SectionBgBox } from "../components/SectionContainer";
import ProjectsRender from "../components/Project/ProjectRender";
import { CodeTypeSelector } from "../components/Project/ProjectMenuButtons";

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
}));

const Projects = () => {
  const classes = useStyles();
  const [selectedCategory, setSelectedCategory] = useState("apps");

  return (
    <SectionContainer style={{ backgroundColor: Colors.offblack }}>
      <SectionSubContainer>
        <SectionTitle title={PROJECT_TITLE} />
        <SectionSubtitle subtitle={PROJECT_SUBTITLE} />
        <CodeTypeSelector
          setSelectedCategory={setSelectedCategory}
          selectedCategory={selectedCategory}
        />
        <SectionBgBox style={{ padding: "2em" }}>
          <ProjectsRender
            projectList={projects[selectedCategory]}
            classes={classes}
          />
        </SectionBgBox>
        <SectionSubtitle subtitle={PROJECT_CTO_1} />
        <SectionSubtitle subtitle={PROJECT_CTO_2} />
        <CopyEmailButton buttonText={PROJECT_BUTTON}/>
      </SectionSubContainer>
    </SectionContainer>
  );
};

export default Projects;
