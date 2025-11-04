import React, { useContext } from "react";
import { Colors, SectionBG, Fonts } from "../config/global";
import { CodeExamples } from "../components/Integrate/CodeExamples";
import {
    SectionContainer,
    SectionSubContainer,
    SectionHeadlineStyle,
    SectionMainContent,
} from "../components/SectionContainer.js";
import {
    INTEGRATE_TITLE,
    INTEGRATE_SUBTITLE,
    INTEGRATE_GITHUB_LINK,
} from "../config/copywrite";
import { rephrase, emojify, noLink } from "../config/llmTransforms.js";
import SectionTitle from "../components/SectionTitle";
import { LLMTextManipulator } from "../components/LLMTextManipulator";
import { ImageContext } from "../utils/ImageContext";
import { GeneralButton } from "../components/GeneralButton";
import { ICONS } from "../icons/icons";
import { ReactSVG } from "react-svg";
import { trackEvent } from "../config/analytics.js";

export const Integration = () => {
    const { image } = useContext(ImageContext);

    const handleGithubButtonClick = (e) => {
        e.preventDefault();
        trackEvent({
            action: "click_apidocs",
            category: "integrate",
        });
        window.open(
            "https://github.com/pollinations/pollinations/blob/main/APIDOCS.md",
            "_blank",
        );
    };

    return (
        <SectionContainer backgroundConfig={SectionBG.integration}>
            <SectionSubContainer>
                <SectionTitle title={INTEGRATE_TITLE} />
            </SectionSubContainer>
            <SectionSubContainer>
                <SectionHeadlineStyle>
                    <LLMTextManipulator
                        text={INTEGRATE_SUBTITLE}
                        transforms={[rephrase, emojify, noLink]}
                    />
                </SectionHeadlineStyle>
            </SectionSubContainer>
            <SectionSubContainer>
                <GeneralButton
                    handleClick={handleGithubButtonClick}
                    isLoading={false}
                    backgroundColor={Colors.offblack2}
                    textColor={Colors.offwhite}
                    borderColor={Colors.offwhite}
                    style={{
                        fontSize: "1.5rem",
                        fontFamily: Fonts.title,
                        fontWeight: 600,
                    }}
                >
                    <ReactSVG
                        src={ICONS.github}
                        beforeInjection={(svg) => {
                            svg.setAttribute("fill", Colors.offwhite);
                        }}
                        style={{
                            width: "32px",
                            height: "32px",
                            marginRight: "1em",
                            background: "transparent",
                        }}
                    />
                    {INTEGRATE_GITHUB_LINK}
                </GeneralButton>
            </SectionSubContainer>
            <SectionSubContainer paddingBottom="4em">
                <CodeExamples image={image} />
            </SectionSubContainer>
        </SectionContainer>
    );
};
