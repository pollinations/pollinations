import { useState, useLayoutEffect } from "react"
import { AppBar, ButtonGroup, Button, Box, IconButton } from "@material-ui/core"
import { CodeBlock } from "react-code-blocks"
import { URLExplanation } from "../ImageHeading"
import { Colors } from "../../config/global"
import { usePollinationsText } from "@pollinations/react"
import useRandomSeed from "../../hooks/useRandomSeed"
import React from "react";
import { SectionBgBox } from "../SectionBgBox"
import FileCopyIcon from '@material-ui/icons/FileCopy'
import CODE_EXAMPLES from '../../config/codeExamplesText';


// Common styles
const buttonStyle = (isActive) => ({
  backgroundColor: isActive ? Colors.lime : "transparent",
  color: isActive ? Colors.offblack : Colors.lime,
  fontSize: '1.3rem',
  fontFamily: 'Uncut-Sans-Variable',
  fontStyle: 'normal',
  fontWeight: 600,
  height: "60px",
  position: "relative",
  margin: "0.5em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  letterSpacing: "0.1em",
  borderRadius: "5px",
  padding: "0 1em",
  whiteSpace: "nowrap",
  border: `1px solid ${Colors.lime}`,
});

export function CodeExamples({ image = {} }) {
  const [tabValue, setTabValue] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useLayoutEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const codeExampleTabs = Object.keys(CODE_EXAMPLES);

  const seed = useRandomSeed();
  const markdownText = usePollinationsText(
    "Rephrase with emojis and simplify: 'Learn more on GitHub'",
    { seed }
  );

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    alert("Code copied to clipboard!");
  };

  // Default values for when image is not available
  const defaultImage = {
    prompt: "A beautiful landscape",
    width: 1024,
    height: 1024,
    seed: 42,
    model: "flux",
    imageURL: "https://image.thot.ai/prompt/A%20beautiful%20landscape"
  };

  // Use either the provided image or default values
  const imageToUse = image?.imageURL ? image : defaultImage;

  return (
    <URLExplanation style={{ margin: "0 auto", maxWidth: "1000px" }}>
      <AppBar
        position="static"
        style={{ color: "white", width: "auto", boxShadow: "none" }}
      >
        <ButtonGroup
          variant="contained"
          aria-label="contained primary button group"
          style={{ backgroundColor: "transparent", flexWrap: "wrap", justifyContent: "center", boxShadow: "none" }}
        >
          {codeExampleTabs.map((key, index) => (
            <Button
              key={key}
              onClick={() => handleChange(null, index)}
              style={buttonStyle(tabValue === index)}
            >
              {key}
            </Button>
          ))}
        </ButtonGroup>
      </AppBar>
      <>
        {codeExampleTabs.map((key, index) => {
          if (tabValue !== index) return null;

          const { code, language } = CODE_EXAMPLES[key];
          const text = code(imageToUse);

          return (
            <Box key={key} position="relative">
              <SectionBgBox style={{padding: "10px", marginTop: "1em"}}>
              <CodeBlock
                text={text}
                language={language}
                showLineNumbers={text.split("\n").length > 1}
                customStyle={{
                  backgroundColor: "transparent",
                  color: Colors.offwhite,
                  width: "100%",
                  height: "auto",
                  border: `0px`,
                  paddingTop: "0px",
                  paddingBottom: "0px",
                  boxShadow: "none",
                  overflowX: "hidden", // Prevent horizontal overflow
                }}
              />
              </SectionBgBox>
              <IconButton
                onClick={() => handleCopy(text)}
                style={{
                  position: "absolute",
                  top: 15,
                  right: 15,
                  color: Colors.lime,
                  marginRight: "10px",
                }}
              >
                <FileCopyIcon fontSize="large" />
              </IconButton>
            </Box>
          );
        })}
      </>
    </URLExplanation>
  );
}

