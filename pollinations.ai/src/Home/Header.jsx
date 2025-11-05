import React from "react";
import { Box, useTheme } from "@mui/material";
import { SectionBG } from "../config/global";
import { SectionContainer } from "../components/SectionContainer";
import { NavLink } from "react-router-dom";
import { SocialLinks } from "../components/SocialLinks";
import PollinationsLogo from "../logo/logo-text.svg?react";
import { useMediaQuery } from "@mui/material";
import { trackEvent } from "../config/analytics";


const Header = () => {
    const theme = useTheme(); // Use the useTheme hook to access the theme
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    const handleNavLinkClick = () => {
        trackEvent({
            action: "click_home_logo",
            category: "header",
        });
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
                <SocialLinks medium gap="1em" invert location="header" />
            </Box>
        </SectionContainer>
    );
};

export default Header;
