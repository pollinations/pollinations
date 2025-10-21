import { Box } from "@mui/material";
import { SocialLinks } from "../components/SocialLinks";
import { Fonts, SectionBG } from "../config/global";
import StyledLink from "../components/StyledLink";
import { SectionContainer } from "../components/SectionContainer";
import Grid from "@mui/material/Grid2";
import { trackEvent } from "../config/analytics";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import { copyToClipboard } from "../utils/clipboard.js";
import { useState } from "react";

const Footer = () => {
    const theme = useTheme();
    const isXs = useMediaQuery(theme.breakpoints.only("xs"));
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
                sx={{
                    paddingTop: "2em",
                    borderTop: "4px solid #ff61d8",
                    animation: "footer-border-shift 10s infinite linear",
                    "@keyframes footer-border-shift": {
                        "0%": { borderTopColor: "#ff61d8" },
                        "33%": { borderTopColor: "#05ffa1" },
                        "66%": { borderTopColor: "#ffcc00" },
                        "100%": { borderTopColor: "#ff61d8" },
                    },
                }}
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
                        <StyledLink to="/terms" onClick={handleTermsLinkClick}>
                            Terms & Conditions
                        </StyledLink>
                    </Box>
                    <Box
                        sx={{
                            fontSize: "1.2em",
                            fontFamily: Fonts.title,
                            width: "100%",
                            textAlign: isXs ? "center" : "right",
                            marginTop: "0.5em",
                        }}
                    >
                        <p>© 2025 pollinations.ai</p>
                        <p>Open source AI innovation from Berlin</p>
                    </Box>
                </Grid>
            </Box>
        </SectionContainer>
    );
};

export default Footer;
