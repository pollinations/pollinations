/* Start of Selection */
import { useState } from "react"
import { AppBar, ButtonGroup, Box, IconButton } from "@mui/material"
import { CodeBlock } from "react-code-blocks"
import { Colors } from "../../config/global"
import { usePollinationsText } from "@pollinations/react"
import useRandomSeed from "../../hooks/useRandomSeed"
import React from "react";
import FileCopyIcon from '@mui/icons-material/FileCopy'
import CODE_EXAMPLES from '../../config/codeExamplesText';
import { SectionSubContainer } from "../SectionContainer"
import { GeneralButton } from "../GeneralButton"



export function CodeExamples({ image = {} }) {
  const [tabValue, setTabValue] = useState(0);

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
    imageURL: "https://image.pollinations.ai/prompt/A%20beautiful%20landscape"
  };

  // Use either the provided image or default values
  const imageToUse = image?.imageURL ? image : defaultImage;

  return (
    <SectionSubContainer style={{ backgroundColor: "transparent", paddingBottom: "0em" }} >
      <AppBar
        position="static"
        style={{ backgroundColor: "transparent", boxShadow: "none" }}
      >
        <ButtonGroup
          aria-label="contained primary button group"
          style={{ backgroundColor: "transparent", flexWrap: "wrap", justifyContent: "space-between", boxShadow: "none" }}
        >
          {codeExampleTabs.map((key, index) => (
            <GeneralButton
              key={key}
              handleClick={() => handleChange(null, index)}
              backgroundColor={tabValue === index ? Colors.lime : "transparent"}
              textColor={tabValue === index ? Colors.offblack : Colors.lime}
              fontSize="1.3rem"
              style={{
                fontStyle: "normal",
                fontWeight: 600,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {key}
            </GeneralButton>
          ))}
        </ButtonGroup>
      </AppBar>
      <>
        {codeExampleTabs.map((key, index) => {
          if (tabValue !== index) return null;

          const { code, language } = CODE_EXAMPLES[key];
          const text = code(imageToUse);

          return (
            <Box key={key} position="relative" style={{ width: "100%" }}>
              <SectionSubContainer style={{ backgroundColor: Colors.offblack2 }}>
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
                    overflowX: "auto", 
                    wordWrap: "break-word",
                    wrapLongLines: true,
                  }}
                />
              <IconButton
                onClick={() => handleCopy(text)}
                style={{
                  position: "absolute",
                  top: 15,
                  right: 15,
                  color: Colors.lime,
                  marginRight: "0.5em",
                  marginTop: "0.5em",
                }}
              >
                <FileCopyIcon fontSize="large" />
              </IconButton>
              </SectionSubContainer>

            </Box>
          );
        })}
      </>
    </SectionSubContainer>
  );
}