import React from "react";
import styled from "@emotion/styled"; // Added to style our ReactSVG icon
import { Box, useTheme } from "@mui/material";
import { SectionBG, Colors, Fonts } from "../config/global";
import { SectionContainer } from "../components/SectionContainer";
import { NavLink } from "react-router-dom";
import { SocialLinks } from "../components/SocialLinks";
import PollinationsLogo from "../logo/logo-text.svg?react";
import { useMediaQuery } from "@mui/material";
import { trackEvent } from "../config/analytics";
import { GeneralButton } from "../components/GeneralButton";
import { ICONS } from "../icons/icons.js"; // Import the ICONS map
import { ReactSVG } from "react-svg";

// Styled icon component to control fill color
const AboutUsIcon = styled(ReactSVG)(() => ({
    width: "20px",
    height: "20px",
    marginRight: "0.5em",
    color: Colors.offblack,
    "& svg": {
        fill: Colors.offblack,
        transition: "fill 0.6s",
    },
}));

// About Us button with hover styles - psychedelic design
const AboutUsButton = styled(GeneralButton)(() => ({
    fontSize: "1em",
    fontFamily: Fonts.title,
    fontWeight: 600,
    marginRight: "1em",
    borderRadius: "3em",
    height: "40px",
    minHeight: "40px",
    display: "flex",
    alignItems: "center",
    minWidth: "150px",
    border: "3px solid #ff61d8",
    color: "#000000",
    background: "white",
    boxShadow: "0 2px 8px rgba(255, 97, 216, 0.2)",
    transition: "all 0.3s ease",
    animation: "button-border-shift 8s infinite linear",
    "@keyframes button-border-shift": {
        "0%": { borderColor: "#ff61d8" },
        "33%": { borderColor: "#05ffa1" },
        "66%": { borderColor: "#ffcc00" },
        "100%": { borderColor: "#ff61d8" },
    },
    "& svg path": {
        transition: "fill 0.3s",
    },
    "&:hover": {
        color: "white",
        background: "linear-gradient(135deg, #ff61d8, #05ffa1, #ffcc00)",
        backgroundSize: "300% 300%",
        animation: "button-border-shift 8s infinite linear, gradient-shift 3s ease infinite",
        transform: "translateY(-2px)",
        boxShadow: "0 4px 12px rgba(255, 97, 216, 0.4)",
        "& svg path": {
            fill: "white",
        },
    },
    "@keyframes gradient-shift": {
        "0%": { backgroundPosition: "0% 50%" },
        "50%": { backgroundPosition: "100% 50%" },
        "100%": { backgroundPosition: "0% 50%" },
    },
}));

const Header = () => {
    const theme = useTheme(); // Use the useTheme hook to access the theme
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    const handleNavLinkClick = () => {
        trackEvent({
            action: "click_home_logo",
            category: "header",
        });
    };

    const handleAboutUsClick = (e) => {
        e.preventDefault();
        trackEvent({
            action: "click_linkedin",
            category: "header",
        });
        window.open(
            "https://www.linkedin.com/company/pollinations-ai",
            "_blank",
        );
    };

    return (
        <SectionContainer backgroundConfig={SectionBG.header}>
            <Box
                sx={{
                    display: "flex",
                    flexDirection: { xs: "column-reverse", md: "row" },
                    alignItems: "center",
                    gap: "2em",
                    justifyContent: { xs: "center", md: "space-between" },
                    width: "100%",
                    position: "relative",
                    paddingBottom: "2em",
                    paddingTop: "1em",
                    borderBottom: "4px solid #ff61d8",
                    animation: "header-border-shift 10s infinite linear",
                    "@keyframes header-border-shift": {
                        "0%": { borderBottomColor: "#ff61d8" },
                        "33%": { borderBottomColor: "#05ffa1" },
                        "66%": { borderBottomColor: "#ffcc00" },
                        "100%": { borderBottomColor: "#ff61d8" },
                    },
                }}
            >
                <NavLink
                    to="/"
                    onClick={handleNavLinkClick}
                    style={{
                        textDecoration: "none",
                    }}
                >
                    <PollinationsLogo
                        style={{
                            width: isMobile ? "300px" : "350px",
                            height: isMobile ? "auto" : "auto",
                            filter: "invert(1)",
                        }}
                    />
                </NavLink>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                    }}
                >
                    <AboutUsButton
                        handleClick={handleAboutUsClick}
                        isLoading={false}
                    >
                        <AboutUsIcon
                            src={ICONS.linkedin}
                            wrapper="span"
                            aria-label="linkedin-icon"
                        />
                        About Us
                    </AboutUsButton>
                    <SocialLinks medium gap="1em" invert location="header" />
                </Box>
            </Box>
        </SectionContainer>
    );
};

export default Header;
