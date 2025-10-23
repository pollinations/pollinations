import React, { useState, useEffect } from "react";
import { makeStyles } from "@mui/styles";
import { Box } from "@mui/material";

import { Colors, Fonts, SectionBG } from "../config/global";
import {
    projects,
    categories as projectCategories,
} from "../config/projectList";
import {
    PROJECT_TITLE,
    PROJECT_SUBTITLE,
    PROJECT_CTO_1,
    // PROJECT_CTO_2,
    PROJECT_BUTTON,
} from "../config/copywrite.js";
import { emojify, rephrase, noLink } from "../config/llmTransforms";

import SectionTitle from "../components/SectionTitle";
import {
    SectionContainer,
    SectionSubContainer,
    SectionHeadlineStyle,
    SectionMainContent,
} from "../components/SectionContainer";
import ProjectsRender from "../components/Project/ProjectRender";
import { GeneralButton } from "../components/GeneralButton";
import { LLMTextManipulator } from "../components/LLMTextManipulator";
import { trackEvent } from "../config/analytics";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import TabSelector from "../components/TabSelector.jsx";

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

const handleSubmitButtonClick = (e) => {
    e.preventDefault();
    // Opens project submission template (labeled as "APPS" in GitHub)
    window.open(
        "https://github.com/pollinations/pollinations/issues/new?template=project-submission.yml",
        "_blank",
    );
    trackEvent({
        action: "click_submit_project",
        category: "project",
    });
};

const Projects = () => {
    const classes = useStyles();
    const [selectedCategory, setSelectedCategory] = useState("vibeCoding");

    useEffect(() => {
        // Trigger initial category selection on component mount
        if (projectCategories.length > 0 && selectedCategory) {
            handleCategoryClick(selectedCategory);
        }
    }, []);

    const handleCategoryClick = (categoryKey) => {
        setSelectedCategory(categoryKey);
    };

    const getButtonBackgroundColor = (categoryKey) => {
        if (selectedCategory !== categoryKey) {
            return Colors.offblack;
        }
        return Colors.lime;
    };

    const getButtonTextColor = (categoryKey) => {
        if (selectedCategory === categoryKey) {
            return Colors.offblack;
        }
        return Colors.lime;
    };

    return (
        <SectionContainer id="projects" backgroundConfig={SectionBG.project}>
            <SectionSubContainer>
                <SectionTitle title={PROJECT_TITLE} />
            </SectionSubContainer>

            <SectionSubContainer>
                <SectionHeadlineStyle>
                    <LLMTextManipulator
                        text={PROJECT_CTO_1}
                        transforms={[rephrase, emojify, noLink]}
                    />
                </SectionHeadlineStyle>
            </SectionSubContainer>
            <SectionSubContainer paddingBottom="0em">
                <Box sx={{ width: "auto", height: "100px" }}>
                    <GeneralButton
                        handleClick={handleSubmitButtonClick}
                        textColor={Colors.offwhite}
                        borderColor={Colors.offwhite}
                        fontSize="2em"
                        backgroundColor={Colors.offblack}
                        style={{
                            fontSize: "1.5rem",
                            fontFamily: Fonts.title,
                            fontWeight: 600,
                        }}
                    >
                        <OpenInNewIcon
                            style={{
                                marginRight: "8px",
                                width: "32px",
                                height: "32px",
                            }}
                        />
                        {PROJECT_BUTTON}
                    </GeneralButton>
                </Box>
            </SectionSubContainer>
            <SectionSubContainer>
                <SectionHeadlineStyle>
                    <LLMTextManipulator
                        text={PROJECT_SUBTITLE}
                        transforms={[rephrase, emojify, noLink]}
                    />
                </SectionHeadlineStyle>
            </SectionSubContainer>
            <SectionSubContainer paddingBottom="4em">
                <TabSelector
                    items={projectCategories}
                    selectedKey={selectedCategory}
                    onSelectTab={handleCategoryClick}
                    trackingCategory="project"
                    trackingAction="select_project_category"
                    getButtonBackground={getButtonBackgroundColor}
                    getButtonTextColor={getButtonTextColor}
                />
                <ProjectsRender
                    projectList={projects[selectedCategory]}
                    classes={classes}
                />
            </SectionSubContainer>
        </SectionContainer>
    );
};

export default Projects;
