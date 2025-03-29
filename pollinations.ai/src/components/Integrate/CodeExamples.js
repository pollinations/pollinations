import { useState } from "react"
import { Box, IconButton } from "@mui/material"
import { CodeBlock, paraisoDark } from "react-code-blocks"
import { Colors, Fonts } from "../../config/global"
import React from "react"
import FileCopyIcon from "@mui/icons-material/FileCopy"
import CODE_EXAMPLES from "../../config/codeExamplesText"
import { SectionSubContainer } from "../SectionContainer"
import { trackEvent } from "../../config/analytics"
import TabSelector from "../TabSelector"

export function CodeExamples({ image = {} }) {
  const [tabValue, setTabValue] = useState(0)
  const codeExampleTabs = Object.keys(CODE_EXAMPLES)

  const handleTabChange = (tabKey) => {
    const index = codeExampleTabs.indexOf(tabKey)
    if (index !== -1) {
      setTabValue(index)
    }
  }

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    console.log("Code copied to clipboard!")
  }

  // Default values for when image is not available
  const defaultImage = {
    prompt: "A beautiful landscape",
    width: 1024,
    height: 1024,
    seed: 42,
    model: "flux",
    imageURL: "https://image.pollinations.ai/prompt/A%20beautiful%20landscape",
  }

  // Use either the provided image or default values
  const imageToUse = image?.imageURL ? image : defaultImage

  return (
    <SectionSubContainer style={{ backgroundColor: "transparent", paddingBottom: "0em" }}>
      <TabSelector 
        items={codeExampleTabs}
        selectedKey={codeExampleTabs[tabValue]}
        onSelectTab={handleTabChange}
        trackingCategory="integrate"
        trackingAction="select_code_category"
      />
      
      <>
        {codeExampleTabs.map((key, index) => {
          if (tabValue !== index) return null

          const { code, language } = CODE_EXAMPLES[key]
          const text = code(imageToUse)

          return (
            <Box key={key} position="relative" style={{ width: "100%" }}>
              <SectionSubContainer
                paddingBottom="0em"
                style={{ backgroundColor: `${Colors.offblack}60` }}
              >
                <CodeBlock
                  text={text}
                  language={language}
                  showLineNumbers={text.split("\n").length > 1}
                  theme={paraisoDark}
                  customStyle={{
                    backgroundColor: "transparent",
                    color: Colors.offwhite,
                    width: "100%",
                    height: "auto",
                    border: `0px`,
                    paddingTop: "0.5em",
                    paddingBottom: "0.5em",
                    boxShadow: "none",
                    overflowX: "hidden",
                    overflowY: "hidden",
                    fontFamily: Fonts.parameter,
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
          )
        })}
      </>
    </SectionSubContainer>
  )
}
