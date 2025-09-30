import React from "react";
import {
    Box,
    Paper,
    Typography,
    Link,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import { Colors, Fonts } from "../../config/global";
import styled from "@emotion/styled";
import { trackEvent } from "../../config/analytics";

const ResponseContainer = styled(Paper)`
  padding: 20px;
  margin-bottom: 20px;
  background-color: ${Colors.offblack};
  border: 0px solid ${Colors.lime};
  border-radius: 0px;
  width: 100%;
  max-width: 1000px;
  height: 200px !important;
  min-height: 200px;
  max-height: 200px;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  cursor: pointer;

  /* Hide scrollbar for Chrome, Safari and Opera */
  &::-webkit-scrollbar {
    width: 20px;
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: transparent;
  }
  
  /* Show scrollbar on hover for Chrome, Safari and Opera */
  &:hover::-webkit-scrollbar-thumb {
    background-color: ${Colors.lime};
    border-radius: 4px;
  }
  
  /* Hide scrollbar for IE, Edge and Firefox */
  msOverflowStyle: none;  /* IE and Edge */
  scrollbarWidth: none;     /* Firefox */
  
  /* Show scrollbar on hover for Firefox */
  &:hover {
    scrollbarWidth: thin;
    scrollbarColor: ${Colors.lime}60 transparent;
    border-color: ${Colors.lime};
  }
`;

const ResponseText = styled(Typography)`
  font-family: ${Fonts.parameter};
  white-space: pre-wrap;
  word-break: break-word;
  color: ${Colors.offwhite};
  line-height: 1.3;
  overflow-wrap: break-word;
  max-width: 100%;
  font-size: 1.3em;
`;

const LabelStyle = {
    color: `${Colors.offwhite}99`,
    fontSize: "0.9em",
    fontFamily: Fonts?.parameter || "inherit",
    marginBottom: "4px",
};

/**
 * TextDisplay component renders the generated text
 * @param {Object} props - Component props
 * @param {Object} props.entry - The text entry to display
 * @param {boolean} props.isLoading - Loading state
 * @param {boolean} props.isEditMode - Edit mode state
 */
export const TextDisplay = ({ entry, isLoading, isEditMode }) => {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

    if (!entry || !entry.response) {
        return null;
    }

    // Create a URL that can be opened - using the entry ID or a default
    // Use the full absolute URL with domain
    const responseUrl = entry.id
        ? `https://text.pollinations.ai/api/text/${entry.id}`
        : `https://text.pollinations.ai/api/textResponse?prompt=${encodeURIComponent(entry.parameters?.messages?.[1]?.content || "")}&response=${encodeURIComponent(entry.response)}`;

    const handleResponseClick = (e) => {
        e.preventDefault();
        trackEvent({
            action: "click_text_response",
            category: "text_feed",
        });
        // Ensure we're opening the absolute URL in a new tab
        window.open(responseUrl, "_blank", "noopener,noreferrer");
    };

    const ResponseContent = (
        <Box width="100%" display="flex" flexDirection="column">
            {isEditMode && <Typography sx={LabelStyle}>Response</Typography>}
            <ResponseContainer elevation={0} onClick={handleResponseClick}>
                <ResponseText
                    variant="body1"
                    sx={{ opacity: isLoading ? 0.7 : 1 }}
                >
                    {entry.response}
                </ResponseText>
            </ResponseContainer>
        </Box>
    );

    return (
        <Box
            display="flex"
            justifyContent="center"
            width="100%"
            sx={{
                maxWidth: "1000px",
            }}
        >
            {isDesktop
                ? <Link
                      href={responseUrl}
                      target="_blank"
                      rel="noopener"
                      onClick={handleResponseClick}
                      underline="none"
                      sx={{ width: "100%" }}
                  >
                      {ResponseContent}
                  </Link>
                : ResponseContent}
        </Box>
    );
};
