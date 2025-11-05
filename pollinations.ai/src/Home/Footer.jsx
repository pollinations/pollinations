import { Box } from "@mui/material";
import { SocialLinks } from "../components/SocialLinks";
import { Fonts, SectionBG } from "../config/global";
import StyledLink from "../components/StyledLink";
import { SectionContainer } from "../components/SectionContainer";
import Grid from "@mui/material/Grid2";
import {
    FOOTER_INFO_1,
    FOOTER_INFO_2,
    FOOTER_TERMS_CONDITIONS_LINK,
} from "../config/copywrite";
import { noLink } from "../config/llmTransforms";
import { LLMTextManipulator } from "../components/LLMTextManipulator";
import { trackEvent } from "../config/analytics";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import { copyToClipboard } from "../utils/clipboard.js";
import { useState } from "react";

const Footer = () => {
    const theme = useTheme();
    const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
    const [copied, setCopied] = useState(false);

    const handleEmailLinkClick = (e) => {
        e.preventDefault();
        copyToClipboard("hello@pollinations.ai")
            .then(() => {
                trackEvent({
                    action: "click_email",
                    category: "footer",
                });
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch((error) => {
                console.error("Error copying email to clipboard:", error);
            });
    };

    const handleTermsLinkClick = () => {
        trackEvent({
            action: "click_terms",
            category: "footer",
        });
    };

    return (
        <SectionContainer backgroundConfig={SectionBG.footer}>
            <Box
                width="100%"
                display="flex"
                flexDirection={isMdDown ? "column" : "row"}
                justifyContent="space-between"
                padding="1em"
                gap="2em"
                marginBottom="4em"
            >
                <Grid
                    size={{ xs: 12, md: 6 }}
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isMdDown ? "center" : "flex-start",
                        gap: "1em",
                    }}
                >
                    <Box sx={{ fontSize: "1.5em", fontFamily: Fonts.title }}>
                        <StyledLink
                            isExternal
                            onClick={handleEmailLinkClick}
                            href="mailto:hello@pollinations.ai"
                            sx={{ userSelect: "text" }}
                        >
                            {copied
                                ? <b>Copied! ✅</b>
                                : <b>hello@pollinations.ai</b>}
                        </StyledLink>
                    </Box>
                    <Box>
                        <SocialLinks gap="1em" location="footer" />
                    </Box>
                </Grid>
                <Grid
                    size={{ xs: 12, md: 6 }}
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        marginTop: isMdDown ? "1em" : "0em",
                        alignItems: isMdDown ? "center" : "flex-end",
                    }}
                >
                    <Box
                        height="100%"
                        sx={{ fontSize: "1.5em", fontFamily: Fonts.title }}
                    >
                        <StyledLink 
                            to="/terms" 
                            onClick={handleTermsLinkClick}
                        >
                            <LLMTextManipulator
                                text={FOOTER_TERMS_CONDITIONS_LINK}
                                transforms={[noLink]}
                            />
                        </StyledLink>
                    </Box>
                    <Box
                        sx={{
                            fontSize: "1.2em",
                            fontFamily: Fonts.title,
                            width: "100%",
                            textAlign: isMdDown ? "center" : "right",
                            marginTop: "0.5em",
                        }}
                    >
                        <LLMTextManipulator
                            text={FOOTER_INFO_1}
                            transforms={[noLink]}
                        />
                        <LLMTextManipulator
                            text={FOOTER_INFO_2}
                            transforms={[noLink]}
                        />
                    </Box>
                </Grid>
            </Box>
        </SectionContainer>
    );
};

export default Footer;
