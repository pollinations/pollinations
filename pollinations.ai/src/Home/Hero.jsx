import React, { useEffect } from "react";
import { Colors, Fonts, SectionBG } from "../config/global";
import { GeneralButton } from "../components/GeneralButton";
import {
    SectionContainer,
    SectionSubContainer,
    SectionHeadlineStyle,
} from "../components/SectionContainer";
import { LLMTextManipulator } from "../components/LLMTextManipulator";
import {
    HERO_INTRO,
    HERO_CTO,
    HERO_GITHUB_LINK,
    HERO_DISCORD_LINK,
} from "../config/copywrite";
import { emojify, rephrase, noLink } from "../config/llmTransforms";
import Grid from "@mui/material/Grid2";
import { ICONS } from "../icons/icons";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { trackEvent } from "../config/analytics.js";
import { ReactSVG } from "react-svg";

const handleDiscordButtonClick = (e) => {
    e.preventDefault();
    // Track the click event
    trackEvent({
        action: "click_discord",
        category: "hero",
    });
    window.open("https://discord.gg/k9F7SyTgqn", "_blank");
};

const handleGithubButtonClick = (e) => {
    e.preventDefault();
    // Track the click event
    trackEvent({
        action: "click_github",
        category: "hero",
    });
    window.open("https://github.com/pollinations/pollinations", "_blank");
};

const handleEmailButtonClick = (e) => {
    e.preventDefault();
    // Track the click event
    trackEvent({
        action: "click_email",
        category: "hero",
    });
};

const Hero = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    useEffect(() => {
        // Check if the Ko-fi script already exists
        const kofiScriptSrc =
            "https://storage.ko-fi.com/cdn/scripts/overlay-widget.js";
        const existingScript = document.querySelector(
            `script[src="${kofiScriptSrc}"]`,
        );

        // Only add the script if it doesn't already exist
        if (!existingScript) {
            const script = document.createElement("script");
            script.src = kofiScriptSrc;
            script.async = true;
            script.onload = () => {
                // Initialize Ko-fi widget after script is loaded
                if (window.kofiWidgetOverlay) {
                    // Check if object exists before using
                    window.kofiWidgetOverlay.draw("pollinationsai", {
                        type: "floating-chat",
                        "floating-chat.donateButton.text": "Tip Us",
                        "floating-chat.donateButton.background-color":
                            "#d9534f",
                        "floating-chat.donateButton.text-color": "#fff",
                    });
                }
            };
            document.body.appendChild(script);
        } else {
            // If script exists, ensure the widget is drawn (in case component remounted after script loaded but before widget drawn)
            if (
                window.kofiWidgetOverlay &&
                typeof window.kofiWidgetOverlay.draw === "function"
            ) {
                window.kofiWidgetOverlay.draw("pollinationsai", {
                    type: "floating-chat",
                    "floating-chat.donateButton.text": "Tip Us",
                    "floating-chat.donateButton.background-color": "#d9534f",
                    "floating-chat.donateButton.text-color": "#fff",
                });
            }
        }

        // Cleanup function removed as the check prevents duplicate scripts
        // and removing might interfere if other components rely on the script
    }, []); // Empty dependency array means this effect runs once on mount
    return (
        <SectionContainer backgroundConfig={SectionBG.hero}>
            {/* <SvgArtGenerator width="1920px" height="100px"></SvgArtGenerator> */}
            <SectionSubContainer>
                <SectionHeadlineStyle
                    maxWidth="1000px"
                    fontSize="1.8em"
                    color={Colors.offblack}
                    textAlign={isMobile ? "center" : "left"}
                >
                    <LLMTextManipulator
                        text={HERO_INTRO}
                        transforms={[rephrase, emojify, noLink]}
                    />
                </SectionHeadlineStyle>
            </SectionSubContainer>
            {/* <SvgArtGallery /> */}
            <SectionSubContainer>
                <Grid
                    container
                    spacing={2}
                    justifyContent={isMobile ? "center" : "flex-end"}
                >
                    <Grid size={12}>
                        <SectionHeadlineStyle
                            maxWidth="1000px"
                            fontSize="1.5em"
                            color={Colors.offblack}
                            textAlign={isMobile ? "center" : "right"}
                        >
                            <LLMTextManipulator
                                text={HERO_CTO}
                                transforms={[rephrase, emojify, noLink]}
                            />
                        </SectionHeadlineStyle>
                    </Grid>

                    <Grid>
                        <GeneralButton
                            handleClick={handleDiscordButtonClick}
                            isLoading={false}
                            borderColor={Colors.offblack}
                            backgroundColor={Colors.offwhite}
                            textColor={Colors.offblack}
                            style={{
                                fontSize: "1.5rem",
                                fontFamily: Fonts.title,
                                fontWeight: 600,
                            }}
                        >
                            <ReactSVG
                                src={ICONS.discord}
                                beforeInjection={(svg) => {
                                    svg.setAttribute("fill", Colors.offblack);
                                }}
                                style={{
                                    width: "40px",
                                    height: "40px",
                                    marginRight: "10px",
                                    background: "transparent",
                                }}
                            />
                            <LLMTextManipulator
                                text={HERO_DISCORD_LINK}
                                transforms={[noLink]}
                            />
                        </GeneralButton>
                    </Grid>
                    <Grid>
                        <GeneralButton
                            handleClick={handleGithubButtonClick}
                            borderColor={Colors.offblack}
                            backgroundColor={Colors.offwhite}
                            isLoading={false}
                            textColor={Colors.offblack}
                            style={{
                                fontSize: "1.5rem",
                                fontFamily: Fonts.title,
                                fontWeight: 600,
                            }}
                        >
                            <ReactSVG
                                src={ICONS.github}
                                beforeInjection={(svg) => {
                                    svg.setAttribute("fill", Colors.offblack);
                                }}
                                style={{
                                    width: "32px",
                                    height: "32px",
                                    marginRight: "16px",
                                    background: "transparent",
                                }}
                            />
                            {HERO_GITHUB_LINK}
                        </GeneralButton>
                    </Grid>
                </Grid>
            </SectionSubContainer>
        </SectionContainer>
    );
};

export default Hero;
