import React, { useState } from "react";
import styled from "@emotion/styled";
import { Link } from "@mui/material";
import { SOCIAL_LINKS } from "../config/socialLinksList";
import { Colors } from "../config/global";
import { trackEvent } from "../config/analytics";
import { ReactSVG } from "react-svg";

// Container styling
const SocialLinksContainer = styled("div")(({ gap }) => ({
    gridArea: "social",
    display: "flex",
    alignItems: "center",
    gap: gap || "0em",
}));

const LinkItem = styled(Link, {
    // Prevent forwarding isHovered to the DOM
    shouldForwardProp: (prop) => !["isHovered", "invert"].includes(prop),
})(({ isHovered }) => ({
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: "50%",
    border: `2px solid ${Colors.offblack}`,
    backgroundColor: isHovered ? Colors.offblack : "transparent",
    width: "40px",
    height: "40px",
    transition: "all 0.6s ease",
    textDecoration: "none",
}));

// Replacing the <img> with a Styled ReactSVG to control the svg fill dynamically
const StyledReactSVG = styled(ReactSVG, {
    shouldForwardProp: (prop) => !["isHovered", "invert"].includes(prop),
})(({ isHovered }) => ({
    "& svg": {
        fill: isHovered ? Colors.offwhite : Colors.offblack,
        transition: "fill 0.6s ease",
        width: "100%",
        height: "100%",
    },
}));

export const SocialLinks = ({ gap, location, invert }) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const handleLinkClick = (platform) => {
        trackEvent({
            action: `click_social_link`,
            category: location,
            value: platform,
        });
    };

    return (
        <SocialLinksContainer gap={gap}>
            {Object.keys(SOCIAL_LINKS).map((platform, index) => {
                const isHovered = hoveredIndex === index;
                const { url, icon, width, height } = SOCIAL_LINKS[platform];
                return (
                    <LinkItem
                        key={`plt_link_${url}`}
                        href={url}
                        target="_blank"
                        title={platform}
                        isHovered={isHovered}
                        invert={invert}
                        onMouseEnter={() => setHoveredIndex(index)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        onClick={() => handleLinkClick(platform)}
                    >
                        <StyledReactSVG
                            src={icon}
                            isHovered={isHovered}
                            invert={invert}
                            wrapper="span"
                            aria-label={`${platform}-icon`}
                            style={{ width, height }}
                        />
                    </LinkItem>
                );
            })}
        </SocialLinksContainer>
    );
};
