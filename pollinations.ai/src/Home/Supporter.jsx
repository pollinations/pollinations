import React, { useState } from "react";
import { Colors, Fonts, SectionBG } from "../config/global";
import {
    SectionContainer,
    SectionSubContainer,
    SectionHeadlineStyle,
    SectionMainContent,
} from "../components/SectionContainer";
import SectionTitle from "../components/SectionTitle";
import { LLMTextManipulator } from "../components/LLMTextManipulator";
import {
    SUPPORTER_TITLE,
    SUPPORTER_SUBTITLE,
    SUPPORTER_LOGO_STYLE,
} from "../config/copywrite";
import { rephrase, emojify, noLink } from "../config/llmTransforms";
import { SUPPORTER_LIST } from "../config/supporterList";
import StyledLink from "../components/StyledLink";
import { useTheme, useMediaQuery, Link } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { trackEvent } from "../config/analytics.js";
import { getEnterImageURL } from "../utils/enterApi";

const Supporter = () => {
    const theme = useTheme();
    const isMdUp = useMediaQuery(theme.breakpoints.up("md"));

    const imageDimension = 96;
    const seedValue = 41 + Math.floor(Math.random() * 3);

    const generateImageUrl = (name, description) => 
        getEnterImageURL({
            prompt: `${SUPPORTER_LOGO_STYLE} ${name} ${description}`,
            width: imageDimension * 3,
            height: imageDimension * 3,
            nologo: true,
            seed: seedValue,
            model: 'nanobanana'
        });

    // Helper to ensure proper protocol for external links
    const getCompanyLink = (url) => {
        if (!url) {
            return "#";
        }
        if (url.startsWith("http")) {
            return url;
        } else {
            return `https://${url}`;
        }
    };

    const handleSupporterClick = (companyName) => {
        trackEvent({
            action: "click_supporter",
            category: "supporter",
            value: companyName,
        });
    };

    // Image component with hover effect
    const SupporterImage = ({ company }) => {
        const [isHovered, setIsHovered] = useState(false);

        const imageStyle = {
            width: imageDimension,
            height: imageDimension,
            borderRadius: "15px",
            transition: "transform 0.2s ease-in-out",
            cursor: "pointer",
            transform: isHovered ? "scale(0.95)" : "scale(1)",
        };

        return (
            <Link
                href={getCompanyLink(company.url)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleSupporterClick(company.name)}
            >
                <img
                    src={generateImageUrl(
                        company.name,
                        company.description,
                        SUPPORTER_LOGO_STYLE,
                    )}
                    alt={company.name}
                    style={imageStyle}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                />
            </Link>
        );
    };

    return (
        <SectionContainer backgroundConfig={SectionBG.supporter}>
            <SectionSubContainer>
                <SectionTitle title={SUPPORTER_TITLE} />
            </SectionSubContainer>
            <SectionSubContainer>
                <SectionHeadlineStyle>
                    <LLMTextManipulator
                        text={SUPPORTER_SUBTITLE}
                        transforms={[rephrase, emojify, noLink]}
                    />
                </SectionHeadlineStyle>
            </SectionSubContainer>
            <SectionSubContainer paddingBottom="4em">
                <Grid container spacing={4}>
                    {SUPPORTER_LIST.map((company) => (
                        <Grid
                            key={company.name}
                            size={{ xs: 6, sm: 3 }}
                            style={{ textAlign: "center" }}
                        >
                            <SupporterImage company={company} />
                            <br />
                            <br />
                            <StyledLink
                                isExternal
                                href={getCompanyLink(company.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    color: Colors.lime,
                                    fontFamily: Fonts.parameter,
                                    fontSize: "1.1em",
                                }}
                                onClick={() =>
                                    handleSupporterClick(company.name)
                                }
                            >
                                <strong>{company.name}</strong>
                            </StyledLink>
                            <br />
                            {isMdUp && (
                                <span
                                    style={{
                                        color: Colors.offwhite,
                                        fontSize: "1em",
                                        fontFamily: Fonts.parameter,
                                    }}
                                >
                                    <LLMTextManipulator
                                        text={company.description}
                                        transforms={[rephrase, emojify, noLink]}
                                    />
                                </span>
                            )}
                        </Grid>
                    ))}
                </Grid>
            </SectionSubContainer>
        </SectionContainer>
    );
};

export default Supporter;
